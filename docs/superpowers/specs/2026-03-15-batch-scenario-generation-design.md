# Batch Scenario Generation — Design Spec

## Overview

Add an AI-powered batch generation mode to the scenario agent CLI. Instead of generating one scenario at a time, users can request a batch of N scenarios. An AI planner analyzes protocol coverage, existing scenarios, and optional user constraints to build a well-rounded generation plan. After user approval, scenarios are generated sequentially with awareness of what's already been created.

## Goals

- Generate multiple scenarios in one session with intelligent planning
- Fill protocol coverage gaps automatically
- Balance difficulty levels and patient demographics across a batch
- Prioritize unique scenarios before creating variations
- Reuse the existing generation pipeline without modification

## Architecture: Orchestrator + Existing Agents (Approach C)

The design adds three new components:

1. **Batch Planner Agent** — An LLM agent that builds the batch plan
2. **Scenario Index** — A lightweight indexer of existing scenarios
3. **Orchestrator** — A plain TypeScript function that coordinates everything

The existing protocol selector, scenario generator, validator, and exporters remain unchanged.

```
User Input
    ↓
[CLI] "Single or Batch?"
    ├─ Single → existing flow (unchanged)
    └─ Batch ↓
        ├─ Protocol set selection (existing)
        ├─ "How many scenarios?" prompt
        ├─ Optional user constraints (free text)
        ↓
[Scenario Index] Scan /output/ for existing scenarios
        ↓
[Batch Planner Agent]
    Receives: protocol index + scenario index + batch size + constraints
    Returns: BatchPlanEntry[]
        ↓
[CLI] Display plan → user approves / revises / cancels
        ↓
[Orchestrator] For each approved entry (sequential):
    ├─ Build description from plan entry
    ├─ Load target protocols directly (skip protocol selector)
    ├─ Append "already generated" summary for awareness
    ├─ Call existing scenario generator
    ├─ Validate + export (existing pipeline)
    ├─ On failure after 3 retries: log, skip, continue
    └─ Add summary to forward context
        ↓
Done — print success/failure counts
```

## User Flow

### Step 1: Mode Selection

When the user runs `generate`, the CLI presents:

```
? What would you like to do?
  › Generate a single scenario
    Generate a batch of scenarios
```

**Single scenario** routes to the existing flow with zero changes.

### Step 2: Protocol Set Selection

Reuses the existing `selectProtocolSets()` — user picks which protocol sets to include.

### Step 3: Batch Size

```
? How many scenarios would you like to generate? 10
```

If the number exceeds 15, show a warning:

```
⚠ Generating 20 scenarios will consume significant API tokens. Continue? (y/N)
```

### Step 4: Optional Constraints

```
? Any specific constraints? (e.g., BLS-only, focus on cardiac, intermediate difficulty)
  Press Enter to skip:
```

Free text input. If empty, the planner uses its default gap-filling logic.

### Step 5: Plan Review

The planner agent builds a plan displayed as a numbered list:

```
Batch Plan (10 scenarios):

 1. Allergic Reaction — Anaphylaxis (intermediate)
    Protocols: medical-allergic-reaction
    32M at restaurant, sudden onset after eating shellfish
    Objectives: Epinephrine administration, airway management

 2. Chest Pain — Acute Coronary Syndrome (beginner)
    Protocols: cv-chest-pain, cv-12-lead-ecg
    58M at office, crushing substernal chest pain
    Objectives: 12-lead acquisition, aspirin administration, pain management

 ...

? Approve this plan? (approve / revise / cancel)
```

- **approve** → start generating
- **revise** → user types feedback (e.g., "make #3 advanced instead"), planner regenerates
- **cancel** → exit

### Step 6: Generation

Sequential generation with progress output:

```
Generating scenario 1/10: Allergic Reaction — Anaphylaxis...  ✓
Generating scenario 2/10: Chest Pain — Acute Coronary Syndrome...  ✓
Generating scenario 3/10: Pediatric Seizure...  ✗ (failed after 3 retries)
Generating scenario 4/10: ...
```

### Step 7: Completion

```
Batch complete: 9/10 scenarios generated successfully.
Failed: #3 Pediatric Seizure
Output directory: output/
```

## Component Design

### Scenario Index (`src/batch/scenario-index.ts`)

Scans `/output/` subdirectories for `unified.json` files and extracts lightweight metadata.

```typescript
interface ScenarioIndexEntry {
  id: string;
  name: string;
  difficulty: string;
  category: string;
  tags: string[];
  protocols: string[];          // protocol slugs used
  learningObjectives: string[];
  patientAge: number;
  patientSex: string;
  phaseCount: number;
  hasBranching: boolean;
}

function buildScenarioIndex(outputDir: string): Promise<ScenarioIndexEntry[]>
function formatScenarioIndexForPrompt(index: ScenarioIndexEntry[]): string
```

`formatScenarioIndexForPrompt()` produces a compact markdown representation for the planner agent — similar to how protocols use `formatIndexForPrompt()`.

### Batch Planner Agent (`src/agents/batch-planner.ts`)

