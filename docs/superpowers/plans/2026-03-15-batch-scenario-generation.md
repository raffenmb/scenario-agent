# Batch Scenario Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered batch generation mode that plans and generates multiple scenarios sequentially with awareness of protocol coverage, existing scenarios, and optional user constraints.

**Architecture:** Orchestrator pattern — a Batch Planner Agent builds the plan, a thin TypeScript orchestrator executes it by calling the existing scenario generator sequentially, passing forward context about already-generated scenarios.

**Tech Stack:** TypeScript, Anthropic Claude API, @inquirer/prompts (existing dep), existing scenario generation pipeline

**Spec:** `docs/superpowers/specs/2026-03-15-batch-scenario-generation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/batch/scenario-index.ts` | Create | Scan output/ for unified.json, extract lightweight metadata, format for prompt |
| `src/batch/scenario-index.test.ts` | Create | Unit tests for scenario indexing |
| `src/prompts/batch-planner.ts` | Create | System prompt for the batch planner agent |
| `src/agents/batch-planner.ts` | Create | Batch Planner Agent — calls Claude to build batch plan |
| `src/agents/batch-planner.test.ts` | Create | Unit tests for plan structure validation |
| `src/batch/orchestrator.ts` | Create | Coordinates batch flow: plan → approve → generate loop |
| `src/batch/orchestrator.test.ts` | Create | Unit tests for orchestration logic |
| `src/index.ts` | Modify | Add batch mode selection to generate command |

---

## Chunk 1: Scenario Index

### Task 1: Scenario Index — Types and Core Function

**Files:**
- Create: `src/batch/scenario-index.ts`
- Create: `src/batch/scenario-index.test.ts`

- [ ] **Step 1: Write the failing test for `buildScenarioIndex`**

Create `src/batch/scenario-index.test.ts`:

```typescript
import { buildScenarioIndex, ScenarioIndexEntry } from './scenario-index';
import path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../../output');

describe('buildScenarioIndex', () => {
  it('returns an array of ScenarioIndexEntry from output/', () => {
    const index = buildScenarioIndex(OUTPUT_DIR);
    expect(Array.isArray(index)).toBe(true);
    expect(index.length).toBeGreaterThan(0);
  });

  it('extracts expected fields from hypo-001', () => {
    const index = buildScenarioIndex(OUTPUT_DIR);
    const hypo = index.find((e) => e.id === 'hypo-001');
    expect(hypo).toBeDefined();
    expect(hypo!.name).toBe('Hypoglycemic Emergency with Altered Mental Status');
    expect(hypo!.difficulty).toBe('beginner');
    expect(hypo!.protocols).toContain('medical-hypoglycemia');
    expect(hypo!.learningObjectives.length).toBeGreaterThan(0);
    expect(hypo!.patientAge).toBe(67);
    expect(hypo!.patientSex).toBe('female');
    expect(hypo!.phaseCount).toBeGreaterThanOrEqual(2);
    expect(typeof hypo!.hasBranching).toBe('boolean');
  });

  it('returns empty array for nonexistent directory', () => {
    const index = buildScenarioIndex('/nonexistent/path');
    expect(index).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/batch/scenario-index.test.ts --no-coverage`
Expected: FAIL — cannot find module `./scenario-index`

- [ ] **Step 3: Implement `buildScenarioIndex`**

Create `src/batch/scenario-index.ts`:

