# Paramedic Scenario Generator Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive CLI tool that uses Claude to select EMS protocols, generate a paramedic training scenario as unified JSON, then export to REALITi simulator format and interactive HTML.

**Architecture:** Two-stage AI pipeline — Stage 1 selects protocols via tool-use loop, Stage 2 generates unified JSON with validation retry. Two deterministic export functions project the unified JSON to REALITi format and HTML. Interactive CLI shows progress throughout.

**Tech Stack:** TypeScript, Node.js, `@anthropic-ai/sdk`, `gray-matter` (YAML frontmatter parsing), `ajv` (JSON schema validation)

**Spec:** `docs/superpowers/specs/2026-03-11-scenario-generator-design.md`

**Key reference files:**
- `paramedic-scenario-architecture.md` — unified schema, ECG code table, mapping table, example scenario
- `scenario-builder-briefing.md` — constraints, design decisions
- `realiti_scenario.schema.json` — REALITi's JSON schema for export validation
- `scenario-hypoglycemia-mobile.html` — visual design target for HTML template
- `protocol_docs/medical-hypoglycemia.md` — example protocol file format

---

## Chunk 1: Project Setup & Types

### Task 1: Initialize TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
cd C:\Users\mattr\Desktop\projects\scenario_agent
npm init -y
npm install @anthropic-ai/sdk gray-matter ajv
npm install -D typescript @types/node ts-node
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "output"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
output/
.env
.superpowers/
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, clean exit)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore
git commit -m "chore: initialize TypeScript project with dependencies"
```

---

### Task 2: Define unified schema TypeScript types

**Files:**
- Create: `src/types/schema.ts`

The types are derived from the unified schema in `paramedic-scenario-architecture.md` (lines 47-312). Every field from that schema becomes a TypeScript interface.

- [ ] **Step 1: Write the type definitions**

```typescript
// src/types/schema.ts

// --- Unified Scenario Schema Types ---

export interface UnifiedScenario {
  meta: ScenarioMeta;
  patient: Patient;
  scene: Scene;
  phases: Phase[];
  assessment: Assessment;
  debriefing: Debriefing;
  realiti?: RealitiConfig;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  version?: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  category?: string;
  protocols: string[];
  totalTimeSeconds: number;
  createdAt?: string;
  tags?: string[];
}

export interface Patient {
  name: string;
  age: number;
  ageUnit?: string;
  sex: "male" | "female";
  weight: number;
  height: number;
  chiefComplaint: string;
  history: PatientHistory;
}

export interface PatientHistory {
  hpi?: string;
  pastMedical?: string[];
  medications?: string[];
  allergies?: string[];
  lastOralIntake?: string;
  events?: string;
}

export interface Scene {
  location?: string;
  time?: string;
  safety?: string;
  bystanders?: string;
  visualCues?: string[];
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  triggerCondition?: string;
  isDefault?: boolean;
  transitions?: Transition[];
  clinicalPresentation: ClinicalPresentation;
  monitorState: MonitorState;
  expectedActions?: ExpectedAction[];
}

export interface Transition {
  targetPhaseId: string;
  condition: string;
  conditionType?: "action_not_taken" | "action_taken" | "time_elapsed" | "vital_threshold";
  timeoutSeconds?: number;
  triggerActionIds?: string[];
}

export interface ClinicalPresentation {
  avpu?: "Alert" | "Verbal" | "Pain" | "Unresponsive";
  gcs?: { eye: number; verbal: number; motor: number };
  airway?: string;
  breathing?: string;
  circulation?: string;
  skin?: { color?: string; temperature?: string; moisture?: string };
  pupils?: string;
  motorFunction?: string;
  otherFindings?: string[];
  patientSpeech?: string;
}

export interface MonitorState {
  ecgRhythm?: string;
  ecgWaveform?: number;
  hr?: number;
  bpSys?: number;
  bpDia?: number;
  respRate?: number;
  spo2?: number;
  etco2?: number;
  temp?: number;
  obstruction?: number;
  glucose?: number;
  customMeasures?: { label: string; value: number }[];
  trendTimeSeconds?: number;
  visibility?: MonitorVisibility;
}

export interface MonitorVisibility {
  spo2Visible?: boolean;
  spo2Attached?: boolean;
  rrVisible?: boolean;
  etco2Visible?: boolean;
  cvpVisible?: boolean;
}

export interface ExpectedAction {
  id: string;
  action: string;
  priority: "critical" | "important" | "supplemental";
  rationale?: string;
  protocolReference?: string;
}

export interface Assessment {
  criticalActions?: string[];
  expectedActions?: string[];
  bonusActions?: string[];
}

export interface Debriefing {
  learningObjectives?: string[];
  discussionQuestions?: string[];
  commonPitfalls?: string[];
  keyTakeaways?: string[];
}

export interface RealitiConfig {
  scenarioMonitorType?: number;
  scenarioDefaultEnergy?: number;
  scenarioDefaultPacerThreshold?: number;
}

// --- ECG Code Table ---
// From paramedic-scenario-architecture.md lines 569-613

export const ECG_RHYTHM_CODES: Record<string, number> = {
  "Normal Sinus Rhythm": 9,
  "Sinus Bradycardia": 9,
  "Sinus Tachycardia": 9,
  "Asystole": 3,
  "Pulseless Electrical Activity (PEA)": 9,
  "Ventricular Fibrillation (Fine)": 18,
  "Ventricular Fibrillation (Coarse)": 18,
  "Ventricular Tachycardia (Monomorphic)": 12,
  "Ventricular Tachycardia (Polymorphic)": 12,
  "Torsades de Pointes": 12,
  "Atrial Fibrillation": 38,
  "Atrial Flutter": 1,
  "Supraventricular Tachycardia": 4,
  "First Degree AV Block": 5,
  "Second Degree AV Block Type I": 6,
  "Second Degree AV Block Type II": 103,
  "AV Block Type II 2:1": 40,
  "Third Degree Heart Block": 100,
  "Idioventricular Rhythm": 91,
  "Accelerated Idioventricular Rhythm": 91,
  "Accelerated Junctional Rhythm": 79,
  "Left Bundle Branch Block": 80,
  "Right Bundle Branch Block": 82,
  "Wolff-Parkinson-White": 84,
  "Pacemaker Rhythm": 9,
  "Pacemaker Failure to Capture": 9,
  "Hyperkalemia Changes": 20,
  "Hypokalemia Changes": 21,
  "STEMI Anterior": 23,
  "STEMI Inferior": 24,
  "STEMI Lateral": 25,
  "STEMI Posterior": 26,
  "NSTEMI": 55,
  "Pericarditis": 22,
  "Brugada Syndrome": 35,
  "Wellens Syndrome": 36,
  "Early Repolarization": 41,
  "Pulmonary Embolism (S1Q3T3)": 45,
  "Long QT Syndrome": 37,
  "PVC": 49,
  "Atrial Tachycardia": 4,
  "Sinus Arrest": 3,
};

// Shockable rhythm waveform codes
export const SHOCKABLE_CODES = new Set([18, 12]);

// Codes that indicate cardiac arrest (asystole/flatline)
export const ARREST_WAVEFORM_CODES = new Set([18, 3]);

// --- Protocol Index Entry ---

export interface ProtocolEntry {
  slug: string;
  section: string;
  description: string;
  filePath: string;
}

// --- Validation Result ---

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

// --- Protocol Selection Result ---

export interface ProtocolSelection {
  slug: string;
  rationale: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS, no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/schema.ts
git commit -m "feat: add unified schema TypeScript types and ECG code table"
```

---

## Chunk 2: Protocol Loader

### Task 3: Build protocol frontmatter loader

**Files:**
- Create: `src/protocols/loader.ts`
- Test: `src/protocols/loader.test.ts`

This module scans `protocol_docs/`, parses YAML frontmatter from each `.md` file, and builds an in-memory index. It also provides a function to read the full content of a protocol by slug.

Reference: `protocol_docs/medical-hypoglycemia.md` for frontmatter format — YAML with `protocol`, `slug`, `section`, `description` fields.

- [ ] **Step 1: Write the failing test**

```typescript
// src/protocols/loader.test.ts
import { loadProtocolIndex, readProtocol } from "./loader";
import path from "path";

const PROTOCOL_DIR = path.resolve(__dirname, "../../protocol_docs");

describe("loadProtocolIndex", () => {
  it("loads all protocol files with valid frontmatter", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    // We know there are 68 protocol files
    expect(index.length).toBeGreaterThanOrEqual(60);
    // Each entry has required fields
    for (const entry of index) {
      expect(entry.slug).toBeTruthy();
      expect(entry.section).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.filePath).toContain(".md");
    }
  });

  it("includes known protocol slugs", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    const slugs = index.map((e) => e.slug);
    expect(slugs).toContain("medical-hypoglycemia");
    expect(slugs).toContain("cv-stroke-tia");
    expect(slugs).toContain("trauma-hemorrhage-control");
  });
});

describe("readProtocol", () => {
  it("returns full file content for a valid slug", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    const content = readProtocol("medical-hypoglycemia", index);
    expect(content).toContain("Hypoglycemia");
    expect(content).toContain("Patient Care Goals");
  });

  it("returns null for an unknown slug", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    const content = readProtocol("nonexistent-protocol", index);
    expect(content).toBeNull();
  });
});
```

- [ ] **Step 2: Install test runner and run test to verify it fails**

```bash
npm install -D jest ts-jest @types/jest
npx ts-jest config:init
```

Run: `npx jest src/protocols/loader.test.ts`
Expected: FAIL — module `./loader` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/protocols/loader.ts
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { ProtocolEntry } from "../types/schema";

/**
 * Scans a directory of .md protocol files, parses YAML frontmatter,
 * and returns an index of all protocols with valid frontmatter.
 * Files with missing/malformed frontmatter are skipped with a console warning.
 */
export function loadProtocolIndex(protocolDir: string): ProtocolEntry[] {
  const entries: ProtocolEntry[] = [];
  const files = fs.readdirSync(protocolDir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const filePath = path.join(protocolDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(raw);

      if (!data.slug || !data.section || !data.description) {
        console.warn(
          `Skipping ${file}: missing required frontmatter (slug, section, or description)`
        );
        continue;
      }

      entries.push({
        slug: data.slug,
        section: data.section,
        description: data.description,
        filePath,
      });
    } catch (err) {
      console.warn(`Skipping ${file}: failed to parse frontmatter`);
    }
  }

  return entries;
}

/**
 * Reads the full markdown content of a protocol by slug.
 * Returns the raw file content (including frontmatter) or null if not found.
 */
export function readProtocol(
  slug: string,
  index: ProtocolEntry[]
): string | null {
  const entry = index.find((e) => e.slug === slug);
  if (!entry) return null;

  try {
    return fs.readFileSync(entry.filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Formats the protocol index as a string for inclusion in a system prompt.
 * Each entry is one line: "slug | section | description"
 */
export function formatIndexForPrompt(index: ProtocolEntry[]): string {
  const header = "| Slug | Section | Description |";
  const divider = "|---|---|---|";
  const rows = index.map(
    (e) => `| ${e.slug} | ${e.section} | ${e.description} |`
  );
  return [header, divider, ...rows].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/protocols/loader.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/loader.ts src/protocols/loader.test.ts jest.config.js
git commit -m "feat: add protocol frontmatter loader with index builder"
```

