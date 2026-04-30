# Scenario Builder — Implementation Briefing for Claude Code

This document captures decisions, context, and constraints from the design conversation that aren't fully expressed in `paramedic-scenario-architecture.md`. Read this first, then the architecture doc, then start building.

---

## Project Owner Context

Raff is a paramedic instructor at MATC teaching psychomotor/lab components across two cohorts. He also runs an EMS narrative website. This scenario builder is for his paramedic education program — it needs to produce scenarios that work both as interactive teaching tools (HTML) and as importable files for the REALITi patient monitor simulator he uses in lab.

---

## Execution Context

This is not yet decided. Raff will determine whether this runs as a CLI tool, a Node project on his Linode server, a Claude Code skill, or something else. Build the core logic (schema validation, export functions, agentic generation) as modular, framework-agnostic code that can be wired into any execution context. Don't assume a web server, don't assume a specific runtime. Keep it portable.

---

## Critical Design Decisions (Already Made)

### 1. Two outputs, one source of truth
The agentic loop produces a **unified JSON** (the superset schema). Two separate export functions project from it:
- **REALITi export** → stripped-down JSON matching REALITi's schema exactly
- **HTML export** → self-contained interactive HTML scenario document

The unified JSON is NEVER pasted into REALITi. Only the REALITi export output touches their platform. These are two separate files generated from one source. Do not try to make one JSON serve both purposes directly.

### 2. No labs
Labs are deliberately excluded from the unified schema. Prehospital EMS scenarios don't involve lab panels. The REALITi export must still include `"labs": []` to satisfy their schema, but the unified schema has no lab fields anywhere. Do not add lab support "for completeness."

### 3. No media
Same decision as labs. No media fields in the unified schema. REALITi export includes `"media": []` to satisfy their schema. The HTML player does not have media placeholder slots.

### 4. Custom measure labels are UNIT STRINGS
REALITi's `custMeasureLabel1`, `custMeasureLabel2`, `custMeasureLabel3` fields contain the **unit of measurement**, not the name of the measurement. For example:
- Glucose: `custMeasure1: 28`, `custMeasureLabel1: "mg/dL"` — NOT `"Glucose"`
- Lactate: `custMeasure2: 4.2`, `custMeasureLabel2: "mmol/L"` — NOT `"Lactate"`

This matches REALITi's own examples and is how their monitor displays the values.

### 5. The 42-entry ECG table is authoritative
The architecture doc contains a 42-entry ECG rhythm → waveform code table. This is the complete, correct list that Raff compiled from REALITi's actual reference. The original implementation doc he uploaded only had 23 entries — that list is incomplete. Always use the 42-entry table from the architecture doc as the single source of truth for valid rhythm codes.

### 6. Conditional branching is supported
Phases support conditional transitions via the `transitions` array and `isDefault` flag. The REALITi export flattens to the default path only (REALITi has no branching concept). The HTML player should render both the default path and branch paths, showing "what if" scenarios when students take wrong actions or fail to act in time.

### 7. Guided tab navigation via action IDs
Every `expectedActions` item has a unique `id` field. Each transition has a `triggerActionIds` array referencing those IDs. The HTML player tracks which action checkboxes are checked: if the trigger actions for a branch aren't completed, the branch tab gets a visual hint (glow/pulse). Once completed, the hint moves to the next default phase tab. This creates an interactive "choose your own adventure" feel where the student sees consequences of their decisions in real time.

### 8. REALITi import is manual paste (for now)
Raff currently pastes JSON into REALITi's web interface manually. Selenium automation is a future consideration but not part of the initial build. The export function just needs to produce valid JSON — no API integration needed.

---

## Files to Reference

| File | Purpose |
|---|---|
| `paramedic-scenario-architecture.md` | Full architecture doc — schema, mapping table, validation rules, agentic loop design, example scenario |
| `scenario-hypoglycemia-mobile.html` | Visual design target for the HTML template engine — mobile-first, card-based layout with guided tab navigation |
| `medical-hypoglycemia.md` | Example protocol file — this is the format all protocol files follow. The agent loads these during generation. |
| `realiti_scenario_schema.json` | REALITi's own JSON schema — validate the REALITi export output against this |
| `REALITi_Scenario_Automation_Implementation.md` | Original REALITi implementation reference — useful background but the architecture doc supersedes it for all design decisions |

---

## Protocol File Format

Protocol files are markdown with YAML frontmatter. The agent reads these during scenario generation to ensure clinical accuracy. Here's the structure (using `medical-hypoglycemia.md` as the reference):