A new LLM agent with a single Claude call (no tool use). Receives all context via the system prompt and user message.

**Input:**
- Protocol index (existing format)
- Scenario index (new lightweight format)
- Batch size (number)
- User constraints (optional string)

**Output:**
```typescript
interface BatchPlanEntry {
  title: string;
  description: string;          // 1-2 sentence patient/scene sketch
  targetProtocols: string[];    // protocol slugs
  difficulty: string;           // beginner | intermediate | advanced
  learningObjectives: string[]; // 2-3 key objectives
}
```

**System Prompt — Planner Decision Logic:**

The prompt instructs the planner to follow this priority order:

1. **Gap filling first** — Identify protocols with no existing scenarios. Prioritize creating scenarios for uncovered protocols.
2. **Difficulty balance** — If existing scenarios skew toward one difficulty level, compensate in the batch.
3. **Unique before similar** — Exhaust distinct protocol combinations before creating variations of already-covered protocols.
4. **Realistic first, then complex** — Earlier entries in the plan are straightforward clinical presentations. Later entries introduce complications (multi-protocol scenarios, branching decision points, deteriorating patients).
5. **Demographic variety** — Vary age ranges, sex, and scene settings across the batch.

If user constraints are provided, they override or narrow these defaults.

### Orchestrator (`src/batch/orchestrator.ts`)

Plain TypeScript — not an LLM agent. Coordinates the full batch flow.

```typescript
interface BatchResult {
  succeeded: BatchResultEntry[];
  failed: BatchFailureEntry[];
}

interface BatchResultEntry {
  planEntry: BatchPlanEntry;
  scenarioId: string;
  outputPath: string;
}

interface BatchFailureEntry {
  planEntry: BatchPlanEntry;
  error: string;
}

async function executeBatch(
  plan: BatchPlanEntry[],
  protocolIndex: ProtocolEntry[],
  protocolDir: string,
  outputDir: string
): Promise<BatchResult>
```

**Orchestrator responsibilities:**

1. **Execute sequentially** — For each plan entry:
   - Convert `BatchPlanEntry` into a scenario description string
   - Load target protocols directly using `readProtocol()` (bypasses protocol selector agent — the planner already chose protocols)
   - Build forward context summary from previously generated scenarios
   - Call `generateScenario()` with description + protocols + forward context
   - Run `validateScenario()` + `exportRealiti()` + `exportHtml()`
   - Save to `output/{scenarioId}/`
2. **Handle failures** — If generation fails after 3 retries, log the error, skip, continue
3. **Build forward context** — After each successful generation, add a one-line summary to the "already generated" list

### Forward Context ("Already Generated" Summary)

Before generating scenario N, the orchestrator appends a compact summary of scenarios 1 through N-1 to the scenario generator's user message:

```
Previously generated in this batch (differentiate your scenario — vary demographics, scene, presentation):
- "Hypoglycemia Emergency" (intermediate) — 67F, home, protocols: medical-hypoglycemia. Objectives: glucose assessment, D10 administration
- "VFib Cardiac Arrest" (advanced) — 55M, office, protocols: cv-cardiac-arrest. Objectives: early defib, high-quality CPR
```

One line per scenario. Even at scenario 20, this is ~20 lines — lightweight and effective.

### CLI Changes (`src/index.ts`)

The `generate` command gets a new initial prompt for mode selection. If "batch" is chosen, hand off to a `runBatchFlow()` function that orchestrates the batch-specific CLI interactions (batch size, constraints, plan review) and then calls the orchestrator.

The single-scenario flow remains exactly as-is.

## File Structure

```
src/
├── agents/
│   ├── batch-planner.ts          # NEW — Batch Planner Agent
│   └── scenario-generator.ts     # EXISTING — unchanged
├── prompts/
│   ├── batch-planner.ts          # NEW — system prompt for planner
│   └── scenario-generator.ts     # EXISTING — unchanged
├── batch/
│   ├── orchestrator.ts           # NEW — batch execution coordinator
│   └── scenario-index.ts         # NEW — lightweight scenario indexer
├── cli/
│   └── set-selector.ts           # EXISTING — reused, unchanged
├── export/                        # EXISTING — unchanged
├── validation/                    # EXISTING — unchanged
└── index.ts                      # MODIFIED — add batch mode selection
```

## Testing

- `src/batch/scenario-index.test.ts` — Unit tests for index building and formatting
- `src/agents/batch-planner.test.ts` — Tests for plan structure/schema validation
- `src/batch/orchestrator.test.ts` — Tests for orchestration logic with mocked agents

## Error Handling

- **Planner fails:** Show error, let user retry or cancel
- **Single scenario fails (after 3 retries):** Log failure, skip, continue to next scenario
- **User cancels during plan review:** Exit cleanly
- **Token warning threshold:** 15+ scenarios triggers confirmation prompt

## Non-Goals

- Parallel generation (sequential-with-awareness is the chosen strategy)
- Modifying the existing single-scenario flow
- Modifying existing agents, exporters, or validators
- Batch editing or re-running individual failed scenarios (can be added later)