---

## Chunk 3: Validation

### Task 4: Build unified schema validator

**Files:**
- Create: `src/validation/validator.ts`
- Test: `src/validation/validator.test.ts`

Validates a unified scenario JSON against structural rules and clinical business rules. Reference: design spec "Validation" section and `paramedic-scenario-architecture.md` lines 744-771.

- [ ] **Step 1: Write the failing test**

```typescript
// src/validation/validator.test.ts
import { validateScenario } from "./validator";
import { UnifiedScenario } from "../types/schema";

// Minimal valid scenario for testing — all required fields present
function makeValidScenario(overrides?: Partial<UnifiedScenario>): UnifiedScenario {
  return {
    meta: {
      id: "test-001",
      name: "Test Scenario",
      difficulty: "beginner",
      protocols: ["medical-hypoglycemia"],
      totalTimeSeconds: 600,
    },
    patient: {
      name: "John Doe",
      age: 55,
      sex: "male",
      weight: 80,
      height: 175,
      chiefComplaint: "Unresponsive",
      history: { hpi: "Found unresponsive" },
    },
    scene: { location: "Home" },
    phases: [
      {
        id: "initial",
        name: "Initial Contact",
        description: "Patient found unresponsive",
        isDefault: true,
        clinicalPresentation: { avpu: "Pain" },
        monitorState: {
          ecgRhythm: "Sinus Tachycardia",
          ecgWaveform: 9,
          hr: 112,
          bpSys: 148,
          bpDia: 92,
          spo2: 97,
        },
        expectedActions: [],
      },
    ],
    assessment: { criticalActions: ["Check glucose"] },
    debriefing: { learningObjectives: ["Recognize hypoglycemia"] },
    ...overrides,
  };
}

describe("validateScenario", () => {
  it("passes for a valid scenario", () => {
    const result = validateScenario(makeValidScenario());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors when ecgWaveform does not match ecgRhythm", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.ecgRhythm = "Atrial Fibrillation";
    scenario.phases[0].monitorState.ecgWaveform = 9; // should be 38
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ecgWaveform"))).toBe(true);
  });

  it("errors when cardiac arrest missing spo2 rules", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.ecgWaveform = 18; // VFib
    scenario.phases[0].monitorState.ecgRhythm = "Ventricular Fibrillation (Coarse)";
    scenario.phases[0].monitorState.spo2 = 95; // should be 0
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("spo2"))).toBe(true);
  });

  it("errors when cardiac arrest detected by vitals (hr=0, bp=0)", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.hr = 0;
    scenario.phases[0].monitorState.bpSys = 0;
    scenario.phases[0].monitorState.bpDia = 0;
    scenario.phases[0].monitorState.spo2 = 95; // should be 0
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("spo2"))).toBe(true);
  });

  it("errors when transition references nonexistent phase", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].transitions = [
      { targetPhaseId: "nonexistent", condition: "test" },
    ];
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent"))).toBe(true);
  });

  it("errors when no entry phase exists", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].triggerCondition = "After something";
    // All phases have triggerCondition — no entry phase
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("entry phase"))).toBe(true);
  });

  it("warns when AVPU inconsistent with GCS", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].clinicalPresentation.avpu = "Unresponsive";
    scenario.phases[0].clinicalPresentation.gcs = { eye: 4, verbal: 5, motor: 6 }; // GCS 15, not unresponsive
    const result = validateScenario(scenario);
    expect(result.warnings.some((w) => w.message.includes("AVPU"))).toBe(true);
  });

  it("warns when HR doesn't match rhythm label", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.ecgRhythm = "Sinus Bradycardia";
    scenario.phases[0].monitorState.ecgWaveform = 9;
    scenario.phases[0].monitorState.hr = 112; // brady should be <60
    const result = validateScenario(scenario);
    expect(result.warnings.some((w) => w.message.includes("HR"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/validation/validator.test.ts`
Expected: FAIL — module `./validator` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/validation/validator.ts
import {
  UnifiedScenario,
  ValidationResult,
  ValidationIssue,
  ECG_RHYTHM_CODES,
  SHOCKABLE_CODES,
  ARREST_WAVEFORM_CODES,
} from "../types/schema";