```typescript
import fs from 'fs';
import path from 'path';

export interface ScenarioIndexEntry {
  id: string;
  name: string;
  difficulty: string;
  category: string;
  tags: string[];
  protocols: string[];
  learningObjectives: string[];
  patientAge: number;
  patientSex: string;
  phaseCount: number;
  hasBranching: boolean;
}

export function buildScenarioIndex(outputDir: string): ScenarioIndexEntry[] {
  if (!fs.existsSync(outputDir)) return [];

  const entries: ScenarioIndexEntry[] = [];
  const dirs = fs.readdirSync(outputDir).filter((d) => {
    const full = path.join(outputDir, d);
    return fs.statSync(full).isDirectory();
  });

  for (const dir of dirs) {
    const unifiedPath = path.join(outputDir, dir, 'unified.json');
    if (!fs.existsSync(unifiedPath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(unifiedPath, 'utf-8'));
      entries.push({
        id: raw.meta?.id ?? dir,
        name: raw.meta?.name ?? '',
        difficulty: raw.meta?.difficulty ?? 'unknown',
        category: raw.meta?.category ?? '',
        tags: raw.meta?.tags ?? [],
        protocols: raw.meta?.protocols ?? [],
        learningObjectives: raw.debriefing?.learningObjectives ?? [],
        patientAge: raw.patient?.age ?? 0,
        patientSex: raw.patient?.sex ?? '',
        phaseCount: raw.phases?.length ?? 0,
        hasBranching: (raw.phases ?? []).some(
          (p: any) => p.isDefault === false
        ),
      });
    } catch {
      // Skip invalid files
    }
  }

  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/batch/scenario-index.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/batch/scenario-index.ts src/batch/scenario-index.test.ts
git commit -m "feat: add scenario index for batch generation"
```

### Task 2: Scenario Index — Prompt Formatter

**Files:**
- Modify: `src/batch/scenario-index.ts`
- Modify: `src/batch/scenario-index.test.ts`

- [ ] **Step 1: Write the failing test for `formatScenarioIndexForPrompt`**

Add to `src/batch/scenario-index.test.ts`:

```typescript
import { buildScenarioIndex, formatScenarioIndexForPrompt } from './scenario-index';

describe('formatScenarioIndexForPrompt', () => {
  it('formats index entries as a readable text block', () => {
    const index = buildScenarioIndex(OUTPUT_DIR);
    const formatted = formatScenarioIndexForPrompt(index);
    expect(formatted).toContain('hypo-001');
    expect(formatted).toContain('beginner');
    expect(formatted).toContain('medical-hypoglycemia');
  });

  it('returns a message when no scenarios exist', () => {
    const formatted = formatScenarioIndexForPrompt([]);
    expect(formatted).toContain('No existing scenarios');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/batch/scenario-index.test.ts --no-coverage`
Expected: FAIL — `formatScenarioIndexForPrompt` is not exported

- [ ] **Step 3: Implement `formatScenarioIndexForPrompt`**

Add to `src/batch/scenario-index.ts`:

```typescript
export function formatScenarioIndexForPrompt(index: ScenarioIndexEntry[]): string {
  if (index.length === 0) {
    return 'No existing scenarios found.';
  }

  const lines = index.map((e) => {
    const protocols = e.protocols.join(', ');
    const objectives = e.learningObjectives.length > 0
      ? e.learningObjectives.slice(0, 3).join('; ')
      : 'none listed';
    return `- "${e.name}" (${e.difficulty}) | Protocols: ${protocols} | Patient: ${e.patientAge}${e.patientSex === 'male' ? 'M' : 'F'} | Phases: ${e.phaseCount}${e.hasBranching ? ' (branching)' : ''} | Objectives: ${objectives}`;
  });

  return `Existing scenarios (${index.length} total):\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/batch/scenario-index.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/batch/scenario-index.ts src/batch/scenario-index.test.ts
git commit -m "feat: add scenario index prompt formatter"
```

---

## Chunk 2: Batch Planner Agent

### Task 3: Batch Planner Prompt

**Files:**
- Create: `src/prompts/batch-planner.ts`

- [ ] **Step 1: Create the batch planner system prompt**

Create `src/prompts/batch-planner.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/prompts/batch-planner.ts
git commit -m "feat: add batch planner system prompt"
```

### Task 4: Batch Planner Agent

**Files:**
- Create: `src/agents/batch-planner.ts`
- Create: `src/agents/batch-planner.test.ts`

- [ ] **Step 1: Write the failing test for plan structure validation**

Create `src/agents/batch-planner.test.ts`:

```typescript
import { BatchPlanEntry, validateBatchPlan } from './batch-planner';