```yaml
---
protocol: Hypoglycemia
slug: medical-hypoglycemia
section: Medical
description: Use for any patient with blood glucose less than 60 mg/dL...
---
```

Followed by structured markdown sections:
- **Patient Care Goals** — what the protocol aims to achieve
- **Patient Presentation** — inclusion/exclusion criteria
- **Patient Management** — assessment, treatment, interventions, disposition
- **Patient Safety Considerations** — warnings, drug interactions, age-specific guidance
- **Notes/Educational Pearls** — formulas, key considerations, assessment findings
- **Key Documentation Elements** — what to document
- **Performance Measures** — measurable quality indicators

Cross-references to other protocols use the format: `> See: protocol-slug`

The agent uses a `protocol-index.md` file to match scenario descriptions to relevant protocol slugs, then loads the full protocol files for matched slugs. The index needs to be built with slug, section, and keyword columns.

---

## REALITi-Specific Rules the Export Function Must Enforce

These are hard constraints that the export function must apply, not just the validator:

1. **`patientWeight`** must be in `00.0` format (exactly one decimal, e.g., `80.0`)
2. **`patientSex`**: `"male"` → `1`, `"female"` → `2`
3. **`patientPhotoId`**: `min(ceil(age * 1.2), 100)`
4. **`patientAdmitted`**: default `1`
5. **`patientAgeCategory`**: derived from age (0 = adult)
6. **`scenarioType`**: always `"Vital Signs"`
7. **`scenarioVersion`**: always `2`
8. **`type`** on every event: always `"ScenarioEvent"`
9. **Cardiac arrest rule**: if `ecgWaveform` is 18 (VFib) or 3 (Asystole), OR if `hr=0 AND bpSys=0 AND bpDia=0`, force `spo2: 0` and `spo2Visible: false`
10. **`defibShock`**: auto-set to `true` for shockable rhythms (waveform codes 18, 12)
11. **`defibDisarm`**: auto-set to `true` for non-shockable rhythms
12. **Branch phases excluded**: only phases with `isDefault: true` become `scenarioEvents`
13. **Empty arrays required**: `labs: []`, `media: []`, and on each event: `relatedMedia: []`, `relatedLabs: []`, `relatedSounds: []`
14. **`ecgWaveform`** must be looked up from `ecgRhythm` using the 42-entry code table if not explicitly provided

---

## Shared-Code Rhythm Disambiguation

Multiple clinically distinct rhythms share the same REALITi waveform code. The export function doesn't need to handle this (it just passes the code through), but the **generation agent** must set appropriate vital signs to disambiguate. Key examples:

- **Code 9** covers Normal Sinus, Sinus Brady, Sinus Tachy, PEA, Pacemaker, Pacemaker Failure to Capture
  - Sinus Brady: HR < 60
  - Sinus Tachy: HR > 100
  - PEA: HR > 0 but bpSys = 0, bpDia = 0
- **Code 3** covers Asystole and Sinus Arrest — distinguish in `clinicalPresentation`
- **Code 12** covers Monomorphic VT, Polymorphic VT, and Torsades — Torsades should have Long QT context
- **Code 91** covers Idioventricular (HR 20-40) and Accelerated Idioventricular (HR 40-100)

The system prompt for the generation agent must include these disambiguation rules.

---

## What to Build (Suggested Order)

1. **Unified JSON Schema file** (`unified-scenario.schema.json`) — extract from the architecture doc's schema section into a standalone, validatable JSON Schema Draft 7 file
2. **REALITi export function** — takes unified JSON, outputs REALITi-compatible JSON. Validate output against `realiti_scenario_schema.json`
3. **Unified schema validator** — validates a unified JSON against the schema + the business rules listed above
4. **Example output pair** — run the hypoglycemia example from the architecture doc through the export function, produce the REALITi JSON, confirm it validates
5. **HTML template engine** — takes unified JSON, outputs self-contained interactive HTML
6. **System prompt** — the prompt that drives the agentic generation loop, including all constraint tables
7. **Protocol index** — `protocol-index.md` with slug/keyword mappings (Raff will need to populate this with his full protocol set, but build the structure and a few example entries)
8. **Agentic loop orchestration** — the actual generation pipeline that ties it all together

---

## Questions Claude Code Should Ask Raff Before Starting

- What language/runtime? (TypeScript/Node, Python, or no preference)
- Where will protocol files live on disk?
- Is there a preferred test framework?
- Should the HTML template use any CSS framework or be fully custom?
- How should the agentic loop be invoked — CLI command, API call, or something else?
