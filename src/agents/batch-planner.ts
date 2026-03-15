import Anthropic from '@anthropic-ai/sdk';
import { ProtocolEntry } from '../types/schema';
import { buildBatchPlannerPrompt } from '../prompts/batch-planner';
import { ScenarioIndexEntry } from '../batch/scenario-index';

export interface BatchPlanEntry {
  title: string;
  description: string;
  targetProtocols: string[];
  difficulty: string;
  learningObjectives: string[];
}

interface PlanValidation {
  valid: boolean;
  errors: string[];
}

const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

export function validateBatchPlan(plan: BatchPlanEntry[]): PlanValidation {
  const errors: string[] = [];

  if (plan.length === 0) {
    return { valid: false, errors: ['Batch plan is empty'] };
  }

  plan.forEach((entry, i) => {
    if (!entry.title) errors.push(`Entry ${i + 1}: missing title`);
    if (!entry.description) errors.push(`Entry ${i + 1}: missing description`);
    if (!entry.targetProtocols?.length) errors.push(`Entry ${i + 1}: no target protocols`);
    if (!VALID_DIFFICULTIES.includes(entry.difficulty)) {
      errors.push(`Entry ${i + 1}: invalid difficulty "${entry.difficulty}"`);
    }
    if (!entry.learningObjectives?.length) {
      errors.push(`Entry ${i + 1}: no learning objectives`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export async function generateBatchPlan(
  protocolIndex: ProtocolEntry[],
  scenarioIndex: ScenarioIndexEntry[],
  batchSize: number,
  userConstraints: string,
  apiKey: string
): Promise<BatchPlanEntry[]> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildBatchPlannerPrompt(protocolIndex, scenarioIndex);

  let userMessage = `Generate a batch plan of exactly ${batchSize} scenarios.`;
  if (userConstraints) {
    userMessage += `\n\nUser constraints: ${userConstraints}`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in batch planner response');
  }

  const rawText = (textBlock as Anthropic.TextBlock).text.trim();

  let jsonText = rawText;
  const fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim();
  }

  const plan: BatchPlanEntry[] = JSON.parse(jsonText);
  const validation = validateBatchPlan(plan);

  if (!validation.valid) {
    throw new Error(`Invalid batch plan from AI:\n${validation.errors.join('\n')}`);
  }

  return plan;
}
