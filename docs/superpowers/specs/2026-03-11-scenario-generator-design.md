# Paramedic Scenario Generator — Design Spec

## Overview

An interactive CLI tool that takes a natural language scenario description, uses Claude to select relevant EMS protocols and generate a structured training scenario, then exports to REALITi patient monitor format and self-contained interactive HTML.

**Note:** The briefing doc left the execution context open. During brainstorming, TypeScript/Node was chosen as the runtime because the project may become a desktop application (Electron/Tauri), and the existing HTML template makes a web-tech stack the natural fit. The core logic is modular and importable — the CLI is just the first execution wrapper.

## Architecture

Two-stage pipeline with template-based HTML export.

### Stage 1: Protocol Selection (Conversation 1)

A Claude conversation with tool use that selects which EMS protocols are relevant to the user's scenario description.

**System prompt (cached):**
- Role instruction: protocol selector for paramedic training scenarios
- Full frontmatter index of all protocols (auto-generated at startup by scanning `protocol_docs/` and parsing YAML frontmatter — slug, section, description for each). This replaces the static `protocol-index.md` approach from the architecture doc — auto-scanning eliminates maintenance burden and can't drift out of sync. The `description` field in frontmatter provides sufficient semantic context for the model to match against user input without a separate keywords column.

**User message:** The scenario description provided by the user.

**Tools:**
- `read_protocol(slug: string)` — returns the full .md file content for a protocol. The model calls this for each protocol it believes is relevant. When it encounters cross-references (`> See: slug`) inside a protocol, it can call this again to load those too.
- `done_selecting(selections: { slug: string, rationale: string }[])` — breaks the loop. Returns the list of selected protocol slugs with a brief rationale for each explaining why it's relevant to the scenario.

**Loop behavior:**
1. Send user's scenario description as user message
2. Model responds with tool calls (`read_protocol` or `done_selecting`)
3. For `read_protocol`: load file from disk, return content as tool result, continue. If the slug doesn't match any file in `protocol_docs/`, return an error message as the tool result (e.g., "Protocol not found: xyz") and let the model continue.
4. For `done_selecting`: extract selections, end conversation
5. Safety cap: 15 tool calls max to prevent runaway loops

**Prompt caching:** System prompt marked with `cache_control: { type: "ephemeral" }`. The protocol index (~68 entries) is static across runs.

### Stage 2: Scenario Generation (Conversation 2)

A separate Claude conversation that generates the unified scenario JSON.

**System prompt (cached):**
- Role instruction: paramedic scenario generator
- Complete unified scenario schema (from architecture doc)
- ECG rhythm code table (42 entries)
- Airway obstruction scale
- Shared-code rhythm disambiguation rules
- REALITi-specific constraints (weight format, cardiac arrest rules, etc.)
- Generation instructions: output a single JSON object conforming to the schema

