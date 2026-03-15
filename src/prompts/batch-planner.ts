import { formatIndexForPrompt } from '../protocols/loader';
import { formatScenarioIndexForPrompt, ScenarioIndexEntry } from '../batch/scenario-index';
import { ProtocolEntry } from '../types/schema';

export function buildBatchPlannerPrompt(
  protocolIndex: ProtocolEntry[],
  scenarioIndex: ScenarioIndexEntry[]
): string {
  const protocolTable = formatIndexForPrompt(protocolIndex);
  const scenarioSummary = formatScenarioIndexForPrompt(scenarioIndex);

  return `You are a paramedic training scenario planner. Your job is to design a batch of training scenarios that provide comprehensive, well-rounded coverage of EMS protocols.

## Available Protocols

${protocolTable}

## Existing Scenarios

${scenarioSummary}

## Planning Rules

Follow this priority order when designing the batch:

1. **Gap filling first** — Identify protocols that have NO existing scenarios. Prioritize creating scenarios for uncovered protocols.
2. **Difficulty balance** — If existing scenarios skew toward one difficulty level, compensate. Aim for a mix of beginner, intermediate, and advanced.
3. **Unique before similar** — Exhaust distinct protocol combinations before creating variations of already-covered protocols.
4. **Realistic first, then complex** — Earlier entries in the plan should be straightforward clinical presentations. Later entries can introduce complications (multi-protocol scenarios, branching decision points, deteriorating patients).
5. **Demographic variety** — Vary age ranges, sex, and scene settings across the batch. Avoid repetitive patient profiles.

## Output Format

Return ONLY a valid JSON array. Each entry must have:

- "title" (string): Descriptive scenario title
- "description" (string): 1-2 sentence patient/scene sketch
- "targetProtocols" (string[]): Protocol slugs from the available protocols table
- "difficulty" (string): "beginner", "intermediate", or "advanced"
- "learningObjectives" (string[]): 2-3 key learning objectives

Return ONLY the JSON array. No markdown, no code fences, no explanation.`;
}
