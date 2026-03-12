// src/agents/scenario-generator.ts
import Anthropic from "@anthropic-ai/sdk";
import { UnifiedScenario, ProtocolSelection, ValidationResult } from "../types/schema";
import { buildScenarioGeneratorPrompt } from "../prompts/scenario-generator";
import { validateScenario } from "../validation/validator";

const MAX_RETRIES = 3;

interface ProgressCallback {
  onGenerating: () => void;
  onValidating: () => void;
  onValidationResult: (result: ValidationResult, attempt: number) => void;
  onRetrying: (attempt: number, errors: string[]) => void;
}

export async function generateScenario(
  userInput: string,
  protocols: { slug: string; rationale: string; content: string }[],
  apiKey: string,
  progress: ProgressCallback
): Promise<{ scenario: UnifiedScenario; validation: ValidationResult }> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildScenarioGeneratorPrompt();

  const protocolContext = protocols
    .map(
      (p) =>
        `### Protocol: ${p.slug}\n**Why selected:** ${p.rationale}\n\n${p.content}`
    )
    .join("\n\n---\n\n");

  const userMessage = `## Scenario Description

${userInput}

## Relevant Protocols

${protocolContext}

## Instructions

Generate a complete unified scenario JSON based on the scenario description above and the protocols provided. Follow the schema and rules from your system prompt exactly. Return ONLY the JSON object.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    progress.onGenerating();

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in generation response");
    }

    const rawText = (textBlock as Anthropic.TextBlock).text.trim();

    let jsonText = rawText;
    const fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }

    let scenario: UnifiedScenario;
    try {
      scenario = JSON.parse(jsonText);
    } catch (parseErr) {
      if (attempt > MAX_RETRIES) {
        throw new Error(
          `Failed to parse JSON after ${MAX_RETRIES} retries. Last response: ${rawText.substring(0, 500)}`
        );
      }
      messages.push({ role: "assistant", content: rawText });
      messages.push({
        role: "user",
        content: `Your response was not valid JSON. Parse error: ${parseErr}. Please return ONLY a valid JSON object with no markdown or code fences.`,
      });
      continue;
    }

    progress.onValidating();
    const validation = validateScenario(scenario);
    progress.onValidationResult(validation, attempt);

    if (validation.valid) {
      return { scenario, validation };
    }

    if (attempt > MAX_RETRIES) {
      return { scenario, validation };
    }

    const errorMessages = validation.errors.map(
      (e) => `- ${e.path}: ${e.message}`
    );
    progress.onRetrying(attempt, errorMessages.map((e) => e));

    messages.push({ role: "assistant", content: rawText });
    messages.push({
      role: "user",
      content: `The generated JSON has validation errors. Please fix them and return the corrected JSON only:\n\n${errorMessages.join("\n")}`,
    });
  }

  throw new Error("Generation loop ended unexpectedly");
}