describe('validateBatchPlan', () => {
  const validEntry: BatchPlanEntry = {
    title: 'Hypoglycemia Emergency',
    description: '45M found confused at home, history of diabetes',
    targetProtocols: ['medical-hypoglycemia'],
    difficulty: 'beginner',
    learningObjectives: ['Glucose assessment', 'D10 administration'],
  };

  it('accepts a valid batch plan', () => {
    const result = validateBatchPlan([validEntry]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects empty plan', () => {
    const result = validateBatchPlan([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('empty');
  });

  it('rejects entry missing title', () => {
    const bad = { ...validEntry, title: '' };
    const result = validateBatchPlan([bad]);
    expect(result.valid).toBe(false);
  });

  it('rejects entry with no target protocols', () => {
    const bad = { ...validEntry, targetProtocols: [] };
    const result = validateBatchPlan([bad]);
    expect(result.valid).toBe(false);
  });

  it('rejects entry with invalid difficulty', () => {
    const bad = { ...validEntry, difficulty: 'extreme' };
    const result = validateBatchPlan([bad]);
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/agents/batch-planner.test.ts --no-coverage`
Expected: FAIL — cannot find module `./batch-planner`

- [ ] **Step 3: Implement the batch planner agent**

Create `src/agents/batch-planner.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/agents/batch-planner.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agents/batch-planner.ts src/agents/batch-planner.test.ts
git commit -m "feat: add batch planner agent with validation"
```

---

## Chunk 3: Orchestrator

### Task 5: Orchestrator — Core Execution Loop

**Files:**
- Create: `src/batch/orchestrator.ts`
- Create: `src/batch/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test for `buildForwardContext`**

Create `src/batch/orchestrator.test.ts`:

```typescript
import { buildForwardContext, GeneratedSummary } from './orchestrator';

describe('buildForwardContext', () => {
  it('returns empty string when no scenarios generated yet', () => {
    expect(buildForwardContext([])).toBe('');
  });

  it('formats a single generated scenario', () => {
    const summaries: GeneratedSummary[] = [
      {
        title: 'Hypoglycemia Emergency',
        difficulty: 'beginner',
        patientAge: 67,
        patientSex: 'female',
        location: 'home',
        protocols: ['medical-hypoglycemia'],
        objectives: ['Glucose assessment', 'D10 administration'],
      },
    ];
    const result = buildForwardContext(summaries);
    expect(result).toContain('Hypoglycemia Emergency');
    expect(result).toContain('beginner');
    expect(result).toContain('67F');
    expect(result).toContain('medical-hypoglycemia');
    expect(result).toContain('differentiate');
  });

  it('formats multiple generated scenarios', () => {
    const summaries: GeneratedSummary[] = [
      {
        title: 'Scenario A',
        difficulty: 'beginner',
        patientAge: 45,
        patientSex: 'male',
        location: 'office',
        protocols: ['proto-a'],
        objectives: ['Obj 1'],
      },
      {
        title: 'Scenario B',
        difficulty: 'advanced',
        patientAge: 22,
        patientSex: 'female',
        location: 'park',
        protocols: ['proto-b'],
        objectives: ['Obj 2'],
      },
    ];
    const result = buildForwardContext(summaries);
    expect(result).toContain('Scenario A');
    expect(result).toContain('Scenario B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/batch/orchestrator.test.ts --no-coverage`
Expected: FAIL — cannot find module `./orchestrator`

- [ ] **Step 3: Write the failing test for `buildScenarioDescription`**

Add to `src/batch/orchestrator.test.ts`:

```typescript
import { buildForwardContext, buildScenarioDescription, GeneratedSummary } from './orchestrator';
import { BatchPlanEntry } from '../agents/batch-planner';

describe('buildScenarioDescription', () => {
  const planEntry: BatchPlanEntry = {
    title: 'Allergic Reaction — Anaphylaxis',
    description: '32M at restaurant, sudden onset after eating shellfish',
    targetProtocols: ['medical-allergic-reaction'],
    difficulty: 'intermediate',
    learningObjectives: ['Epinephrine administration', 'Airway management'],
  };

  it('includes title, description, difficulty, and objectives', () => {
    const result = buildScenarioDescription(planEntry, '');
    expect(result).toContain('Allergic Reaction');
    expect(result).toContain('32M at restaurant');
    expect(result).toContain('intermediate');
    expect(result).toContain('Epinephrine administration');
  });

  it('appends forward context when provided', () => {
    const context = 'Previously generated: Scenario A';
    const result = buildScenarioDescription(planEntry, context);
    expect(result).toContain('Previously generated');
  });

  it('omits forward context section when empty', () => {
    const result = buildScenarioDescription(planEntry, '');
    expect(result).not.toContain('Previously generated');
  });
});
```

- [ ] **Step 4: Implement orchestrator with `buildForwardContext` and `buildScenarioDescription`**

Create `src/batch/orchestrator.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { BatchPlanEntry } from '../agents/batch-planner';
import { generateScenario } from '../agents/scenario-generator';
import { exportRealiti } from '../export/realiti';
import { exportHtml } from '../export/html';
import { readProtocol } from '../protocols/loader';
import { ProtocolEntry } from '../types/schema';

export interface GeneratedSummary {
  title: string;
  difficulty: string;
  patientAge: number;
  patientSex: string;
  location: string;
  protocols: string[];
  objectives: string[];
}

export interface BatchResultEntry {
  planEntry: BatchPlanEntry;
  scenarioId: string;
  outputPath: string;
}

export interface BatchFailureEntry {
  planEntry: BatchPlanEntry;
  error: string;
}

export interface BatchResult {
  succeeded: BatchResultEntry[];
  failed: BatchFailureEntry[];
}

export function buildForwardContext(summaries: GeneratedSummary[]): string {
  if (summaries.length === 0) return '';

  const lines = summaries.map((s) => {
    const sex = s.patientSex === 'male' ? 'M' : 'F';
    return `- "${s.title}" (${s.difficulty}) — ${s.patientAge}${sex}, ${s.location}, protocols: ${s.protocols.join(', ')}. Objectives: ${s.objectives.join(', ')}`;
  });

  return `Previously generated in this batch (differentiate your scenario — vary demographics, scene, presentation):\n${lines.join('\n')}`;
}

export function buildScenarioDescription(
  planEntry: BatchPlanEntry,
  forwardContext: string
): string {
  let description = `Title: ${planEntry.title}
Description: ${planEntry.description}
Difficulty: ${planEntry.difficulty}
Learning Objectives: ${planEntry.learningObjectives.join(', ')}`;

  if (forwardContext) {
    description += `\n\n${forwardContext}`;
  }

  return description;
}

export async function executeBatch(
  plan: BatchPlanEntry[],
  protocolIndex: ProtocolEntry[],
  apiKey: string,
  outputDir: string,
  progress: {
    onScenarioStart: (index: number, total: number, title: string) => void;
    onScenarioSuccess: (index: number, scenarioId: string) => void;
    onScenarioFailure: (index: number, title: string, error: string) => void;
  }
): Promise<BatchResult> {
  const succeeded: BatchResultEntry[] = [];
  const failed: BatchFailureEntry[] = [];
  const summaries: GeneratedSummary[] = [];

  for (let i = 0; i < plan.length; i++) {
    const entry = plan[i];
    progress.onScenarioStart(i + 1, plan.length, entry.title);

    try {
      const forwardContext = buildForwardContext(summaries);
      const description = buildScenarioDescription(entry, forwardContext);

      const protocolsWithContent = entry.targetProtocols.map((slug) => ({
        slug,
        rationale: `Selected for batch scenario: ${entry.title}`,
        content: readProtocol(slug, protocolIndex) ?? `Protocol not found: ${slug}`,
      }));

      const { scenario } = await generateScenario(
        description,
        protocolsWithContent,
        apiKey,
        {
          onGenerating: () => {},
          onValidating: () => {},
          onValidationResult: () => {},
          onRetrying: () => {},
        }
      );

      const safeId = scenario.meta.id.replace(/[^a-zA-Z0-9_-]/g, '-');
      const scenarioDir = path.join(outputDir, safeId);
      fs.mkdirSync(scenarioDir, { recursive: true });

      fs.writeFileSync(
        path.join(scenarioDir, 'unified.json'),
        JSON.stringify(scenario, null, 2)
      );
      fs.writeFileSync(
        path.join(scenarioDir, 'realiti.json'),
        JSON.stringify(exportRealiti(scenario), null, 2)
      );
      fs.writeFileSync(
        path.join(scenarioDir, 'scenario.html'),
        exportHtml(scenario)
      );

      succeeded.push({
        planEntry: entry,
        scenarioId: scenario.meta.id,
        outputPath: scenarioDir,
      });

      summaries.push({
        title: scenario.meta.name,
        difficulty: scenario.meta.difficulty,
        patientAge: scenario.patient.age,
        patientSex: scenario.patient.sex,
        location: scenario.scene?.location ?? 'unknown',
        protocols: scenario.meta.protocols,
        objectives: scenario.debriefing?.learningObjectives ?? [],
      });

      progress.onScenarioSuccess(i + 1, scenario.meta.id);
    } catch (err: any) {
      failed.push({
        planEntry: entry,
        error: err.message ?? String(err),
      });
      progress.onScenarioFailure(i + 1, entry.title, err.message ?? String(err));
    }
  }

  return { succeeded, failed };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/batch/orchestrator.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/batch/orchestrator.ts src/batch/orchestrator.test.ts
git commit -m "feat: add batch orchestrator with forward context"
```

---

## Chunk 4: CLI Integration

### Task 6: Add Batch Mode to CLI

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add batch flow imports and mode selection to `runGenerateCommand`**

At the top of `src/index.ts`, add new imports and update the existing schema import:

```typescript
import { select, input, confirm as confirmPrompt } from '@inquirer/prompts';
import { buildScenarioIndex } from './batch/scenario-index';
import { generateBatchPlan } from './agents/batch-planner';
import { executeBatch } from './batch/orchestrator';
```

Also update the existing `types/schema` import to include `ProtocolEntry`:

```typescript
import { ValidationResult, ProtocolEntry } from './types/schema';
```

- [ ] **Step 2: Create the `runBatchFlow` function**

Add this function to `src/index.ts` (before the `main()` function):

```typescript
async function runBatchFlow(apiKey: string, priorityOrder: string[], protocolIndex: ProtocolEntry[]) {
  // Step 1: Batch size
  const sizeStr = await input({ message: 'How many scenarios would you like to generate?' });
  const batchSize = parseInt(sizeStr, 10);
  if (isNaN(batchSize) || batchSize < 1) {
    console.error('Invalid number.');
    process.exit(1);
  }

  if (batchSize > 15) {
    const proceed = await confirmPrompt({
      message: `Generating ${batchSize} scenarios will consume significant API tokens. Continue?`,
      default: false,
    });
    if (!proceed) {
      console.log('Cancelled.');
      return;
    }
  }

  // Step 2: Optional constraints
  const constraints = await input({
    message: 'Any specific constraints? (e.g., BLS-only, focus on cardiac, intermediate difficulty)\n  Press Enter to skip:',
  });

  // Step 3: Build scenario index
  console.log('\nIndexing existing scenarios...');
  const scenarioIndex = buildScenarioIndex(OUTPUT_DIR);
  console.log(`  ${scenarioIndex.length} existing scenario(s) found`);
  console.log('');

  // Step 4: Generate batch plan
  console.log('─── Batch Planning ───');
  console.log('  Building batch plan...');
  let plan = await generateBatchPlan(protocolIndex, scenarioIndex, batchSize, constraints, apiKey);

  // Step 5: Display plan and get approval
  let approved = false;
  while (!approved) {
    console.log(`\nBatch Plan (${plan.length} scenarios):\n`);
    plan.forEach((entry, i) => {
      console.log(`  ${i + 1}. ${entry.title} (${entry.difficulty})`);
      console.log(`     Protocols: ${entry.targetProtocols.join(', ')}`);
      console.log(`     ${entry.description}`);
      console.log(`     Objectives: ${entry.learningObjectives.join(', ')}`);
      console.log('');
    });

    const action = await select({
      message: 'Approve this plan?',
      choices: [
        { name: 'Approve — start generating', value: 'approve' },
        { name: 'Revise — provide feedback', value: 'revise' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'approve') {
      approved = true;
    } else if (action === 'cancel') {
      console.log('Cancelled.');
      return;
    } else {
      const feedback = await input({ message: 'What would you like to change?' });
      console.log('\n  Regenerating plan...');
      plan = await generateBatchPlan(
        protocolIndex,
        scenarioIndex,
        batchSize,
        constraints ? `${constraints}\n\nRevision feedback: ${feedback}` : feedback,
        apiKey
      );
    }
  }

  // Step 6: Execute batch
  console.log('');
  console.log('─── Batch Generation ───');
  const result = await executeBatch(plan, protocolIndex, apiKey, OUTPUT_DIR, {
    onScenarioStart: (i, total, title) =>
      process.stdout.write(`  Generating scenario ${i}/${total}: ${title}... `),
    onScenarioSuccess: (i, scenarioId) =>
      console.log(`✓ (${scenarioId})`),
    onScenarioFailure: (i, title, error) =>
      console.log(`✗ (${error})`),
  });

  // Step 7: Summary
  console.log('');
  console.log(`Batch complete: ${result.succeeded.length}/${plan.length} scenarios generated successfully.`);
  if (result.failed.length > 0) {
    console.log('Failed:');
    result.failed.forEach((f) => console.log(`  - ${f.planEntry.title}: ${f.error}`));
  }
}
```

- [ ] **Step 3: Modify `runGenerateCommand` to offer mode selection**

Replace the current `runGenerateCommand` function. The key changes are:
1. Move the scenario description prompt AFTER mode selection
2. Add mode selection using `@inquirer/prompts` `select`
3. Route to batch flow or continue single flow

```typescript
async function runGenerateCommand(scenarioInput?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  // Discover and select protocol sets (shared by both flows)
  const allSets = discoverSets(PROTOCOL_DIR);
  if (allSets.length === 0) {
    console.error('No protocol sets found in protocol_docs/. Run the ingest command first or create a subdirectory.');
    process.exit(1);
  }

  const setInfo = allSets.map((name) => {
    const setDir = path.join(PROTOCOL_DIR, name);
    const count = fs.readdirSync(setDir).filter((f) => f.endsWith('.md')).length;
    return { name, protocolCount: count };
  });

  // Mode selection (skip if scenario input provided via CLI arg — that's single mode)
  let mode: 'single' | 'batch' = 'single';
  if (!scenarioInput) {
    mode = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Generate a single scenario', value: 'single' as const },
        { name: 'Generate a batch of scenarios', value: 'batch' as const },
      ],
    });
  }

  const { priorityOrder } = await selectProtocolSets(setInfo);
  console.log('');

  console.log('Loading protocol index...');
  const protocolIndex = loadProtocolIndex(PROTOCOL_DIR, priorityOrder);
  console.log(`  ${protocolIndex.length} protocols found across ${priorityOrder.length} set(s)`);
  console.log('');

  if (mode === 'batch') {
    await runBatchFlow(apiKey, priorityOrder, protocolIndex);
    return;
  }

  // Single scenario flow (existing logic)
  const userInput = scenarioInput || await promptUser('Describe your scenario:\n> ');
  if (!userInput) {
    console.error('No scenario description provided.');
    process.exit(1);
  }

  console.log('─── Stage 1: Protocol Selection ───');
  const selections = await selectProtocols(userInput, protocolIndex, apiKey, {
    onReadProtocol: (slug) => console.log(`  Reading: ${slug}`),
    onDoneSelecting: (sels) => {
      console.log(`  Selected ${sels.length} protocol${sels.length !== 1 ? 's' : ''}:`);
      for (const s of sels) {
        console.log(`    • ${s.slug} — ${s.rationale}`);
      }
    },
  });
  console.log('');

  const protocolsWithContent = selections.map((s) => ({
    slug: s.slug,
    rationale: s.rationale,
    content: readProtocol(s.slug, protocolIndex) ?? `Protocol not found: ${s.slug}`,
  }));

  console.log('─── Stage 2: Scenario Generation ───');
  const { scenario, validation } = await generateScenario(
    userInput,
    protocolsWithContent,
    apiKey,
    {
      onGenerating: () => console.log('  Generating scenario...'),
      onValidating: () => console.log('  Validating...'),
      onValidationResult: (result, attempt) => {
        if (attempt > 1) console.log(`  Validation attempt ${attempt}:`);
        printValidation(result);
      },
      onRetrying: (attempt, errors) => {
        console.log(`  Retrying (${attempt}/3)...`);
      },
    }
  );
  console.log('');

  console.log('─── Export ───');
  const safeId = scenario.meta.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const outputDir = path.join(OUTPUT_DIR, safeId);
  fs.mkdirSync(outputDir, { recursive: true });

  const unifiedPath = path.join(outputDir, 'unified.json');
  fs.writeFileSync(unifiedPath, JSON.stringify(scenario, null, 2));
  console.log(`  ✓ ${path.relative(process.cwd(), unifiedPath)}`);

  const realitiJson = exportRealiti(scenario);
  const realitiPath = path.join(outputDir, 'realiti.json');
  fs.writeFileSync(realitiPath, JSON.stringify(realitiJson, null, 2));
  console.log(`  ✓ ${path.relative(process.cwd(), realitiPath)}`);

  const htmlPath = path.join(outputDir, 'scenario.html');
  fs.writeFileSync(htmlPath, exportHtml(scenario));
  console.log(`  ✓ ${path.relative(process.cwd(), htmlPath)}`);

  console.log('');
  console.log(`Done! Generated "${scenario.meta.name}"`);
}
```

- [ ] **Step 4: Remove the standalone `promptUser` usage for initial scenario input**

The `promptUser` function is still used in `runIngestCommand` and as fallback in single mode, so keep it. No removal needed.

- [ ] **Step 5: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run all existing tests to verify nothing broke**

Run: `npx jest --no-coverage`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat: add batch generation mode to CLI"
```

---

## Chunk 5: End-to-End Verification

### Task 7: Manual End-to-End Test

- [ ] **Step 1: Run the full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Smoke test single scenario mode still works**

Run: `npx ts-node src/index.ts generate "test scenario"`
Expected: Mode selection prompt appears, selecting "single" enters existing flow

- [ ] **Step 4: Smoke test batch mode**

Run: `npx ts-node src/index.ts generate`
Expected:
1. Mode selection: choose "batch"
2. Protocol set selection appears
3. Batch size prompt appears
4. Constraints prompt appears
5. Batch plan is generated and displayed
6. Approve/revise/cancel prompt appears
7. On approve: scenarios generate sequentially with progress
8. Completion summary prints

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end testing"
```