**User message (per-run):**
- Original scenario description from the user
- Full text of each selected protocol (loaded from disk using Stage 1's slug list)
- Rationale for each protocol selection (from Stage 1)
- Instruction to generate a complete unified scenario JSON

**No tools** — single output call. Model returns unified JSON directly.

**Validation retry loop:**
1. Parse JSON from model response
2. Run through validator — schema checks + business rules
3. If valid → proceed to export
4. If errors → append error list as new user message, model fixes and re-sends
5. Max 3 retry attempts
6. If still failing after 3 retries, save the JSON anyway and report errors

**Prompt caching:** System prompt cached. On retries, the growing conversation history is also cacheable — only the new error message is uncached.

### Validation

Two severity levels:

**Errors (trigger retry):**
- Required fields missing
- `ecgWaveform` doesn't match `ecgRhythm` per the 42-entry code table
- Cardiac arrest detection: `ecgWaveform` is 18 (VFib) or 3 (Asystole), OR `hr=0 AND bpSys=0 AND bpDia=0` — must have `spo2: 0` and `spo2Visible: false`
- `transitions[].targetPhaseId` references nonexistent phase id
- Circular phase references
- Default path (`isDefault: true` phases) doesn't form a valid linear sequence
- No entry phase (at least one phase must lack `triggerCondition`)

**Warnings (displayed, don't trigger retry):**
- Vital sign ranges physiologically questionable
- AVPU inconsistent with GCS (e.g., AVPU "Unresponsive" but GCS > 6)
- Skin signs inconsistent with vitals
- HR doesn't match ecgRhythm label (e.g., HR 112 with "Sinus Rhythm" instead of "Sinus Tachycardia")
- `weight` is not a number or is negative (the `00.0` formatting is applied during REALITi export, not validated here — JSON numbers don't preserve decimal formatting)

All validation results — errors and warnings — are displayed in the CLI regardless of pass/fail.

### Export

Pure code, no AI. Three outputs from the validated unified JSON:

**REALITi Export (`exportRealiti`):**
- Filters to `isDefault: true` phases only → `scenarioEvents[]`
- Scenario-level constants:
  - `scenarioType`: always `"Vital Signs"`
  - `scenarioVersion`: always `2`
  - `isDemo`: always `false`
  - `isALSILegacy`: always `false`
  - `scenarioMonitorType`: from `realiti.scenarioMonitorType` or default `20`
  - `scenarioDefaultEnergy`: from `realiti.scenarioDefaultEnergy` or default `200`
  - `scenarioDefaultPacerThreshold`: from `realiti.scenarioDefaultPacerThreshold` or default `55`
- Patient information mappings:
  - `patient.sex`: "male" → 1, "female" → 2
  - `patient.weight`: forced string `"00.0"` format (e.g., `80` → `"80.0"`)
  - `patientPhotoId`: `min(ceil(age * 1.2), 100)`
  - `patientAgeCategory`: derived from age (`0` = adult)
  - `patientAdmitted`: default `1`
- Scenario story composition:
  - `scenarioStory.history`: composed from `patient.history.hpi`
  - `scenarioStory.discussion`: joined from `debriefing.learningObjectives` as prose
  - `scenarioStory.course`: summarized from default-path phase descriptions and transitions
- Event-level mappings (per phase):
  - `type`: always `"ScenarioEvent"`
  - `monitorType`: default `0` (inherit from scenario)
  - `glucose` → `custMeasure1` + `custMeasureLabel1: "mg/dL"`
  - `ecgRhythm` → `ecgWaveform` lookup if not provided
  - `trendTimeSeconds` → `trendTime`. `jumpTime` defaults to `0` unless the phase represents a sudden event (the unified schema only has `trendTimeSeconds`; the export always sets `jumpTime: 0`)
  - Auto-set `defibShock: true` for shockable rhythms (codes 18, 12)
  - Auto-set `defibDisarm: true` for non-shockable rhythms
  - Cardiac arrest rule: `spo2: 0`, `spo2Visible: false`
  - `relatedChecklist`: link checklist items to relevant events by matching `assessment.criticalActions` and `assessment.expectedActions` to the phase's `expectedActions`
  - Required empty arrays: `relatedMedia: []`, `relatedLabs: []`, `relatedSounds: []`
- Top-level empty arrays: `labs: []`, `media: []`
- Checklist: maps `assessment.criticalActions` + `assessment.expectedActions` → `checklist[]` with `{ title, type: "Check", value: 0, icon: 1 }`
- Validates output against `realiti_scenario.schema.json` before writing

**HTML Export (`exportHtml`):**
- Template-based — uses `templates/scenario.html` as the template. This file is created from `scenario-hypoglycemia-mobile.html` (the visual design target from the briefing doc) by replacing hardcoded scenario data with placeholder tokens that the export function fills programmatically.
- Renders all phases including branch phases
- Populates: scenario header, patient info, scene setup, phase tabs, clinical presentation, monitor state, expected actions with expandable rationales, assessment checklist, debriefing tab
- Branch phase tabs get glow/pulse CSS class linked to `triggerActionIds`
- Single self-contained HTML file, no external dependencies

**Output structure:**
```
output/
  [scenario-id]/
    unified.json      # Source of truth
    realiti.json       # Paste into REALITi
    scenario.html      # Open in browser / print
```

The `scenario-id` comes from `meta.id` in the unified JSON (generated by Claude as part of the scenario). The output directory is created automatically.

## Scope Exclusions

The following are intentionally excluded from v1:

- **Advanced monitor parameters** (`cvp`, `icp`, `papSys`, `papDia`, `papMean`) — prehospital scenarios don't use them. The architecture doc documents them for completeness but they are not mapped in the unified schema.
- **`ecgVisible` toggle** — omitted from the unified schema's `visibility` object. ECG is always visible in prehospital scenarios. If needed later, can be added to the visibility object.
- **Labs and media** — per architecture and briefing docs, these are out of scope. REALITi export injects empty arrays.

## Error Handling

- **Protocol file not found:** If Stage 1's model requests a slug that doesn't exist in `protocol_docs/`, return an error message as the tool result. The model can continue selecting other protocols.
- **Frontmatter parse failure:** If a protocol .md file has malformed or missing YAML frontmatter, skip it during index building and log a warning at startup (e.g., "Skipping medical-foo.md: missing slug in frontmatter").
- **JSON parse failure:** If Stage 2's response isn't valid JSON, treat it as a validation error and retry.
- **Validation failure after retries:** Save the unified JSON anyway (for manual fixing) and display all errors in CLI.
- **API errors:** Surface the error message in CLI and exit. No automatic retry on API-level failures (rate limits, auth errors, etc.).

## File Layout

```
scenario_agent/
├── src/
│   ├── index.ts                       # CLI entry point — interactive prompt, progress display
│   ├── protocols/
│   │   └── loader.ts                  # Scan protocol_docs/, parse frontmatter, build index
│   ├── agents/
│   │   ├── protocol-selector.ts       # Stage 1 conversation + tool definitions
│   │   └── scenario-generator.ts      # Stage 2 conversation + validation retry
│   ├── prompts/
│   │   ├── protocol-selector.ts       # System prompt for Stage 1
│   │   └── scenario-generator.ts      # System prompt for Stage 2
│   ├── validation/
│   │   └── validator.ts               # Schema validation + business rules
│   ├── export/
│   │   ├── realiti.ts                 # Unified → REALITi JSON
│   │   └── html.ts                    # Unified → HTML template fill
│   └── types/
│       └── schema.ts                  # TypeScript types for unified schema
├── templates/
│   └── scenario.html                  # HTML template (created from scenario-hypoglycemia-mobile.html)
├── protocol_docs/                     # 68 protocol .md files (existing)
├── output/                            # Generated scenarios
├── package.json
├── tsconfig.json
├── paramedic-scenario-architecture.md
├── scenario-builder-briefing.md
└── realiti_scenario.schema.json
```

## Technology

| Component | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Future desktop app path (Electron/Tauri) |
| Runtime | Node.js | — |
| AI SDK | `@anthropic-ai/sdk` (direct, manual tool loop) | Full control over conversation management |
| Prompt caching | Yes — `cache_control: { type: "ephemeral" }` on both stage system prompts | Large static prompts, significant cost savings |
| Protocol index | Auto-generated at startup from YAML frontmatter | No maintenance, can't drift from protocol files |
| HTML generation | Template-based (no AI) | Deterministic, fast, free |
| Invocation | Interactive CLI with real-time progress | — |

## CLI Experience

```
$ npx ts-node src/index.ts

╭──────────────────────────────────────╮
│  Paramedic Scenario Generator        │
╰──────────────────────────────────────╯

Describe your scenario:
> 55yo diabetic male found unresponsive by wife, insulin pen nearby, BGL 28

Loading protocol index... 68 protocols found

─── Stage 1: Protocol Selection ───
  Reading: medical-hypoglycemia
  Reading: medical-altered-mental-status
  Cross-ref: medical-seizures
  Selected 3 protocols:
    • medical-hypoglycemia — patient has BGL 28, diabetic history
    • medical-altered-mental-status — patient found unresponsive
    • medical-seizures — cross-ref, risk of hypoglycemic seizure

─── Stage 2: Scenario Generation ───
  Generating scenario...
  Validating...
  ⚠ WARNING: Phase "initial" HR 112 with ecgRhythm "Sinus Rhythm" — consider "Sinus Tachycardia"
  ✓ Valid (1 warning, 0 errors)

─── Export ───
  ✓ output/hypo-001/unified.json
  ✓ output/hypo-001/realiti.json
  ✓ output/hypo-001/scenario.html

Done! Generated "Diabetic Found Unresponsive — Hypoglycemic Emergency"
```

## Key Constraints

- Protocol frontmatter must have `slug`, `section`, and `description` fields
- ECG rhythm codes must come from the 42-entry table in the architecture doc
- Custom measure labels are unit strings (e.g., "mg/dL"), not measurement names
- REALITi export excludes branch phases (`isDefault: false`)
- HTML export includes all phases with branching visualization
- No labs or media fields in unified schema; REALITi export injects empty arrays
- Unified JSON is always saved even if validation fails after retries
