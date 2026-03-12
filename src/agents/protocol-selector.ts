import Anthropic from "@anthropic-ai/sdk";
import { ProtocolEntry, ProtocolSelection } from "../types/schema";
import { readProtocol } from "../protocols/loader";
import { buildProtocolSelectorPrompt } from "../prompts/protocol-selector";

const MAX_TOOL_CALLS = 15;

interface ProgressCallback {
  onReadProtocol: (slug: string) => void;
  onDoneSelecting: (selections: ProtocolSelection[]) => void;
}

export async function selectProtocols(
  userInput: string,
  protocolIndex: ProtocolEntry[],
  apiKey: string,
  progress: ProgressCallback
): Promise<ProtocolSelection[]> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildProtocolSelectorPrompt(protocolIndex);

  const tools: Anthropic.Tool[] = [
    {
      name: "read_protocol",
      description: "Read the full content of an EMS protocol file by its slug.",
      input_schema: {
        type: "object" as const,
        required: ["slug"],
        properties: {
          slug: { type: "string", description: "The protocol slug, e.g., 'medical-hypoglycemia'" },
        },
      },
    },
    {
      name: "done_selecting",
      description: "Call when you have identified all relevant protocols.",
      input_schema: {
        type: "object" as const,
        required: ["selections"],
        properties: {
          selections: {
            type: "array",
            items: {
              type: "object",
              required: ["slug", "rationale"],
              properties: {
                slug: { type: "string" },
                rationale: { type: "string" },
              },
            },
          },
        },
      },
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userInput },
  ];

  let toolCallCount = 0;

  while (toolCallCount < MAX_TOOL_CALLS) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const textContent = response.content.find((c) => c.type === "text");
      throw new Error(
        `Protocol selector ended without calling done_selecting. Response: ${textContent ? (textContent as any).text : "none"}`
      );
    }

    const toolUseBlocks = response.content.filter((c) => c.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      throw new Error("No tool use in response");
    }

    messages.push({ role: "assistant", content: response.content });

    // Check if done_selecting is in this batch
    const doneBlock = toolUseBlocks.find((b) => b.type === "tool_use" && b.name === "done_selecting");

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;
      toolCallCount++;

      if (block.name === "read_protocol") {
        const input = block.input as { slug: string };
        progress.onReadProtocol(input.slug);
        const content = readProtocol(input.slug, protocolIndex);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: content ?? `Protocol not found: ${input.slug}`,
        });
      }

      if (block.name === "done_selecting") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Selection complete.",
        });
      }
    }

    // If done_selecting was called, return the selections
    if (doneBlock && doneBlock.type === "tool_use") {
      const input = doneBlock.input as { selections: ProtocolSelection[] };
      progress.onDoneSelecting(input.selections);
      return input.selections;
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Protocol selection exceeded maximum tool calls (${MAX_TOOL_CALLS})`);
}