export function validateScenario(scenario: UnifiedScenario): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  validateRequired(scenario, errors);
  validatePhaseReferences(scenario, errors);
  validateDefaultPath(scenario, errors);
  validateEntryPhase(scenario, errors);

  for (const phase of scenario.phases) {
    validateMonitorState(phase, errors, warnings);
    validateClinicalConsistency(phase, warnings);
  }

  validateWeight(scenario, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRequired(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  if (!scenario.meta?.id) errors.push({ path: "meta.id", message: "meta.id is required" });
  if (!scenario.meta?.name) errors.push({ path: "meta.name", message: "meta.name is required" });
  if (!scenario.meta?.difficulty) errors.push({ path: "meta.difficulty", message: "meta.difficulty is required" });
  if (!scenario.meta?.protocols?.length) errors.push({ path: "meta.protocols", message: "meta.protocols must have at least one entry" });
  if (!scenario.meta?.totalTimeSeconds) errors.push({ path: "meta.totalTimeSeconds", message: "meta.totalTimeSeconds is required" });
  if (!scenario.patient?.name) errors.push({ path: "patient.name", message: "patient.name is required" });
  if (!scenario.patient?.chiefComplaint) errors.push({ path: "patient.chiefComplaint", message: "patient.chiefComplaint is required" });
  if (!scenario.phases?.length) errors.push({ path: "phases", message: "At least one phase is required" });
}

function validatePhaseReferences(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  const phaseIds = new Set(scenario.phases.map((p) => p.id));

  for (const phase of scenario.phases) {
    if (!phase.transitions) continue;
    for (const transition of phase.transitions) {
      if (!phaseIds.has(transition.targetPhaseId)) {
        errors.push({
          path: `phases[${phase.id}].transitions`,
          message: `Transition targetPhaseId "${transition.targetPhaseId}" does not match any phase id`,
        });
      }
    }
  }

  // Check for circular references
  for (const phase of scenario.phases) {
    if (hasCircularPath(phase.id, scenario.phases, new Set())) {
      errors.push({
        path: `phases[${phase.id}]`,
        message: `Circular reference detected starting from phase "${phase.id}"`,
      });
      break; // One error is enough
    }
  }
}

function hasCircularPath(
  startId: string,
  phases: UnifiedScenario["phases"],
  visited: Set<string>
): boolean {
  if (visited.has(startId)) return true;
  visited.add(startId);

  const phase = phases.find((p) => p.id === startId);
  if (!phase?.transitions) return false;

  for (const t of phase.transitions) {
    if (hasCircularPath(t.targetPhaseId, phases, new Set(visited))) {
      return true;
    }
  }
  return false;
}

function validateDefaultPath(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  const defaultPhases = scenario.phases.filter((p) => p.isDefault === true || p.isDefault === undefined);
  if (defaultPhases.length === 0) {
    errors.push({
      path: "phases",
      message: "No default path phases found (at least one phase must have isDefault: true or omit isDefault)",
    });
  }
}

function validateEntryPhase(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  const hasEntry = scenario.phases.some((p) => !p.triggerCondition);
  if (!hasEntry) {
    errors.push({
      path: "phases",
      message: "No entry phase found — at least one phase must lack triggerCondition",
    });
  }
}

function validateMonitorState(
  phase: UnifiedScenario["phases"][0],
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
) {
  const ms = phase.monitorState;
  if (!ms) return;

  // ECG waveform vs rhythm check
  if (ms.ecgRhythm && ms.ecgWaveform !== undefined) {
    const expectedCode = ECG_RHYTHM_CODES[ms.ecgRhythm];
    if (expectedCode !== undefined && expectedCode !== ms.ecgWaveform) {
      errors.push({
        path: `phases[${phase.id}].monitorState`,
        message: `ecgWaveform ${ms.ecgWaveform} does not match ecgRhythm "${ms.ecgRhythm}" (expected ${expectedCode})`,
      });
    }
  }

  // Cardiac arrest detection
  const isArrestByWaveform = ms.ecgWaveform !== undefined && ARREST_WAVEFORM_CODES.has(ms.ecgWaveform);
  const isArrestByVitals = ms.hr === 0 && ms.bpSys === 0 && ms.bpDia === 0;

  if (isArrestByWaveform || isArrestByVitals) {
    if (ms.spo2 !== undefined && ms.spo2 !== 0) {
      errors.push({
        path: `phases[${phase.id}].monitorState`,
        message: `Cardiac arrest detected but spo2 is ${ms.spo2} (must be 0)`,
      });
    }
    if (ms.visibility?.spo2Visible !== false) {
      errors.push({
        path: `phases[${phase.id}].monitorState.visibility`,
        message: `Cardiac arrest detected but spo2Visible is not false`,
      });
    }
  }

  // Obstruction range
  if (ms.obstruction !== undefined && (ms.obstruction < 0 || ms.obstruction > 100)) {
    errors.push({
      path: `phases[${phase.id}].monitorState.obstruction`,
      message: `Obstruction ${ms.obstruction} out of range 0-100`,
    });
  }

  // HR vs rhythm label warnings
  if (ms.ecgRhythm && ms.hr !== undefined) {
    if (ms.ecgRhythm === "Sinus Bradycardia" && ms.hr >= 60) {
      warnings.push({
        path: `phases[${phase.id}].monitorState`,
        message: `HR ${ms.hr} inconsistent with ecgRhythm "Sinus Bradycardia" (expected <60)`,
      });
    }
    if (ms.ecgRhythm === "Sinus Tachycardia" && ms.hr <= 100) {
      warnings.push({
        path: `phases[${phase.id}].monitorState`,
        message: `HR ${ms.hr} inconsistent with ecgRhythm "Sinus Tachycardia" (expected >100)`,
      });
    }
    if (ms.ecgRhythm === "Normal Sinus Rhythm" && (ms.hr < 60 || ms.hr > 100)) {
      warnings.push({
        path: `phases[${phase.id}].monitorState`,
        message: `HR ${ms.hr} outside normal range for "Normal Sinus Rhythm" (expected 60-100)`,
      });
    }
  }
}

function validateClinicalConsistency(
  phase: UnifiedScenario["phases"][0],
  warnings: ValidationIssue[]
) {
  const cp = phase.clinicalPresentation;
  if (!cp) return;

  // AVPU vs GCS consistency
  if (cp.avpu && cp.gcs) {
    const gcsTotal = cp.gcs.eye + cp.gcs.verbal + cp.gcs.motor;
    if (cp.avpu === "Unresponsive" && gcsTotal > 6) {
      warnings.push({
        path: `phases[${phase.id}].clinicalPresentation`,
        message: `AVPU is "Unresponsive" but GCS total is ${gcsTotal} (expected ≤6)`,
      });
    }
    if (cp.avpu === "Alert" && gcsTotal < 14) {
      warnings.push({
        path: `phases[${phase.id}].clinicalPresentation`,
        message: `AVPU is "Alert" but GCS total is ${gcsTotal} (expected ≥14)`,
      });
    }
  }

  // Skin signs vs vitals consistency
  const ms = phase.monitorState;
  if (cp.skin && ms) {
    const skinDesc = [cp.skin.color, cp.skin.temperature, cp.skin.moisture]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    // Hypotension + tachycardia should show poor perfusion signs
    if (ms.bpSys !== undefined && ms.bpSys < 90 && ms.hr !== undefined && ms.hr > 100) {
      if (skinDesc.includes("warm") && skinDesc.includes("pink") && skinDesc.includes("dry")) {
        warnings.push({
          path: `phases[${phase.id}].clinicalPresentation.skin`,
          message: `Skin signs "warm, pink, dry" inconsistent with hypotension (BP ${ms.bpSys}) and tachycardia (HR ${ms.hr}) — expect poor perfusion signs`,
        });
      }
    }
  }
}

function validateWeight(scenario: UnifiedScenario, warnings: ValidationIssue[]) {
  const w = scenario.patient?.weight;
  if (w !== undefined && (typeof w !== "number" || w <= 0)) {
    warnings.push({
      path: "patient.weight",
      message: `Weight ${w} is invalid (must be a positive number)`,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/validation/validator.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/validation/validator.ts src/validation/validator.test.ts
git commit -m "feat: add unified scenario validator with error/warning severity levels"
```

---

## Chunk 4: REALITi Export

### Task 5: Build REALITi export function

**Files:**
- Create: `src/export/realiti.ts`
- Test: `src/export/realiti.test.ts`

Transforms unified JSON → REALITi-compatible JSON. Reference: design spec "Export" section and the mapping table in `paramedic-scenario-architecture.md` lines 425-467.

- [ ] **Step 1: Write the failing test**

```typescript
// src/export/realiti.test.ts
import { exportRealiti } from "./realiti";
import { UnifiedScenario } from "../types/schema";

// Full example scenario from paramedic-scenario-architecture.md
// (using a minimal but complete version for testing)
function makeTestScenario(): UnifiedScenario {
  return {
    meta: {
      id: "hypo-001",
      name: "Hypoglycemic Emergency",
      difficulty: "intermediate",
      protocols: ["medical-hypoglycemia"],
      totalTimeSeconds: 900,
      tags: ["diabetes"],
    },
    patient: {
      name: "Robert Chen",
      age: 55,
      sex: "male",
      weight: 88,
      height: 175,
      chiefComplaint: "Unresponsive male",
      history: {
        hpi: "55-year-old male found unresponsive on kitchen floor.",
        pastMedical: ["Type 2 DM"],
        medications: ["Insulin glargine"],
        allergies: ["Sulfa"],
      },
    },
    scene: { location: "Kitchen" },
    phases: [
      {
        id: "initial",
        name: "Initial Contact",
        description: "Patient found unresponsive",
        isDefault: true,
        clinicalPresentation: { avpu: "Pain" },
        monitorState: {
          ecgRhythm: "Sinus Tachycardia",
          ecgWaveform: 9,
          hr: 112,
          bpSys: 148,
          bpDia: 92,
          respRate: 22,
          spo2: 97,
          etco2: 32,
          temp: 36.4,
          glucose: 28,
          trendTimeSeconds: 0,
          visibility: { spo2Visible: true, spo2Attached: true, rrVisible: true, etco2Visible: false, cvpVisible: false },
        },
        expectedActions: [
          { id: "check-glucose", action: "Check blood glucose", priority: "critical" },
        ],
      },
      {
        id: "seizure",
        name: "Seizure Branch",
        description: "Patient seizes",
        isDefault: false,
        clinicalPresentation: { avpu: "Unresponsive" },
        monitorState: { hr: 138, bpSys: 172, bpDia: 104, ecgWaveform: 9 },
        expectedActions: [],
      },
    ],
    assessment: {
      criticalActions: ["Blood glucose checked", "Dextrose administered"],
      expectedActions: ["SAMPLE history obtained"],
    },
    debriefing: {
      learningObjectives: ["Recognize hypoglycemia", "Select appropriate treatment"],
    },
    realiti: { scenarioMonitorType: 20 },
  };
}

describe("exportRealiti", () => {
  const result = exportRealiti(makeTestScenario());

  it("sets scenario-level fields correctly", () => {
    expect(result.scenarioId).toBe("hypo-001");
    expect(result.scenarioName).toBe("Hypoglycemic Emergency");
    expect(result.scenarioType).toBe("Vital Signs");
    expect(result.scenarioVersion).toBe(2);
    expect(result.isDemo).toBe(false);
    expect(result.isALSILegacy).toBe(false);
    expect(result.scenarioTime).toBe(900);
    expect(result.scenarioMonitorType).toBe(20);
  });

  it("maps patient information correctly", () => {
    const pi = result.patientInformation;
    expect(pi.patientName).toBe("Robert Chen");
    expect(pi.patientSex).toBe(1); // male → 1
    expect(pi.patientWeight).toBe(88.0);
    expect(pi.patientAge).toBe(55);
    expect(pi.patientPhotoId).toBe(66); // min(ceil(55*1.2), 100) = 66
    expect(pi.patientAdmitted).toBe(1);
  });

  it("excludes branch phases from scenarioEvents", () => {
    expect(result.scenarioEvents).toHaveLength(1);
    expect(result.scenarioEvents[0].name).toBe("Initial Contact");
  });

  it("maps monitor state to event parameters", () => {
    const params = result.scenarioEvents[0].parameters;
    expect(params.hr).toBe(112);
    expect(params.bpSys).toBe(148);
    expect(params.ecgWaveform).toBe(9);
    expect(params.custMeasure1).toBe(28); // glucose
    expect(params.custMeasureLabel1).toBe("mg/dL");
  });

  it("sets event-level constants", () => {
    const event = result.scenarioEvents[0];
    expect(event.type).toBe("ScenarioEvent");
    expect(event.monitorType).toBe(0);
    expect(event.jumpTime).toBe(0);
    expect(event.relatedMedia).toEqual([]);
    expect(event.relatedLabs).toEqual([]);
    expect(event.relatedSounds).toEqual([]);
  });

  it("sets defib flags based on rhythm", () => {
    const event = result.scenarioEvents[0];
    expect(event.defibShock).toBe(false); // code 9 is not shockable
    expect(event.defibDisarm).toBe(true); // non-shockable
  });

  it("builds checklist from assessment", () => {
    expect(result.checklist).toHaveLength(3); // 2 critical + 1 expected
    expect(result.checklist[0]).toEqual({
      title: "Blood glucose checked",
      type: "Check",
      value: 0,
      icon: 1,
    });
  });

  it("includes required empty arrays", () => {
    expect(result.labs).toEqual([]);
    expect(result.media).toEqual([]);
  });

  it("builds scenarioStory", () => {
    expect(result.scenarioStory.history).toContain("unresponsive");
    expect(result.scenarioStory.discussion).toBeTruthy();
    expect(result.scenarioStory.course).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/export/realiti.test.ts`
Expected: FAIL — module `./realiti` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/export/realiti.ts
import {
  UnifiedScenario,
  ECG_RHYTHM_CODES,
  SHOCKABLE_CODES,
  ARREST_WAVEFORM_CODES,
} from "../types/schema";

/**
 * Transforms unified scenario JSON into REALITi-compatible JSON.
 * Only includes default-path phases as scenarioEvents.
 * See: paramedic-scenario-architecture.md mapping table (lines 425-467)
 */
export function exportRealiti(scenario: UnifiedScenario): Record<string, any> {
  const defaultPhases = scenario.phases.filter((p) => p.isDefault === true || p.isDefault === undefined);
  const checklist = buildChecklist(scenario);

  return {
    scenarioId: scenario.meta.id,
    scenarioName: scenario.meta.name,
    scenarioType: "Vital Signs",
    scenarioVersion: 2,
    scenarioTime: scenario.meta.totalTimeSeconds,
    scenarioMonitorType: scenario.realiti?.scenarioMonitorType ?? 20,
    scenarioDefaultEnergy: scenario.realiti?.scenarioDefaultEnergy ?? 200,
    scenarioDefaultPacerThreshold: scenario.realiti?.scenarioDefaultPacerThreshold ?? 55,
    isDemo: false,
    isALSILegacy: false,
    scenarioStory: buildScenarioStory(scenario, defaultPhases),
    patientInformation: buildPatientInfo(scenario),
    labs: [],
    scenarioEvents: defaultPhases.map((phase) =>
      buildScenarioEvent(phase, checklist, scenario)
    ),
    checklist,
    media: [],
  };
}

function buildPatientInfo(scenario: UnifiedScenario): Record<string, any> {
  const p = scenario.patient;
  return {
    patientName: p.name,
    patientCondition: p.chiefComplaint,
    patientAge: p.age,
    patientAgeUnit: p.ageUnit ?? "years",
    patientAgeCategory: p.age >= 18 ? 0 : 1,
    patientSex: p.sex === "male" ? 1 : 2,
    patientHeight: p.height,
    patientWeight: parseFloat(p.weight.toFixed(1)), // ensure exactly one decimal
    patientPhotoId: Math.min(Math.ceil(p.age * 1.2), 100),
    patientAdmitted: 1,
  };
}

function buildScenarioEvent(
  phase: UnifiedScenario["phases"][0],
  checklist: Record<string, any>[],
  scenario: UnifiedScenario
): Record<string, any> {
  const ms = phase.monitorState;

  // Resolve ECG waveform from rhythm name if not provided
  let ecgWaveform = ms.ecgWaveform;
  if (ecgWaveform === undefined && ms.ecgRhythm) {
    ecgWaveform = ECG_RHYTHM_CODES[ms.ecgRhythm];
  }

  const isShockable = ecgWaveform !== undefined && SHOCKABLE_CODES.has(ecgWaveform);

  // Build parameters object
  const parameters: Record<string, any> = {};
  if (ecgWaveform !== undefined) parameters.ecgWaveform = ecgWaveform;
  if (ms.hr !== undefined) parameters.hr = ms.hr;
  if (ms.bpSys !== undefined) parameters.bpSys = ms.bpSys;
  if (ms.bpDia !== undefined) parameters.bpDia = ms.bpDia;
  if (ms.respRate !== undefined) parameters.respRate = ms.respRate;
  if (ms.spo2 !== undefined) parameters.spo2 = ms.spo2;
  if (ms.etco2 !== undefined) parameters.etco2 = ms.etco2;
  if (ms.temp !== undefined) parameters.temp = ms.temp;
  if (ms.obstruction !== undefined) parameters.obstruction = ms.obstruction;

  // Glucose → custMeasure1
  if (ms.glucose !== undefined) {
    parameters.custMeasure1 = ms.glucose;
    parameters.custMeasureLabel1 = "mg/dL";
  }

  // Custom measures (2 and 3)
  if (ms.customMeasures) {
    ms.customMeasures.forEach((cm, i) => {
      if (i === 0 && ms.glucose === undefined) {
        parameters.custMeasure1 = cm.value;
        parameters.custMeasureLabel1 = cm.label;
      } else if (i === 0 && ms.glucose !== undefined) {
        parameters.custMeasure2 = cm.value;
        parameters.custMeasureLabel2 = cm.label;
      } else if (i === 1) {
        const n = ms.glucose !== undefined ? 3 : 2;
        parameters[`custMeasure${n}`] = cm.value;
        parameters[`custMeasureLabel${n}`] = cm.label;
      }
    });
  }

  // Visibility toggles
  if (ms.visibility) {
    if (ms.visibility.spo2Visible !== undefined) parameters.spo2Visible = ms.visibility.spo2Visible;
    if (ms.visibility.spo2Attached !== undefined) parameters.spo2Attached = ms.visibility.spo2Attached;
    if (ms.visibility.rrVisible !== undefined) parameters.rrVisible = ms.visibility.rrVisible;
    if (ms.visibility.etco2Visible !== undefined) parameters.etco2Visible = ms.visibility.etco2Visible;
    if (ms.visibility.cvpVisible !== undefined) parameters.cvpVisible = ms.visibility.cvpVisible;
  }

  // Cardiac arrest enforcement
  const isArrest =
    (ecgWaveform !== undefined && ARREST_WAVEFORM_CODES.has(ecgWaveform)) ||
    (ms.hr === 0 && ms.bpSys === 0 && ms.bpDia === 0);
  if (isArrest) {
    parameters.spo2 = 0;
    parameters.spo2Visible = false;
  }

  // Link checklist items to this event
  const relatedChecklist = findRelatedChecklist(phase, checklist, scenario);

  return {
    type: "ScenarioEvent",
    name: phase.name,
    description: phase.description,
    monitorType: 0,
    trendTime: ms.trendTimeSeconds ?? 0,
    jumpTime: 0,
    defibShock: isShockable,
    defibDisarm: !isShockable,
    parameters,
    relatedMedia: [],
    relatedLabs: [],
    relatedChecklist,
    relatedSounds: [],
  };
}

function findRelatedChecklist(
  phase: UnifiedScenario["phases"][0],
  checklist: Record<string, any>[],
  scenario: UnifiedScenario
): string[] {
  if (!phase.expectedActions?.length) return [];

  // Match phase expectedActions to assessment items in the checklist
  const actionTexts = phase.expectedActions.map((a) => a.action.toLowerCase());
  return checklist
    .filter((item) =>
      actionTexts.some(
        (at) =>
          item.title.toLowerCase().includes(at) ||
          at.includes(item.title.toLowerCase())
      )
    )
    .map((item) => item.title);
}

function buildChecklist(scenario: UnifiedScenario): Record<string, any>[] {
  const items: Record<string, any>[] = [];
  const allActions = [
    ...(scenario.assessment.criticalActions ?? []),
    ...(scenario.assessment.expectedActions ?? []),
  ];
  for (const title of allActions) {
    items.push({ title, type: "Check", value: 0, icon: 1 });
  }
  return items;
}

function buildScenarioStory(
  scenario: UnifiedScenario,
  defaultPhases: UnifiedScenario["phases"]
): Record<string, any> {
  const history = scenario.patient.history.hpi ?? "";

  const discussion = (scenario.debriefing.learningObjectives ?? []).join(". ");

  const course = defaultPhases
    .map((p) => `${p.name}: ${p.description}`)
    .join(" → ");

  return { history, discussion, course };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/export/realiti.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/export/realiti.ts src/export/realiti.test.ts
git commit -m "feat: add REALITi export function with field mapping and defib logic"
```

---

## Chunk 5: System Prompts & Protocol Selector Agent

### Task 6: Write system prompts

**Files:**
- Create: `src/prompts/protocol-selector.ts`
- Create: `src/prompts/scenario-generator.ts`

System prompts for both stages. These are exported as functions that return the prompt string, since Stage 1 needs the protocol index injected.

- [ ] **Step 1: Write protocol selector prompt**

```typescript
// src/prompts/protocol-selector.ts
import { ProtocolEntry } from "../types/schema";
import { formatIndexForPrompt } from "../protocols/loader";

export function buildProtocolSelectorPrompt(index: ProtocolEntry[]): string {
  return `You are a protocol selector for a paramedic training scenario generator.

Your job: Given a scenario description, identify which EMS protocols are relevant and should inform the scenario generation.

## Available Protocols

${formatIndexForPrompt(index)}

## Tools

You have two tools:

1. **read_protocol(slug)** — Reads the full content of a protocol file. Use this to examine protocols you think might be relevant. After reading a protocol, look for cross-references (lines like "> See: slug") — if a cross-referenced protocol seems relevant to the scenario, read it too.

2. **done_selecting(selections)** — Call this when you've identified all relevant protocols. Provide an array of objects with:
   - slug: the protocol slug
   - rationale: a brief explanation of why this protocol is relevant to the scenario (1-2 sentences)

## Instructions

1. Read the user's scenario description carefully
2. Identify which protocols from the index are likely relevant based on the description, keywords, and clinical context
3. Use read_protocol to examine each candidate — confirm it's relevant before selecting
4. Check cross-references inside protocols — if they point to something relevant, read those too
5. When you're confident you have all relevant protocols, call done_selecting
6. Be thorough but don't over-select — only include protocols that are directly relevant to the scenario described
7. Typically 2-5 protocols are sufficient for most scenarios`;
}
```

- [ ] **Step 2: Write scenario generator prompt**

This prompt is large because it includes the full schema, ECG codes, and generation rules. All of this content comes from `paramedic-scenario-architecture.md`.

```typescript
// src/prompts/scenario-generator.ts
import { ECG_RHYTHM_CODES } from "../types/schema";

export function buildScenarioGeneratorPrompt(): string {
  const ecgTable = Object.entries(ECG_RHYTHM_CODES)
    .map(([rhythm, code]) => `  "${rhythm}": ${code}`)
    .join(",\n");

  return `You are a paramedic training scenario generator. Given a scenario description and relevant EMS protocols, you generate a complete structured scenario as JSON.

## Output Format

Return ONLY a valid JSON object conforming to the unified scenario schema below. No markdown, no code fences, no explanation — just the JSON.

## Unified Scenario Schema

The JSON must have these top-level keys: meta, patient, scene, phases, assessment, debriefing, realiti.

### meta (required)
- id (string, required): Unique scenario identifier, e.g., "hypo-001"
- name (string, required): Descriptive scenario name
- version (number): Default 1
- difficulty (string, required): "beginner", "intermediate", or "advanced"
- category (string): e.g., "Medical", "Trauma", "Cardiac"
- protocols (string[], required): Protocol slugs used
- totalTimeSeconds (number, required): Expected scenario duration
- createdAt (string): ISO date-time
- tags (string[]): Searchable tags

### patient (required)
- name (string, required): Realistic patient name
- age (number, required)
- ageUnit (string): Default "years"
- sex (string, required): "male" or "female"
- weight (number, required): In kg
- height (number, required): In cm
- chiefComplaint (string, required)
- history (object, required):
  - hpi (string): Detailed history of present illness
  - pastMedical (string[]): Past medical history
  - medications (string[]): Current medications with doses
  - allergies (string[]): Allergies with reaction type
  - lastOralIntake (string)
  - events (string): Events leading to EMS call

### scene
- location (string): Detailed location description
- time (string): Time and day context
- safety (string): Scene safety considerations
- bystanders (string): Who is present, what they report
- visualCues (string[]): What providers see on arrival

### phases (required, array)
Each phase has:
- id (string, required): Unique identifier for branching, e.g., "initial", "post-treatment"
- name (string, required): Phase display name
- description (string, required): What's happening clinically
- triggerCondition (string): What causes entry to this phase. Omit for the initial/entry phase.
- isDefault (boolean): true for the expected/happy path, false for branch phases. Default true.
- transitions (array): Conditional transitions to other phases
  - targetPhaseId (string): id of target phase
  - condition (string): Human-readable condition
  - conditionType: "action_not_taken", "action_taken", "time_elapsed", "vital_threshold"
  - timeoutSeconds (number): For time-based conditions
  - triggerActionIds (string[]): References to expectedActions[].id
- clinicalPresentation (object, required): What providers observe (NOT on monitor)
  - avpu: "Alert", "Verbal", "Pain", or "Unresponsive"
  - gcs: { eye: 1-4, verbal: 1-5, motor: 1-6 }
  - airway, breathing, circulation (strings): Detailed findings
  - skin: { color, temperature, moisture }
  - pupils, motorFunction (strings)
  - otherFindings (string[]): Additional observations
  - patientSpeech (string): What patient says if conscious
- monitorState (object, required): Values on the patient monitor
  - ecgRhythm (string): Human-readable rhythm name from the ECG table
  - ecgWaveform (number): REALITi code from the ECG table
  - hr, bpSys, bpDia, respRate, spo2, etco2, temp (numbers)
  - obstruction (number): 0-100 airway obstruction
  - glucose (number): Blood glucose mg/dL
  - customMeasures: array of { label, value }
  - trendTimeSeconds (number): How long transition to this state takes
  - visibility: { spo2Visible, spo2Attached, rrVisible, etco2Visible, cvpVisible }
- expectedActions (array): What providers should do in this phase
  - id (string, required): Unique action ID within this phase
  - action (string, required): The action description
  - priority (string, required): "critical", "important", or "supplemental"
  - rationale (string): Why this action matters
  - protocolReference (string): Protocol slug + section

### assessment (required)
- criticalActions (string[]): Must-do — failure = scenario failure
- expectedActions (string[]): Should-do
- bonusActions (string[]): Above-and-beyond mastery

### debriefing (required)
- learningObjectives (string[])
- discussionQuestions (string[])
- commonPitfalls (string[])
- keyTakeaways (string[])

### realiti (optional)
- scenarioMonitorType (number): Default 20
- scenarioDefaultEnergy (number): Default 200
- scenarioDefaultPacerThreshold (number): Default 55

## ECG Rhythm Code Table

You MUST select ecgRhythm from this list and set the matching ecgWaveform code:

{
${ecgTable}
}

### Shared-Code Rhythm Disambiguation

Several rhythms share waveform codes. Differentiate via vitals:
- Code 9: Normal Sinus (HR 60-100), Sinus Brady (HR <60), Sinus Tachy (HR >100), PEA (HR >0 but bpSys=0/bpDia=0)
- Code 3: Asystole (sustained), Sinus Arrest (transient pause)
- Code 12: Monomorphic VT, Polymorphic VT, Torsades (use Long QT context)
- Code 91: Idioventricular (HR 20-40), Accelerated Idioventricular (HR 40-100)

## Airway Obstruction Scale

Normal: 0 | Mild asthma: 15 | Moderate asthma: 40 | Severe asthma: 70
COPD exacerbation: 50 | Anaphylaxis: 60 | Foreign body: 80 | Complete/tension pneumo: 100

## Clinical Rules

1. Cardiac arrest (ecgWaveform 18 or 3, OR hr=0 + bpSys=0 + bpDia=0): set spo2=0, spo2Visible=false
2. AVPU must be consistent with GCS (Unresponsive ≤ GCS 6, Alert ≥ GCS 14)
3. Skin signs should match hemodynamic state
4. Include at least one branch phase showing consequences of delayed/incorrect treatment
5. Every expectedAction needs a unique id within its phase
6. The default path (isDefault: true) must form a logical clinical progression
7. At least one phase must have no triggerCondition (the entry phase)

## Generation Guidelines

- Create realistic, clinically accurate scenarios based on the protocols provided
- Include 3-5 phases on the default path, plus at least 1 branch phase
- Make expectedActions specific and protocol-referenced where possible
- Write detailed clinicalPresentation — this is what makes the scenario useful for teaching
- Include practical visual cues in the scene that hint at the diagnosis
- Write debriefing content that promotes critical thinking, not just recall`;
}
```

- [ ] **Step 3: Verify both compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/prompts/protocol-selector.ts src/prompts/scenario-generator.ts
git commit -m "feat: add system prompts for protocol selection and scenario generation"
```

---

### Task 7: Build protocol selector agent (Stage 1)

**Files:**
- Create: `src/agents/protocol-selector.ts`

This module runs the Stage 1 Claude conversation with the tool-use loop. It uses the `@anthropic-ai/sdk` directly.

- [ ] **Step 1: Write the implementation**

```typescript
// src/agents/protocol-selector.ts
import Anthropic from "@anthropic-ai/sdk";
import { ProtocolEntry, ProtocolSelection } from "../types/schema";
import { readProtocol } from "../protocols/loader";
import { buildProtocolSelectorPrompt } from "../prompts/protocol-selector";

const MAX_TOOL_CALLS = 15;

interface ProgressCallback {
  onReadProtocol: (slug: string) => void;
  onDoneSelecting: (selections: ProtocolSelection[]) => void;
}

/**
 * Runs Stage 1: Protocol Selection.
 * Uses Claude tool-use loop to select relevant protocols.
 * Returns the list of selected protocol slugs with rationales.
 */
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
      description:
        "Read the full content of an EMS protocol file by its slug. Use this to examine protocols that might be relevant to the scenario.",
      input_schema: {
        type: "object" as const,
        required: ["slug"],
        properties: {
          slug: {
            type: "string",
            description: "The protocol slug, e.g., 'medical-hypoglycemia'",
          },
        },
      },
    },
    {
      name: "done_selecting",
      description:
        "Call when you have identified all relevant protocols. Provide the list of selected protocols with rationales.",
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
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      messages,
    });

    // If model stopped without tool use, something went wrong
    if (response.stop_reason === "end_turn") {
      // Extract any text response and throw
      const textContent = response.content.find((c) => c.type === "text");
      throw new Error(
        `Protocol selector ended without calling done_selecting. Response: ${
          textContent ? (textContent as any).text : "none"
        }`
      );
    }

    // Process tool use blocks
    const toolUseBlocks = response.content.filter(
      (c) => c.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      throw new Error("No tool use in response");
    }

    // Add the assistant message to history
    messages.push({ role: "assistant", content: response.content });

    // Check if done_selecting is in this batch — process it last
    const doneBlock = toolUseBlocks.find(
      (b) => b.type === "tool_use" && b.name === "done_selecting"
    );

    // Build tool results for read_protocol calls
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
        // Add a tool result for done_selecting too (API requires it)
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

    // Add tool results to conversation
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(
    `Protocol selection exceeded maximum tool calls (${MAX_TOOL_CALLS})`
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/agents/protocol-selector.ts
git commit -m "feat: add protocol selector agent with tool-use loop"
```

---

## Chunk 6: Scenario Generator Agent & CLI

### Task 8: Build scenario generator agent (Stage 2)

**Files:**
- Create: `src/agents/scenario-generator.ts`

Runs the Stage 2 Claude conversation — generates unified JSON, validates, retries up to 3 times.

- [ ] **Step 1: Write the implementation**

```typescript
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

/**
 * Runs Stage 2: Scenario Generation.
 * Sends user input + protocol context to Claude, validates output,
 * retries up to 3 times if validation fails.
 * Returns the unified scenario JSON and final validation result.
 */
export async function generateScenario(
  userInput: string,
  protocols: { slug: string; rationale: string; content: string }[],
  apiKey: string,
  progress: ProgressCallback
): Promise<{ scenario: UnifiedScenario; validation: ValidationResult }> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildScenarioGeneratorPrompt();

  // Build user message with protocols and rationales
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

    // Extract text content
    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in generation response");
    }

    const rawText = (textBlock as Anthropic.TextBlock).text.trim();

    // Try to parse JSON — strip code fences if present
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
      // Retry with parse error context
      messages.push({ role: "assistant", content: rawText });
      messages.push({
        role: "user",
        content: `Your response was not valid JSON. Parse error: ${parseErr}. Please return ONLY a valid JSON object with no markdown or code fences.`,
      });
      continue;
    }

    // Validate
    progress.onValidating();
    const validation = validateScenario(scenario);
    progress.onValidationResult(validation, attempt);

    if (validation.valid) {
      return { scenario, validation };
    }

    // If we've exhausted retries, return what we have
    if (attempt > MAX_RETRIES) {
      return { scenario, validation };
    }

    // Retry with validation errors
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/agents/scenario-generator.ts
git commit -m "feat: add scenario generator agent with validation retry loop"
```

---

### Task 9: Build interactive CLI entry point

**Files:**
- Create: `src/index.ts`

The CLI entry point — prompts for input, shows progress, orchestrates the full pipeline.

- [ ] **Step 1: Write the implementation**

```typescript
// src/index.ts
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { loadProtocolIndex, readProtocol } from "./protocols/loader";
import { selectProtocols } from "./agents/protocol-selector";
import { generateScenario } from "./agents/scenario-generator";
import { exportRealiti } from "./export/realiti";
import { ValidationResult } from "./types/schema";

const PROTOCOL_DIR = path.resolve(__dirname, "../protocol_docs");
const OUTPUT_DIR = path.resolve(__dirname, "../output");

function printHeader() {
  console.log("");
  console.log("╭──────────────────────────────────────╮");
  console.log("│  Paramedic Scenario Generator        │");
  console.log("╰──────────────────────────────────────╯");
  console.log("");
}

function printValidation(result: ValidationResult) {
  for (const w of result.warnings) {
    console.log(`  ⚠ WARNING: ${w.path}: ${w.message}`);
  }
  for (const e of result.errors) {
    console.log(`  ✗ ERROR: ${e.path}: ${e.message}`);
  }
  if (result.valid) {
    console.log(
      `  ✓ Valid (${result.warnings.length} warning${result.warnings.length !== 1 ? "s" : ""}, 0 errors)`
    );
  } else {
    console.log(
      `  ✗ Invalid (${result.warnings.length} warning${result.warnings.length !== 1 ? "s" : ""}, ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""})`
    );
  }
}

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  printHeader();

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // Get user input
  const userInput = await promptUser("Describe your scenario:\n> ");
  if (!userInput) {
    console.error("No scenario description provided.");
    process.exit(1);
  }

  console.log("");

  // Load protocol index
  console.log("Loading protocol index...");
  const protocolIndex = loadProtocolIndex(PROTOCOL_DIR);
  console.log(`  ${protocolIndex.length} protocols found`);
  console.log("");

  // Stage 1: Protocol Selection
  console.log("─── Stage 1: Protocol Selection ───");
  const selections = await selectProtocols(userInput, protocolIndex, apiKey, {
    onReadProtocol: (slug) => console.log(`  Reading: ${slug}`),
    onDoneSelecting: (sels) => {
      console.log(`  Selected ${sels.length} protocol${sels.length !== 1 ? "s" : ""}:`);
      for (const s of sels) {
        console.log(`    • ${s.slug} — ${s.rationale}`);
      }
    },
  });
  console.log("");

  // Load full protocol content for selected slugs
  const protocolsWithContent = selections.map((s) => ({
    slug: s.slug,
    rationale: s.rationale,
    content: readProtocol(s.slug, protocolIndex) ?? `Protocol not found: ${s.slug}`,
  }));

  // Stage 2: Scenario Generation
  console.log("─── Stage 2: Scenario Generation ───");
  const { scenario, validation } = await generateScenario(
    userInput,
    protocolsWithContent,
    apiKey,
    {
      onGenerating: () => console.log("  Generating scenario..."),
      onValidating: () => console.log("  Validating..."),
      onValidationResult: (result, attempt) => {
        if (attempt > 1) console.log(`  Validation attempt ${attempt}:`);
        printValidation(result);
      },
      onRetrying: (attempt, errors) => {
        console.log(`  Retrying (${attempt}/3)...`);
      },
    }
  );
  console.log("");

  // Export
  console.log("─── Export ───");
  // Sanitize scenario ID for use as directory name
  const safeId = scenario.meta.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const outputDir = path.join(OUTPUT_DIR, safeId);
  fs.mkdirSync(outputDir, { recursive: true });

  // Save unified JSON
  const unifiedPath = path.join(outputDir, "unified.json");
  fs.writeFileSync(unifiedPath, JSON.stringify(scenario, null, 2));
  console.log(`  ✓ ${path.relative(process.cwd(), unifiedPath)}`);

  // Export REALITi
  const realitiJson = exportRealiti(scenario);
  const realitiPath = path.join(outputDir, "realiti.json");
  fs.writeFileSync(realitiPath, JSON.stringify(realitiJson, null, 2));
  console.log(`  ✓ ${path.relative(process.cwd(), realitiPath)}`);

  // HTML export placeholder (Task 10)
  // const htmlPath = path.join(outputDir, "scenario.html");
  // fs.writeFileSync(htmlPath, exportHtml(scenario));
  // console.log(`  ✓ ${path.relative(process.cwd(), htmlPath)}`);

  console.log("");
  console.log(`Done! Generated "${scenario.meta.name}"`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Add a start script to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "start": "ts-node src/index.ts",
    "test": "jest"
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: add interactive CLI entry point with progress display"
```

---

## Chunk 7: HTML Export

### Task 10: Build HTML template and export function

**Files:**
- Create: `src/export/html.ts`
- Create: `templates/scenario.html`
- Test: `src/export/html.test.ts`

The HTML export takes the unified JSON and fills a template derived from `scenario-hypoglycemia-mobile.html`. The template uses placeholder tokens like `{{SCENARIO_NAME}}` that get replaced with data.

Rather than include the full 46KB HTML template inline in this plan, the approach is:

1. Copy `scenario-hypoglycemia-mobile.html` to `templates/scenario.html`
2. Replace all hardcoded scenario data with placeholder tokens
3. The export function reads the template, replaces tokens, and injects dynamic HTML for phases/tabs

- [ ] **Step 1: Write the failing test**

```typescript
// src/export/html.test.ts
import { exportHtml } from "./html";
import { UnifiedScenario } from "../types/schema";

function makeTestScenario(): UnifiedScenario {
  return {
    meta: {
      id: "test-001",
      name: "Test Scenario",
      difficulty: "intermediate",
      category: "Medical",
      protocols: ["medical-hypoglycemia"],
      totalTimeSeconds: 900,
      tags: ["diabetes", "hypoglycemia"],
    },
    patient: {
      name: "John Doe",
      age: 55,
      sex: "male",
      weight: 80,
      height: 175,
      chiefComplaint: "Unresponsive",
      history: {
        hpi: "Found unresponsive on floor",
        pastMedical: ["Diabetes"],
        medications: ["Insulin"],
        allergies: ["NKDA"],
        lastOralIntake: "Last night",
        events: "Wife heard thud",
      },
    },
    scene: {
      location: "Home kitchen",
      time: "0800",
      safety: "Scene safe",
      bystanders: "Wife present",
      visualCues: ["Patient on floor", "Insulin pen nearby"],
    },
    phases: [
      {
        id: "initial",
        name: "Initial Contact",
        description: "Patient found unresponsive",
        isDefault: true,
        clinicalPresentation: {
          avpu: "Pain",
          gcs: { eye: 2, verbal: 2, motor: 4 },
          airway: "Patent",
          breathing: "Rapid",
          circulation: "Tachycardic",
          skin: { color: "Pale", temperature: "Cool", moisture: "Diaphoretic" },
          pupils: "PERRL 4mm",
        },
        monitorState: {
          ecgRhythm: "Sinus Tachycardia",
          ecgWaveform: 9,
          hr: 112,
          bpSys: 148,
          bpDia: 92,
          respRate: 22,
          spo2: 97,
          glucose: 28,
        },
        expectedActions: [
          {
            id: "check-glucose",
            action: "Check blood glucose",
            priority: "critical",
            rationale: "Protocol requires glucose check",
          },
        ],
      },
    ],
    assessment: {
      criticalActions: ["Check glucose"],
      expectedActions: ["Get SAMPLE history"],
      bonusActions: ["Discuss insulin management"],
    },
    debriefing: {
      learningObjectives: ["Recognize hypoglycemia"],
      discussionQuestions: ["Why IV dextrose?"],
      commonPitfalls: ["Giving oral glucose to unresponsive patient"],
      keyTakeaways: ["Always check glucose on altered patients"],
    },
  };
}

describe("exportHtml", () => {
  it("returns a complete HTML document", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes scenario metadata", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("Test Scenario");
    expect(html).toContain("intermediate");
    expect(html).toContain("Medical");
  });

  it("includes patient information", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("John Doe");
    expect(html).toContain("Unresponsive");
  });

  it("includes phase data", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("Initial Contact");
    expect(html).toContain("Check blood glucose");
  });

  it("includes vital signs", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("112"); // HR
    expect(html).toContain("148"); // bpSys
    expect(html).toContain("28"); // glucose
  });

  it("includes debriefing content", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("Recognize hypoglycemia");
    expect(html).toContain("Why IV dextrose?");
  });

  it("is self-contained (no external JS dependencies)", () => {
    const html = exportHtml(makeTestScenario());
    // Should not reference external JS files
    expect(html).not.toMatch(/src=["']https?:\/\//);
    // CSS font link is OK (Google Fonts)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/export/html.test.ts`
Expected: FAIL — module `./html` not found

- [ ] **Step 3: Create the HTML template**

Copy `scenario-hypoglycemia-mobile.html` to `templates/scenario.html`. Then the export function will programmatically generate the HTML by reading this template for CSS/JS and injecting scenario-specific content.

The approach: rather than token replacement (which is fragile with a 46KB HTML file), the export function builds the complete HTML programmatically — extracting the CSS from the template and constructing the body from the scenario data. This keeps the template as a visual reference and CSS source.

```bash
cp scenario-hypoglycemia-mobile.html templates/scenario.html
```

- [ ] **Step 4: Write the export function**

```typescript
// src/export/html.ts
import fs from "fs";
import path from "path";
import { UnifiedScenario, Phase } from "../types/schema";

const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/scenario.html");

/**
 * Exports a unified scenario to a self-contained interactive HTML document.
 * Reads CSS from the template file and builds HTML body from scenario data.
 */
export function exportHtml(scenario: UnifiedScenario): string {
  const css = extractCss();
  const js = buildJs(scenario);
  const body = buildBody(scenario);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>${escHtml(scenario.meta.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>`;
}

function extractCss(): string {
  let css = "";
  try {
    const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    const match = template.match(/<style>([\s\S]*?)<\/style>/);
    css = match ? match[1] : "";
  } catch {
    css = "body { font-family: sans-serif; padding: 20px; }";
  }

  // Ensure hint styles exist (may not be in the static template)
  if (!css.includes("hint-branch")) {
    css += `
.phase-tab.hint-branch .hint-dot{display:block;background:var(--red,#dc2626);animation:pulse-hint 1s infinite}
.phase-tab.hint-next .hint-dot{display:block;background:var(--green,#16a34a);animation:pulse-hint 1.5s infinite}
@keyframes pulse-hint{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
.hint-dot{display:none;width:7px;height:7px;border-radius:50%;position:absolute;top:6px;right:4px}
.action-card.open .action-detail{display:block}
.action-detail{display:none;padding:8px 14px 14px 40px;font-size:13px;color:var(--text-secondary,#57534e)}
.action-priority{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px}
.priority-critical{background:var(--red-light,#fef2f2);color:var(--red,#dc2626)}
.priority-important{background:var(--orange-light,#fff7ed);color:var(--orange,#ea580c)}
.priority-supplemental{background:#f5f5f4;color:var(--text-muted,#a8a29e)}
.action-check{width:18px;height:18px;flex-shrink:0}
`;
  }

  return css;
}

function buildBody(scenario: UnifiedScenario): string {
  const s = scenario;
  const allPhases = s.phases;
  const defaultPhases = allPhases.filter((p) => p.isDefault !== false);
  const branchPhases = allPhases.filter((p) => p.isDefault === false);

  return `
<div class="top-bar">
  <div class="scenario-name">${escHtml(s.meta.name)}</div>
  <div class="scenario-tags">
    <span class="tag tag-difficulty">${escHtml(s.meta.difficulty)}</span>
    ${s.meta.category ? `<span class="tag tag-category">${escHtml(s.meta.category)}</span>` : ""}
    <span class="tag tag-time">${Math.round(s.meta.totalTimeSeconds / 60)} min</span>
  </div>
  <div class="phase-strip">
    <div class="phase-tab active" data-panel="scene" onclick="showPanel(this, 'scene')">Scene<span class="hint-dot"></span></div>
    ${allPhases.map((p) => `<div class="phase-tab${p.isDefault === false ? " branch" : ""}" data-panel="phase-${p.id}" onclick="showPanel(this, 'phase-${p.id}')">${escHtml(p.name)}<span class="hint-dot"></span></div>`).join("\n    ")}
    <div class="phase-tab" data-panel="assessment" onclick="showPanel(this, 'assessment')">Assessment<span class="hint-dot"></span></div>
    <div class="phase-tab" data-panel="debrief" onclick="showPanel(this, 'debrief')">Debrief<span class="hint-dot"></span></div>
  </div>
</div>
<div class="content">
  ${buildScenePanel(s)}
  ${allPhases.map((p) => buildPhasePanel(p)).join("\n")}
  ${buildAssessmentPanel(s)}
  ${buildDebriefPanel(s)}
</div>`;
}

function buildScenePanel(s: UnifiedScenario): string {
  const scene = s.scene;
  const p = s.patient;
  const h = p.history;

  return `
<div class="panel active" id="panel-scene">
  <div class="card accordion" onclick="this.classList.toggle('open')">
    <div class="card-title">Scene Setup</div>
    <div class="accordion-body">
      ${scene?.location ? `<div class="scene-row"><div class="scene-label">Location</div><div class="scene-value">${escHtml(scene.location)}</div></div>` : ""}
      ${scene?.time ? `<div class="scene-row"><div class="scene-label">Time</div><div class="scene-value">${escHtml(scene.time)}</div></div>` : ""}
      ${scene?.safety ? `<div class="scene-row"><div class="scene-label">Safety</div><div class="scene-value">${escHtml(scene.safety)}</div></div>` : ""}
      ${scene?.bystanders ? `<div class="scene-row"><div class="scene-label">Bystanders</div><div class="scene-value">${escHtml(scene.bystanders)}</div></div>` : ""}
      ${scene?.visualCues?.length ? `<div class="scene-row"><div class="scene-label">Visual Cues</div><ul class="cue-list">${scene.visualCues.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul></div>` : ""}
    </div>
  </div>

  <div class="card">
    <div class="card-title">Patient Information</div>
    <div class="card-content">
      <div class="patient-chips">
        <div class="patient-chip"><strong>${escHtml(p.name)}</strong></div>
        <div class="patient-chip">${p.age} ${p.ageUnit ?? "years"}</div>
        <div class="patient-chip">${p.sex}</div>
        <div class="patient-chip">${p.weight}kg</div>
        <div class="patient-chip">${p.height}cm</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">SAMPLE History</div>
    <div class="card-content">
      <div class="sample-grid">
        <div class="sample-cell full"><span class="sample-letter">S</span><div class="sample-name">Signs/Symptoms</div><div class="sample-text">${escHtml(p.chiefComplaint)}</div></div>
        <div class="sample-cell"><span class="sample-letter">A</span><div class="sample-name">Allergies</div><div class="sample-text">${escHtml((h.allergies ?? []).join(", ") || "NKDA")}</div></div>
        <div class="sample-cell"><span class="sample-letter">M</span><div class="sample-name">Medications</div><div class="sample-text">${escHtml((h.medications ?? []).join(", ") || "None")}</div></div>
        <div class="sample-cell"><span class="sample-letter">P</span><div class="sample-name">Past Medical</div><div class="sample-text">${escHtml((h.pastMedical ?? []).join(", ") || "None")}</div></div>
        <div class="sample-cell"><span class="sample-letter">L</span><div class="sample-name">Last Oral Intake</div><div class="sample-text">${escHtml(h.lastOralIntake ?? "Unknown")}</div></div>
        <div class="sample-cell full"><span class="sample-letter">E</span><div class="sample-name">Events</div><div class="sample-text">${escHtml(h.events ?? h.hpi ?? "")}</div></div>
      </div>
    </div>
  </div>
</div>`;
}

function buildPhasePanel(phase: Phase): string {
  const cp = phase.clinicalPresentation;
  const ms = phase.monitorState;
  const isBranch = phase.isDefault === false;

  const avpuMap: Record<string, string> = { Alert: "sel-a", Verbal: "sel-v", Pain: "sel-p", Unresponsive: "sel-u" };

  return `
<div class="panel" id="panel-phase-${phase.id}">
  <div class="card phase-card${isBranch ? " branch-card" : ""}">
    <div class="card-content">
      <div class="phase-title">${escHtml(phase.name)}</div>
      ${phase.triggerCondition ? `<div class="phase-trigger">▸ ${escHtml(phase.triggerCondition)}</div>` : ""}
      <div class="phase-desc">${escHtml(phase.description)}</div>
    </div>
  </div>

  ${cp?.avpu ? `
  <div class="card">
    <div class="card-title">Level of Consciousness</div>
    <div class="card-content">
      <div class="avpu-bar">
        ${["Alert", "Verbal", "Pain", "Unresponsive"].map((level) => `<div class="avpu-seg${cp.avpu === level ? ` ${avpuMap[level]}` : ""}">${level[0]}</div>`).join("")}
      </div>
      ${cp.gcs ? `<div class="gcs-row">GCS: E${cp.gcs.eye} V${cp.gcs.verbal} M${cp.gcs.motor} = <span class="gcs-total">${cp.gcs.eye + cp.gcs.verbal + cp.gcs.motor}</span></div>` : ""}
    </div>
  </div>` : ""}

  <div class="card">
    <div class="card-title">Vital Signs</div>
    <div class="card-content">
      <div class="vitals-grid">
        ${vitalCell("HR", ms.hr, "bpm")}
        ${vitalCell("BP", ms.bpSys && ms.bpDia ? `${ms.bpSys}/${ms.bpDia}` : undefined, "mmHg")}
        ${vitalCell("RR", ms.respRate, "/min")}
        ${vitalCell("SpO2", ms.spo2, "%")}
        ${vitalCell("EtCO2", ms.etco2, "mmHg")}
        ${vitalCell("Temp", ms.temp, "°C")}
        ${ms.glucose !== undefined ? vitalCell("Glucose", ms.glucose, "mg/dL") : ""}
      </div>
      ${ms.ecgRhythm ? `<div class="ecg-label">ECG: ${escHtml(ms.ecgRhythm)}</div>` : ""}
    </div>
  </div>

  ${cp ? `
  <div class="card">
    <div class="card-title">Physical Findings</div>
    <div class="card-content">
      ${cp.airway ? `<div class="finding-row"><div class="finding-label">Airway</div><div class="finding-value">${escHtml(cp.airway)}</div></div>` : ""}
      ${cp.breathing ? `<div class="finding-row"><div class="finding-label">Breathing</div><div class="finding-value">${escHtml(cp.breathing)}</div></div>` : ""}
      ${cp.circulation ? `<div class="finding-row"><div class="finding-label">Circulation</div><div class="finding-value">${escHtml(cp.circulation)}</div></div>` : ""}
      ${cp.skin ? `<div class="finding-row"><div class="finding-label">Skin</div><div class="skin-chips">${[cp.skin.color, cp.skin.temperature, cp.skin.moisture].filter(Boolean).map((s) => `<span class="skin-chip">${escHtml(s!)}</span>`).join("")}</div></div>` : ""}
      ${cp.pupils ? `<div class="finding-row"><div class="finding-label">Pupils</div><div class="finding-value">${escHtml(cp.pupils)}</div></div>` : ""}
      ${cp.motorFunction ? `<div class="finding-row"><div class="finding-label">Motor</div><div class="finding-value">${escHtml(cp.motorFunction)}</div></div>` : ""}
      ${cp.patientSpeech ? `<div class="finding-row"><div class="finding-label">Speech</div><div class="finding-value speech">"${escHtml(cp.patientSpeech)}"</div></div>` : ""}
      ${cp.otherFindings?.length ? `<ul class="findings-notes">${cp.otherFindings.map((f) => `<li>${escHtml(f)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>` : ""}

  ${phase.expectedActions?.length ? `
  <div class="card">
    <div class="card-title">Expected Actions</div>
    <div class="card-content">
      ${phase.expectedActions.map((a) => `
      <div class="action-card">
        <div class="action-top" onclick="this.parentElement.classList.toggle('open')">
          <input type="checkbox" class="action-check" data-action-id="${a.id}" data-phase-id="${phase.id}" onclick="event.stopPropagation(); updateHints();">
          <span class="action-priority priority-${a.priority}">${a.priority.toUpperCase()}</span>
          <span class="action-text">${escHtml(a.action)}</span>
        </div>
        ${a.rationale ? `<div class="action-detail"><div class="action-rationale">${escHtml(a.rationale)}</div>${a.protocolReference ? `<div class="action-protocol">${escHtml(a.protocolReference)}</div>` : ""}</div>` : ""}
      </div>`).join("")}
    </div>
  </div>` : ""}
</div>`;
}

function buildAssessmentPanel(s: UnifiedScenario): string {
  const a = s.assessment;
  return `
<div class="panel" id="panel-assessment">
  <div class="card">
    <div class="card-title">Critical Actions</div>
    <div class="card-content">
      ${(a.criticalActions ?? []).map((action) => `<div class="action-card"><div class="action-top"><input type="checkbox"><span class="action-priority priority-critical">CRITICAL</span><span class="action-text">${escHtml(action)}</span></div></div>`).join("")}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Expected Actions</div>
    <div class="card-content">
      ${(a.expectedActions ?? []).map((action) => `<div class="action-card"><div class="action-top"><input type="checkbox"><span class="action-priority priority-important">EXPECTED</span><span class="action-text">${escHtml(action)}</span></div></div>`).join("")}
    </div>
  </div>
  ${(a.bonusActions ?? []).length ? `
  <div class="card">
    <div class="card-title">Bonus Actions</div>
    <div class="card-content">
      ${(a.bonusActions ?? []).map((action) => `<div class="action-card"><div class="action-top"><input type="checkbox"><span class="action-priority priority-supplemental">BONUS</span><span class="action-text">${escHtml(action)}</span></div></div>`).join("")}
    </div>
  </div>` : ""}
</div>`;
}

function buildDebriefPanel(s: UnifiedScenario): string {
  const d = s.debriefing;
  return `
<div class="panel" id="panel-debrief">
  ${(d.learningObjectives ?? []).length ? `
  <div class="card">
    <div class="card-title">Learning Objectives</div>
    <div class="card-content"><ul class="findings-notes">${(d.learningObjectives ?? []).map((o) => `<li>${escHtml(o)}</li>`).join("")}</ul></div>
  </div>` : ""}
  ${(d.discussionQuestions ?? []).length ? `
  <div class="card">
    <div class="card-title">Discussion Questions</div>
    <div class="card-content"><ul class="findings-notes">${(d.discussionQuestions ?? []).map((q) => `<li>${escHtml(q)}</li>`).join("")}</ul></div>
  </div>` : ""}
  ${(d.commonPitfalls ?? []).length ? `
  <div class="card">
    <div class="card-title">Common Pitfalls</div>
    <div class="card-content"><ul class="findings-notes">${(d.commonPitfalls ?? []).map((p) => `<li>${escHtml(p)}</li>`).join("")}</ul></div>
  </div>` : ""}
  ${(d.keyTakeaways ?? []).length ? `
  <div class="card">
    <div class="card-title">Key Takeaways</div>
    <div class="card-content"><ul class="findings-notes">${(d.keyTakeaways ?? []).map((t) => `<li>${escHtml(t)}</li>`).join("")}</ul></div>
  </div>` : ""}
</div>`;
}

function vitalCell(name: string, value: number | string | undefined, unit: string): string {
  if (value === undefined) return "";
  return `<div class="vital-cell"><div class="vital-name">${name}</div><div class="vital-val">${value}</div><div class="vital-unit">${unit}</div></div>`;
}

function buildJs(scenario: UnifiedScenario): string {
  // Serialize transitions for hint logic
  const transitionData = JSON.stringify(
    scenario.phases
      .filter((p) => p.transitions?.length)
      .map((p) => ({
        phaseId: p.id,
        transitions: p.transitions!.map((t) => ({
          targetPhaseId: t.targetPhaseId,
          triggerActionIds: t.triggerActionIds ?? [],
        })),
      }))
  );

  return `
var transitionData = ${transitionData};

function showPanel(tab, panelId) {
  document.querySelectorAll('.phase-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  var panel = document.getElementById('panel-' + panelId);
  if (panel) panel.classList.add('active');
}

function updateHints() {
  // Clear all hints
  document.querySelectorAll('.phase-tab').forEach(t => {
    t.classList.remove('hint-branch', 'hint-next');
  });

  transitionData.forEach(function(phase) {
    phase.transitions.forEach(function(t) {
      if (!t.triggerActionIds.length) return;

      // Check if trigger actions are completed
      var allCompleted = t.triggerActionIds.every(function(actionId) {
        var checkbox = document.querySelector('[data-action-id="' + actionId + '"]');
        return checkbox && checkbox.checked;
      });

      var targetTab = document.querySelector('[data-panel="phase-' + t.targetPhaseId + '"]');
      if (!targetTab) return;

      if (!allCompleted) {
        targetTab.classList.add('hint-branch');
      }
    });
  });
}

// Initialize hints
updateHints();

// Accordion toggle
document.querySelectorAll('.accordion').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (e.target.type === 'checkbox') return;
  });
});
`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/export/html.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 6: Wire HTML export into CLI**

In `src/index.ts`, uncomment the HTML export lines and add the import:

```typescript
import { exportHtml } from "./export/html";
```

And uncomment:
```typescript
  const htmlPath = path.join(outputDir, "scenario.html");
  fs.writeFileSync(htmlPath, exportHtml(scenario));
  console.log(`  ✓ ${path.relative(process.cwd(), htmlPath)}`);
```

- [ ] **Step 7: Verify everything compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/export/html.ts src/export/html.test.ts templates/scenario.html src/index.ts
git commit -m "feat: add HTML template export with phase tabs and hint system"
```

---

## Chunk 8: Integration & End-to-End Test

### Task 11: End-to-end integration test with example scenario

**Files:**
- Create: `src/integration.test.ts`

Test the full pipeline using the example hypoglycemia scenario from the architecture doc — feed it through validation and both exporters to verify the complete chain works.

- [ ] **Step 1: Write the integration test**

```typescript
// src/integration.test.ts
import { validateScenario } from "./validation/validator";
import { exportRealiti } from "./export/realiti";
import { exportHtml } from "./export/html";
import { UnifiedScenario } from "./types/schema";
import Ajv from "ajv";
import fs from "fs";
import path from "path";

// Load the example scenario from the architecture doc
// This is the complete hypoglycemia example (lines 777-1217)
const exampleScenario: UnifiedScenario = {
  meta: {
    id: "hypo-001",
    name: "Diabetic Found Unresponsive — Hypoglycemic Emergency",
    version: 1,
    difficulty: "intermediate",
    category: "Medical",
    protocols: ["medical-hypoglycemia", "medical-altered-mental-status"],
    totalTimeSeconds: 900,
    tags: ["diabetes", "hypoglycemia", "altered mental status"],
  },
  patient: {
    name: "Robert Chen",
    age: 55,
    sex: "male",
    weight: 88.0,
    height: 175,
    chiefComplaint: "Unresponsive male",
    history: {
      hpi: "55-year-old male found unresponsive on kitchen floor by wife.",
      pastMedical: ["Type 2 Diabetes Mellitus", "Hypertension"],
      medications: ["Insulin glargine 30 units daily", "Metformin 1000mg BID"],
      allergies: ["Sulfa — rash"],
      lastOralIntake: "Dinner last evening",
      events: "Wife heard a thud from the kitchen.",
    },
  },
  scene: {
    location: "Single-story residential home, kitchen",
    time: "0815, Tuesday morning",
    safety: "Scene is safe.",
    bystanders: "Wife present, anxious but cooperative.",
    visualCues: ["Patient supine on kitchen tile floor", "Insulin pen on counter"],
  },
  phases: [
    {
      id: "initial",
      name: "Initial Contact",
      description: "Patient found unresponsive. BGL 28.",
      triggerCondition: undefined,
      isDefault: true,
      transitions: [
        {
          targetPhaseId: "seizure",
          condition: "Dextrose not administered within 5 minutes",
          conditionType: "action_not_taken",
          timeoutSeconds: 300,
          triggerActionIds: ["establish-iv", "administer-d10"],
        },
      ],
      clinicalPresentation: {
        avpu: "Pain",
        gcs: { eye: 2, verbal: 2, motor: 4 },
        airway: "Patent",
        breathing: "Elevated rate, adequate depth",
        circulation: "Radial pulses present, rapid and weak",
        skin: { color: "Pale", temperature: "Cool", moisture: "Diaphoretic" },
        pupils: "PERRL, 4mm",
        patientSpeech: "Incomprehensible sounds only",
      },
      monitorState: {
        ecgRhythm: "Sinus Tachycardia",
        ecgWaveform: 9,
        hr: 112,
        bpSys: 148,
        bpDia: 92,
        respRate: 22,
        spo2: 97,
        etco2: 32,
        temp: 36.4,
        glucose: 28,
        trendTimeSeconds: 0,
        visibility: { spo2Visible: true, spo2Attached: true, rrVisible: true, etco2Visible: false, cvpVisible: false },
      },
      expectedActions: [
        { id: "check-glucose", action: "Check blood glucose", priority: "critical", rationale: "Protocol requires glucose check" },
        { id: "establish-iv", action: "Establish IV access", priority: "critical", rationale: "IV dextrose indicated" },
        { id: "administer-d10", action: "Administer D10 250mL IV", priority: "critical", rationale: "BGL ≤60" },
      ],
    },
    {
      id: "post-dextrose",
      name: "Post-Dextrose",
      description: "Patient improving after D10.",
      triggerCondition: "After D10 administered",
      isDefault: true,
      clinicalPresentation: { avpu: "Verbal", gcs: { eye: 3, verbal: 4, motor: 5 } },
      monitorState: { ecgRhythm: "Sinus Rhythm", ecgWaveform: 9, hr: 94, bpSys: 132, bpDia: 84, respRate: 18, spo2: 98, glucose: 68, trendTimeSeconds: 120 },
      expectedActions: [
        { id: "recheck-glucose", action: "Recheck blood glucose", priority: "critical" },
      ],
    },
    {
      id: "seizure",
      name: "Hypoglycemic Seizure",
      description: "Patient seizes due to prolonged hypoglycemia.",
      triggerCondition: "Dextrose not given within 5 minutes",
      isDefault: false,
      clinicalPresentation: {
        avpu: "Unresponsive",
        gcs: { eye: 1, verbal: 1, motor: 3 },
      },
      monitorState: { ecgRhythm: "Sinus Tachycardia", ecgWaveform: 9, hr: 138, bpSys: 172, bpDia: 104, respRate: 8, spo2: 88, glucose: 22, trendTimeSeconds: 30 },
      expectedActions: [
        { id: "sz-protect", action: "Protect patient from injury", priority: "critical" },
        { id: "sz-iv-d10", action: "Establish IV and give D10", priority: "critical" },
      ],
    },
  ],
  assessment: {
    criticalActions: ["Blood glucose checked", "IV access established", "D10 administered"],
    expectedActions: ["SAMPLE history obtained", "Glucose rechecked"],
    bonusActions: ["Used D10 instead of D50"],
  },
  debriefing: {
    learningObjectives: ["Recognize hypoglycemia", "Select appropriate treatment"],
    discussionQuestions: ["Why IV dextrose instead of oral?"],
    commonPitfalls: ["Giving oral glucose to unresponsive patient"],
    keyTakeaways: ["Always check glucose on altered patients"],
  },
  realiti: { scenarioMonitorType: 20 },
};

describe("Integration: full pipeline", () => {
  it("validates the example scenario successfully", () => {
    const result = validateScenario(exampleScenario);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("exports valid REALITi JSON", () => {
    const realiti = exportRealiti(exampleScenario);

    // Validate against REALITi schema
    const schemaPath = path.resolve(__dirname, "../realiti_scenario.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(realiti);

    if (!valid) {
      console.error("REALITi validation errors:", validate.errors);
    }
    expect(valid).toBe(true);

    // Verify branch phase excluded
    expect(realiti.scenarioEvents).toHaveLength(2); // initial + post-dextrose, not seizure
    expect(realiti.scenarioEvents.every((e: any) => e.name !== "Hypoglycemic Seizure")).toBe(true);

    // Verify glucose mapping
    expect(realiti.scenarioEvents[0].parameters.custMeasure1).toBe(28);
    expect(realiti.scenarioEvents[0].parameters.custMeasureLabel1).toBe("mg/dL");
  });

  it("exports valid HTML", () => {
    const html = exportHtml(exampleScenario);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Diabetic Found Unresponsive");
    // Branch phase IS included in HTML
    expect(html).toContain("Hypoglycemic Seizure");
    // All phase tabs present
    expect(html).toContain("Initial Contact");
    expect(html).toContain("Post-Dextrose");
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx jest src/integration.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/integration.test.ts
git commit -m "test: add end-to-end integration test with example hypoglycemia scenario"
```

---

### Task 12: Manual end-to-end test

Run the full CLI pipeline with a real API call to verify everything works together.

- [ ] **Step 1: Set API key and run**

```bash
export ANTHROPIC_API_KEY="your-key-here"
npm start
```

Enter a scenario like: `55yo diabetic male found unresponsive by wife, insulin pen nearby, BGL 28`

- [ ] **Step 2: Verify outputs exist**

```bash
ls output/*/
```

Expected: `unified.json`, `realiti.json`, `scenario.html` in a subdirectory

- [ ] **Step 3: Open HTML in browser and verify layout**

Open `output/*/scenario.html` in a browser. Verify:
- Phase tabs work
- Vital signs display correctly
- Expected actions are checkable
- Branch phase tab has visual indicator
- Debriefing tab has content

- [ ] **Step 4: Validate REALITi JSON manually**

Open `output/*/realiti.json` and verify:
- Only default-path phases present
- Patient info correct (sex as number, weight with decimal)
- Glucose mapped to custMeasure1
- Empty labs/media arrays present

- [ ] **Step 5: Commit any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual end-to-end testing"
```
