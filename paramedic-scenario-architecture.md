# Paramedic Scenario Generation System — Architecture & Schema Design

## Problem Statement

Build an AI-powered agentic system that:
1. Takes a natural language scenario description as input
2. Reads relevant EMS protocols (structured like Claude skills)
3. Generates a **unified scenario JSON** that captures the full clinical picture
4. Exports two renderable outputs from that single source of truth:
   - **REALITi-compatible JSON** (monitor simulator — vitals, ECG, labs, events)
   - **Interactive HTML scenario document** (full clinical picture — AVPU, scene description, expected actions, debriefing)

---

## Core Insight: One Schema, Two Projections

REALITi's schema is focused exclusively on **what shows up on a patient monitor**: vital signs, ECG rhythms, and event transitions. It has no concept of scene setup, patient presentation details (skin signs, AVPU, lung sounds, etc.), expected provider actions with rationale, or debriefing/teaching points.

Rather than maintaining two separate schemas, the right move is a **superset schema** where REALITi's data lives as a nested object. The agentic loop generates the full superset, and export functions project out whichever format is needed.

```
┌─────────────────────────────────────────────┐
│           Unified Scenario JSON             │
│                                             │
│  ┌──────────────┐  ┌────────────────────┐   │
│  │  REALITi      │  │  Extended Clinical │   │
│  │  Monitor Data │  │  Context           │   │
│  │              │  │                    │   │
│  │  • vitals    │  │  • scene setup     │   │
│  │  • ECG codes │  │  • AVPU/GCS        │   │
│  │  • events    │  │  • physical exam   │   │
│  │  • checklist │  │  • expected actions │   │
│  │              │  │  • branching logic  │   │
│  │              │  │  • teaching points │   │
│  │              │  │  • disposition      │   │
│  └──────────────┘  └────────────────────┘   │
│                                             │
│  Export: REALITi JSON    Export: HTML Player │
└─────────────────────────────────────────────┘
```

---

## Unified Scenario Schema (v1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Paramedic Training Scenario",
  "type": "object",
  "required": ["meta", "patient", "scene", "phases", "assessment", "debriefing"],
  "properties": {

    "meta": {
      "type": "object",
      "required": ["id", "name", "difficulty", "protocols", "totalTimeSeconds"],
      "properties": {
        "id": { "type": "string", "description": "Unique scenario identifier" },
        "name": { "type": "string" },
        "version": { "type": "number", "default": 1 },
        "difficulty": { "type": "string", "enum": ["beginner", "intermediate", "advanced"] },
        "category": { "type": "string", "description": "e.g., Medical, Trauma, Cardiac, Pediatric" },
        "protocols": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Protocol slugs used, e.g., ['medical-hypoglycemia', 'medical-altered-mental-status']"
        },
        "totalTimeSeconds": { "type": "number", "description": "Expected scenario duration" },
        "createdAt": { "type": "string", "format": "date-time" },
        "tags": { "type": "array", "items": { "type": "string" } }
      }
    },

    "patient": {
      "type": "object",
      "required": ["name", "age", "sex", "weight", "height", "chiefComplaint", "history"],
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" },
        "ageUnit": { "type": "string", "default": "years" },
        "sex": { "type": "string", "enum": ["male", "female"] },
        "weight": { "type": "number", "description": "kg" },
        "height": { "type": "number", "description": "cm" },
        "chiefComplaint": { "type": "string" },
        "history": {
          "type": "object",
          "properties": {
            "hpi": { "type": "string", "description": "History of present illness narrative" },
            "pastMedical": { "type": "array", "items": { "type": "string" } },
            "medications": { "type": "array", "items": { "type": "string" } },
            "allergies": { "type": "array", "items": { "type": "string" } },
            "lastOralIntake": { "type": "string" },
            "events": { "type": "string", "description": "Events leading up to EMS arrival" }
          }
        }
      }
    },

    "scene": {
      "type": "object",
      "properties": {
        "location": { "type": "string", "description": "e.g., 'Single-story residential home, kitchen'" },
        "time": { "type": "string", "description": "e.g., '0800, Tuesday morning'" },
        "safety": { "type": "string", "description": "Scene safety considerations" },
        "bystanders": { "type": "string", "description": "Who is present and what they report" },
        "visualCues": {
          "type": "array",
          "items": { "type": "string" },
          "description": "What providers see on arrival, e.g., 'Insulin pen on counter', 'Patient diaphoretic on floor'"
        }
      }
    },

    "phases": {
      "type": "array",
      "description": "Sequence of clinical phases. Each phase has a clinical context AND monitor state. Phases can branch conditionally based on student actions.",
      "items": {
        "type": "object",
        "required": ["id", "name", "description", "clinicalPresentation", "monitorState"],
        "properties": {
          "id": { "type": "string", "description": "Unique phase identifier for branching references, e.g., 'initial', 'post-dextrose', 'seizure'" },
          "name": { "type": "string", "description": "e.g., 'Initial Contact', 'Post-Dextrose', 'Deterioration'" },
          "description": { "type": "string", "description": "What is happening clinically in this phase" },
          "triggerCondition": {
            "type": "string",
            "description": "What causes transition to this phase, e.g., 'On arrival', 'After IV dextrose administered', '5 minutes without treatment'"
          },
          "isDefault": {
            "type": "boolean",
            "default": true,
            "description": "If true, this phase is on the default (expected) path. If false, it's a branching consequence phase."
          },
          "transitions": {
            "type": "array",
            "description": "Conditional transitions from this phase. Evaluated in order — first match wins. If no match, falls through to next default phase.",
            "items": {
              "type": "object",
              "required": ["targetPhaseId", "condition"],
              "properties": {
                "targetPhaseId": { "type": "string", "description": "id of the phase to transition to" },
                "condition": { "type": "string", "description": "Human-readable condition, e.g., 'Dextrose not administered within 5 minutes'" },
                "conditionType": {
                  "type": "string",
                  "enum": ["action_not_taken", "action_taken", "time_elapsed", "vital_threshold"],
                  "description": "Machine-parseable condition category for future automation"
                },
                "timeoutSeconds": {
                  "type": "number",
                  "description": "For time-based conditions: seconds after phase start before this transition fires"
                },
                "triggerActionIds": {
                  "type": "array",
                  "items": { "type": "string" },
                  "description": "References to expectedActions[].id values in this phase. For 'action_not_taken': if these actions are NOT checked, this transition activates (tab hint points to branch). For 'action_taken': if these actions ARE checked, this transition activates."
                }
              }
            }
          },

          "clinicalPresentation": {
            "type": "object",
            "description": "What providers observe — NOT on the monitor",
            "properties": {
              "avpu": { "type": "string", "enum": ["Alert", "Verbal", "Pain", "Unresponsive"] },
              "gcs": {
                "type": "object",
                "properties": {
                  "eye": { "type": "number", "minimum": 1, "maximum": 4 },
                  "verbal": { "type": "number", "minimum": 1, "maximum": 5 },
                  "motor": { "type": "number", "minimum": 1, "maximum": 6 }
                }
              },
              "airway": { "type": "string", "description": "e.g., 'Patent, no obstruction', 'Snoring respirations'" },
              "breathing": { "type": "string", "description": "e.g., 'Adequate rate and depth, clear bilateral lung sounds'" },
              "circulation": { "type": "string", "description": "e.g., 'Radial pulses present, skin cool and diaphoretic'" },
              "skin": {
                "type": "object",
                "properties": {
                  "color": { "type": "string" },
                  "temperature": { "type": "string" },
                  "moisture": { "type": "string" }
                }
              },
              "pupils": { "type": "string", "description": "e.g., 'PERRL 4mm', 'Dilated and sluggish'" },
              "motorFunction": { "type": "string", "description": "e.g., 'Moving all extremities', 'Left-sided weakness'" },
              "otherFindings": {
                "type": "array",
                "items": { "type": "string" },
                "description": "e.g., 'Medic-alert bracelet for diabetes', 'Tongue bite noted'"
              },
              "patientSpeech": {
                "type": "string",
                "description": "What patient says if conscious, e.g., 'Confused, slurred speech, unable to state name'"
              }
            }
          },

          "monitorState": {
            "type": "object",
            "description": "Values that appear on the REALITi monitor during this phase",
            "properties": {
              "ecgRhythm": { "type": "string", "description": "Human-readable rhythm name" },
              "ecgWaveform": { "type": "number", "description": "REALITi ECG code (see mapping table)" },
              "hr": { "type": "number" },
              "bpSys": { "type": "number" },
              "bpDia": { "type": "number" },
              "respRate": { "type": "number" },
              "spo2": { "type": "number" },
              "etco2": { "type": "number" },
              "temp": { "type": "number" },
              "obstruction": { "type": "number", "minimum": 0, "maximum": 100 },
              "glucose": { "type": "number", "description": "Blood glucose mg/dL — maps to custMeasure1 in REALITi" },
              "customMeasures": {
                "type": "array",
                "maxItems": 3,
                "items": {
                  "type": "object",
                  "properties": {
                    "label": { "type": "string" },
                    "value": { "type": "number" }
                  }
                }
              },
              "trendTimeSeconds": { "type": "number", "description": "How long the transition to this state takes" },
              "visibility": {
                "type": "object",
                "description": "Which monitor readings are visible (simulates attaching/detaching sensors)",
                "properties": {
                  "spo2Visible": { "type": "boolean", "default": true },
                  "spo2Attached": { "type": "boolean", "default": true },
                  "rrVisible": { "type": "boolean", "default": true },
                  "etco2Visible": { "type": "boolean", "default": false },
                  "cvpVisible": { "type": "boolean", "default": false }
                }
              }
            }
          },

          "expectedActions": {
            "type": "array",
            "description": "What a competent provider should do during this phase",
            "items": {
              "type": "object",
              "required": ["id", "action", "priority"],
              "properties": {
                "id": { "type": "string", "description": "Unique action identifier within this phase, referenced by transitions[].triggerActionIds" },
                "action": { "type": "string", "description": "e.g., 'Check blood glucose'" },
                "priority": { "type": "string", "enum": ["critical", "important", "supplemental"] },
                "rationale": { "type": "string", "description": "Why this action matters" },
                "protocolReference": { "type": "string", "description": "Protocol slug + section" }
              }
            }
          }
        }
      }
    },

    "assessment": {
      "type": "object",
      "description": "Checklist items for evaluating student performance",
      "properties": {
        "criticalActions": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Must-do actions — failure = scenario failure"
        },
        "expectedActions": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Should-do actions"
        },
        "bonusActions": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Above-and-beyond actions showing mastery"
        }
      }
    },

    "debriefing": {
      "type": "object",
      "properties": {
        "learningObjectives": {
          "type": "array",
          "items": { "type": "string" }
        },
        "discussionQuestions": {
          "type": "array",
          "items": { "type": "string" }
        },
        "commonPitfalls": {
          "type": "array",
          "items": { "type": "string" }
        },
        "keyTakeaways": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },

    "realiti": {
      "type": "object",
      "description": "REALITi-specific overrides and metadata. The export function uses phases[].monitorState as the primary source and merges these overrides.",
      "properties": {
        "scenarioMonitorType": { "type": "number", "default": 20 },
        "scenarioDefaultEnergy": { "type": "number", "default": 200 },
        "scenarioDefaultPacerThreshold": { "type": "number", "default": 55 }
      }
    }
  }
}
```

---

## Schema Design Decisions — Rationale

### 1. Phases instead of Events
REALITi calls them "scenarioEvents" — they're really phase transitions. I've renamed to `phases` in the unified schema because each phase carries **both** monitor state and clinical presentation. The REALITi export maps each phase to a `ScenarioEvent`.

### 2. `monitorState` is the REALITi projection surface
Every field inside `phases[].monitorState` maps directly to REALITi's `scenarioEvents[].parameters`. The export function does the translation (e.g., `glucose` → `custMeasure1` + `custMeasureLabel1: "mg/dL"`).

### 3. `clinicalPresentation` is the HTML projection surface
AVPU, skin signs, pupil response, patient speech — none of this exists in REALITi. The HTML scenario player uses this to build the interactive clinical picture that students work through.

### 4. `expectedActions` per phase, not global
Actions are phase-specific because what you should do changes as the scenario evolves. The global `assessment` section aggregates critical/expected/bonus for overall grading.

### 5. Glucose as a first-class field
Hypoglycemia is so common in EMS scenarios that glucose gets its own field in `monitorState` rather than being buried in `customMeasures`. The export function maps it to `custMeasure1`.

### 6. Human-readable `ecgRhythm` + numeric `ecgWaveform`
The agent writes `"ecgRhythm": "Sinus Rhythm"` for readability. The export function validates against the ECG code table and populates `ecgWaveform: 9`. If the agent also provides the code, it's used directly.

### 7. Conditional branching via `transitions`
Each phase can define transition rules that point to other phases by `id`. This supports scenarios where student inaction or wrong actions lead to deterioration (e.g., "if dextrose not given within 5 minutes → patient seizes"). The `isDefault` flag marks the expected/happy path, while branch phases have `isDefault: false`. The REALITi export flattens the default path into a linear event sequence (REALITi doesn't support branching), while the HTML player can render the full decision tree.

### 8. No labs, no media
Labs and media are omitted from the unified schema. Prehospital scenarios don't typically involve lab panels, and the HTML player doesn't need image placeholders. REALITi's `labs` and `media` arrays are exported as empty `[]` to satisfy its schema requirements.

### 9. Guided tab navigation via `triggerActionIds`
Each transition can reference specific `expectedActions[].id` values via `triggerActionIds`. The HTML player uses this to show visual hints on the phase tabs: if the referenced actions haven't been checked off, the branch phase tab glows/pulses to indicate "this is where you're headed." Once the trigger actions are completed, the hint shifts to the next default phase tab instead. This creates an interactive cause-and-effect flow — the student (or the instructor narrating) sees in real time that failing to give dextrose leads to the seizure branch. Every `expectedActions` item has a unique `id` field specifically to support this linkage.

---

## Agentic Loop Architecture

```
┌──────────────────────────────────────────────────────┐
│                   USER INPUT                          │
│  "55 year old diabetic male, found unresponsive       │
│   by wife, insulin pen nearby, BGL 28"                │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              STEP 1: PROTOCOL SELECTION               │
│                                                       │
│  Agent reads protocol-index.md                        │
│  Matches keywords/context to protocol slugs:          │
│    → medical-hypoglycemia                             │
│    → medical-altered-mental-status                    │
│  Loads full protocol markdown for each                │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              STEP 2: SCENARIO GENERATION              │
│                                                       │
│  Agent has in context:                                │
│    • User's scenario description                      │
│    • Full protocol text for matched protocols          │
│    • Unified scenario schema (as reference)            │
│    • ECG rhythm code table                            │
│    • Airway obstruction mapping                       │
│                                                       │
│  Agent generates complete unified JSON                │
│  This is a SINGLE large structured output call        │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              STEP 3: VALIDATION                       │
│                                                       │
│  Validate against unified schema                      │
│  Check REALITi-specific rules:                        │
│    • patientWeight has one decimal                     │
│    • patientPhotoId = min(CEIL(age * 1.2), 100)       │
│    • Cardiac arrest → spo2=0, spo2Visible=false       │
│    • ECG codes match rhythm names                     │
│                                                       │
│  If validation fails → loop back to Step 2 with       │
│  error context (this is the "agentic" part)           │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              STEP 4: EXPORT                           │
│                                                       │
│  From the single validated unified JSON:              │
│                                                       │
│  ┌─────────────────┐    ┌──────────────────────┐     │
│  │ REALITi Export   │    │ HTML Scenario Export  │     │
│  │                 │    │                      │     │
│  │ Maps phases to  │    │ Builds interactive   │     │
│  │ scenarioEvents  │    │ tabbed HTML doc with │     │
│  │ Maps glucose to │    │ all clinical context │     │
│  │ custMeasure1    │    │ phase progression    │     │
│  │ Computes        │    │ expected actions     │     │
│  │ patientPhotoId  │    │ debriefing           │     │
│  │ Strips clinical │    │                      │     │
│  │ presentation    │    │                      │     │
│  └─────────────────┘    └──────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## REALITi Export Function — Mapping Logic

The export function transforms unified JSON → REALITi JSON:

| Unified Schema | REALITi Schema | Notes |
|---|---|---|
| `meta.id` | `scenarioId` | Direct |
| `meta.name` | `scenarioName` | Direct |
| `meta.totalTimeSeconds` | `scenarioTime` | Direct |
| (constant) | `scenarioType` | Always `"Vital Signs"` |
| (constant) | `scenarioVersion` | Always `2` |
| (constant) | `isDemo` | Always `false` |
| (constant) | `isALSILegacy` | Always `false` |
| `realiti.scenarioMonitorType` | `scenarioMonitorType` | Default `20` |
| `realiti.scenarioDefaultEnergy` | `scenarioDefaultEnergy` | Default `200` |
| `realiti.scenarioDefaultPacerThreshold` | `scenarioDefaultPacerThreshold` | Default `55` |
| `patient.name` | `patientInformation.patientName` | Direct |
| `patient.sex` | `patientInformation.patientSex` | `"male"` → `1`, `"female"` → `2` |
| `patient.weight` | `patientInformation.patientWeight` | Force `00.0` format: `80` → `80.0` |
| `patient.height` | `patientInformation.patientHeight` | Direct (cm) |
| `patient.age` | `patientInformation.patientAge` | Direct |
| `patient.ageUnit` | `patientInformation.patientAgeUnit` | Default `"years"` |
| (derived) | `patientInformation.patientAgeCategory` | Computed from age (0 = adult) |
| (derived) | `patientInformation.patientPhotoId` | `min(ceil(age * 1.2), 100)` |
| (constant) | `patientInformation.patientAdmitted` | Default `1` |
| `patient.chiefComplaint` | `patientInformation.patientCondition` | Direct |
| `patient.history.hpi` | `scenarioStory.history` | Compose narrative |
| `debriefing.learningObjectives` | `scenarioStory.discussion` | Join as prose |
| Phase progression description | `scenarioStory.course` | Summarize default-path phase transitions |
| `phases[]` (default path only) | `scenarioEvents[]` | One event per default phase. Branch phases excluded. |
| `phases[].name` | `scenarioEvents[].name` | Direct |
| `phases[].description` | `scenarioEvents[].description` | Direct |
| `phases[].monitorState.*` | `scenarioEvents[].parameters.*` | Core vital field names match directly |
| `phases[].monitorState.glucose` | `parameters.custMeasure1` + `custMeasureLabel1: "mg/dL"` | Custom channel — label is the unit string |
| `phases[].monitorState.ecgWaveform` | `parameters.ecgWaveform` | Direct or lookup from `ecgRhythm` |
| `phases[].monitorState.trendTimeSeconds` | `scenarioEvents[].trendTime` | Direct. Use `jumpTime: 0` unless abrupt change needed. |
| (derived) | `scenarioEvents[].defibShock` | `true` if rhythm is VFib (18) or VTach (12) |
| (derived) | `scenarioEvents[].defibDisarm` | `true` if rhythm is non-shockable (Asystole, PEA, etc.) |
| (constant) | `scenarioEvents[].type` | Always `"ScenarioEvent"` |
| (constant) | `scenarioEvents[].monitorType` | Default `0` (inherit from scenario) |
| (constant) | `scenarioEvents[].relatedMedia` | Always `[]` |
| (constant) | `scenarioEvents[].relatedLabs` | Always `[]` |
| (constant) | `scenarioEvents[].relatedSounds` | Always `[]` |
| `assessment.criticalActions` + `assessment.expectedActions` | `checklist[]` | Each becomes `{ title, type: "Check", value: 0, icon: 1 }` |
| `assessment.criticalActions` + `assessment.expectedActions` | `scenarioEvents[].relatedChecklist` | Link checklist items to relevant events |
| (none) | `labs[]` | Always exported as `[]` |
| (none) | `media[]` | Always exported as `[]` |

---

## HTML Scenario Player — What It Renders

The HTML export creates a self-contained interactive document from the same unified JSON. It includes everything REALITi doesn't cover:

### Layout Concept

```
┌─────────────────────────────────────────────────┐
│  SCENARIO: Hypoglycemic Emergency               │
│  Difficulty: Intermediate  │  Protocols: 2      │
├────────┬────────┬──────────┬───────────┬────────┤
│ Scene  │Phase 1 │ Phase 2  │ Phase 3   │Debrief │
├────────┴────────┴──────────┴───────────┴────────┤
│                                                  │
│  SCENE SETUP                                     │
│  Location: Single-story home, kitchen            │
│  Time: 0800 Tuesday                              │
│  Bystanders: Wife called 911, reports husband... │
│  Visual Cues:                                    │
│    • Patient supine on kitchen floor             │
│    • Insulin pen on counter                      │
│    • Diaphoretic, pale                           │
│                                                  │
│  PATIENT INFO (expandable SAMPLE card)           │
│  S: Wife reports he didn't eat breakfast...      │
│  A: NKDA                                         │
│  M: Insulin glargine, metformin                  │
│  P: Type 2 DM, HTN                              │
│  L: Dinner last night ~7pm                       │
│  E: Found on floor, wife heard thud              │
│                                                  │
├──────────────────────────────────────────────────┤
│  PHASE: Initial Contact                          │
│                                                  │
│  Clinical Presentation          Monitor Display  │
│  ┌────────────────────┐   ┌──────────────────┐   │
│  │ AVPU: Pain         │   │ HR: 112          │   │
│  │ GCS: E2 V2 M4 = 8 │   │ BP: 148/92       │   │
│  │ Airway: Patent     │   │ RR: 22           │   │
│  │ Skin: Cool, pale,  │   │ SpO2: 97%        │   │
│  │   diaphoretic      │   │ Glucose: 28      │   │
│  │ Pupils: PERRL 4mm  │   │ ECG: Sinus Tach  │   │
│  └────────────────────┘   └──────────────────┘   │
│                                                  │
│  EXPECTED ACTIONS                                │
│  ☐ [CRITICAL] Check blood glucose               │
│  ☐ [CRITICAL] Establish IV access               │
│  ☐ [IMPORTANT] Administer D10 250mL IV          │
│  ☐ [IMPORTANT] Assess for insulin pump           │
│                                                  │
│  ► Click to reveal rationale for each action     │
└──────────────────────────────────────────────────┘
```

### HTML Features
- **Tabbed phase navigation** — click through scenario progression
- **Expandable rationale** — click to reveal why each action matters
- **SAMPLE history card** — collapsible patient history
- **Side-by-side clinical + monitor** — shows what you see vs. what the monitor shows
- **Checklist mode** — toggle to use as live grading sheet
- **Debriefing tab** — learning objectives, discussion questions, common pitfalls
- **Print-friendly** — CSS print styles for paper handout use
- **Self-contained** — single HTML file, no external dependencies

---

## Protocol Skill Structure

Protocols are stored as markdown files (you already have this pattern). The agent needs:

### protocol-index.md
```markdown
# Protocol Index

| Slug | Section | Keywords |
|---|---|---|
| medical-hypoglycemia | Medical | glucose, sugar, diabetic, insulin, unresponsive, altered, D10, dextrose, glucagon |
| medical-altered-mental-status | Medical | altered, confused, unresponsive, GCS, unconscious |
| cv-stroke-tia | Cardiovascular | stroke, hemiparesis, facial droop, dysarthria, TPA |
| medical-seizures | Medical | seizure, convulsion, postictal, status epilepticus |
| cardiac-chest-pain | Cardiac | chest pain, STEMI, ACS, troponin, nitroglycerin |
| ...
```

The agent uses this index to decide which full protocol files to load into context before generating the scenario.

### Protocol File Convention
Each protocol file follows the pattern you already have in `medical-hypoglycemia.md`:
- YAML frontmatter with slug, section, description
- Structured sections: Patient Care Goals, Inclusion/Exclusion, Assessment, Treatment, Safety, Notes
- Cross-references via `> See: slug`

---

## ECG Rhythm Code Lookup Table

Authoritative reference for all valid REALITi rhythm codes. The agent MUST select from this list.

```json
{
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
  "Sinus Arrest": 3
}
```

### Shared-Code Rhythms — Agent Must Differentiate Via Vitals

Several clinically distinct rhythms share a REALITi waveform code. The agent must set appropriate HR, BP, and clinical context to distinguish them:

| Code | Rhythms Sharing This Code | How Agent Differentiates |
|---|---|---|
| 9 | Normal Sinus, Sinus Brady, Sinus Tachy, PEA, Pacemaker, Pacemaker Failure to Capture | HR value (brady <60, normal 60-100, tachy >100). PEA: hr >0 but bpSys=0/bpDia=0. Pacemaker: note in clinicalPresentation. |
| 3 | Asystole, Sinus Arrest | Asystole: sustained. Sinus Arrest: transient pause, described in clinicalPresentation. |
| 12 | Monomorphic VT, Polymorphic VT, Torsades | Differentiated in ecgRhythm label and clinicalPresentation. Torsades should have Long QT context. |
| 18 | Fine VFib, Coarse VFib | Differentiated in ecgRhythm label. Both are shockable. |
| 91 | Idioventricular, Accelerated Idioventricular | HR value (idioventricular 20-40, accelerated 40-100). |
| 4 | SVT, Atrial Tachycardia | Differentiated in ecgRhythm label and clinicalPresentation. |

---

## Airway Obstruction Scale

REALITi supports 0–100 integer obstruction values. The agent should use these clinical mappings:

| Condition | Obstruction |
|---|---|
| Normal airway | 0 |
| Mild asthma | 15 |
| Moderate asthma | 40 |
| Severe asthma | 70 |
| COPD exacerbation | 50 |
| Anaphylaxis | 60 |
| Foreign body airway | 80 |
| Tension pneumothorax | 100 |
| Complete obstruction | 100 |

The agent can interpolate between these values for clinical situations that fall between categories (e.g., moderate-to-severe asthma → 55).

---

## REALITi Vital Sign & Monitor Parameters

Complete reference of all parameters available inside `scenarioEvents[].parameters`. The agent should understand which of these it's populating and what the display toggles control.

### Core Vitals
| Parameter | Description |
|---|---|
| `hr` | Heart rate |
| `bpSys` | Systolic blood pressure |
| `bpDia` | Diastolic blood pressure |
| `respRate` | Respiratory rate |
| `spo2` | Oxygen saturation |
| `etco2` | End-tidal CO2 |
| `temp` | Temperature |

### Advanced Monitor
| Parameter | Description |
|---|---|
| `cvp` | Central venous pressure |
| `icp` | Intracranial pressure |
| `papSys` | Pulmonary artery pressure (systolic) |
| `papDia` | Pulmonary artery pressure (diastolic) |
| `papMean` | Pulmonary artery pressure (mean) |

### Airway/Respiratory
| Parameter | Description |
|---|---|
| `obstruction` | Airway obstruction 0–100 (see table above) |

### Monitor Display Toggles
| Parameter | Description |
|---|---|
| `spo2Visible` | Show/hide SpO2 on monitor |
| `rrVisible` | Show/hide respiratory rate on monitor |
| `ecgVisible` | Show/hide ECG tracing on monitor |
| `etco2Visible` | Show/hide EtCO2 on monitor |
| `cvpVisible` | Show/hide CVP on monitor |

### Device/Attachment Controls
| Parameter | Description |
|---|---|
| `spo2Attached` | Whether pulse ox probe is attached (false = no waveform) |

### Custom Monitor Channels
| Parameter | Description |
|---|---|
| `custMeasure1` / `custMeasureLabel1` | Custom value + label (e.g., Glucose) |
| `custMeasure2` / `custMeasureLabel2` | Custom value + label (e.g., Lactate) |
| `custMeasure3` / `custMeasureLabel3` | Custom value + label (e.g., Cardiac Output) |

### Event Timing Controls
| Parameter | Description |
|---|---|
| `trendTime` | Seconds to gradually transition vitals to new values (smooth ramp) |
| `jumpTime` | Seconds to instantly jump to new values (abrupt change) |

**Important:** `trendTime` and `jumpTime` serve different clinical purposes. Use `trendTime` for gradual deterioration or improvement (e.g., slowly dropping SpO2). Use `jumpTime` for sudden events (e.g., cardiac arrest, tension pneumothorax decompression).

### Defibrillation Controls
| Parameter | Description |
|---|---|
| `defibShock` | If true, this event responds to defibrillation (use for shockable rhythms like VFib/VTach) |
| `defibDisarm` | If true, defibrillation is disabled for this event (use for non-shockable rhythms) |

---

## REALITi Scenario Event Object — Full Template

Every event in the REALITi export must follow this structure:

```json
{
  "type": "ScenarioEvent",
  "name": "Event Name",
  "description": "Clinical description",
  "monitorType": 0,
  "trendTime": 10,
  "jumpTime": 0,
  "defibShock": false,
  "defibDisarm": false,
  "parameters": {},
  "relatedMedia": [],
  "relatedLabs": [],
  "relatedChecklist": [],
  "relatedSounds": []
}
```

The `monitorType` field can change the monitor display type mid-scenario (default: 0 inherits from `scenarioMonitorType`).

---

## Validation Rules (Applied in Step 3)

### Structural
- All required fields present per unified schema
- `phases` array has at least 1 phase

### Patient
- `weight` must be in `00.0` format (zero-padded, exactly one decimal — e.g., `80.0` not `80`)
- `sex` is "male" or "female" (exported as 1/2)
- Derived: `patientPhotoId = min(ceil(age * 1.2), 100)`
- Derived: `patientAgeCategory` — set based on age (0 = adult, used by REALITi for display)
- `patientAdmitted` defaults to `1`

### Monitor State
- `ecgWaveform` matches `ecgRhythm` if both provided
- If cardiac arrest rhythm (ecgWaveform 18 or 3, or hr=0 + bpSys=0 + bpDia=0) → enforce spo2=0, spo2Visible=false
- `obstruction` in range 0-100
- Vital sign ranges are physiologically plausible (warn, don't error)

### Branching
- All `transitions[].targetPhaseId` values reference a valid phase `id`
- No circular references (a phase cannot ultimately transition back to itself through a chain)
- At least one phase has no `triggerCondition` (i.e., it's the entry phase)
- The default path (phases with `isDefault: true`) forms a valid linear sequence

### Clinical
- AVPU consistent with GCS (e.g., if AVPU = "Unresponsive", GCS should be ≤ 6)
- Skin signs consistent with vitals (e.g., hypotension + tachycardia → skin should mention poor perfusion signs)

---

## Example: Hypoglycemia Scenario (Unified JSON)

```json
{
  "meta": {
    "id": "hypo-001",
    "name": "Diabetic Found Unresponsive — Hypoglycemic Emergency",
    "version": 1,
    "difficulty": "intermediate",
    "category": "Medical",
    "protocols": ["medical-hypoglycemia", "medical-altered-mental-status"],
    "totalTimeSeconds": 900,
    "tags": ["diabetes", "hypoglycemia", "altered mental status", "BLS-to-ALS"]
  },

  "patient": {
    "name": "Robert Chen",
    "age": 55,
    "ageUnit": "years",
    "sex": "male",
    "weight": 88.0,
    "height": 175,
    "chiefComplaint": "Unresponsive male",
    "history": {
      "hpi": "55-year-old male found unresponsive on kitchen floor by wife. She reports he skipped dinner last night and didn't eat breakfast. He took his usual insulin this morning. She heard a thud and found him on the floor approximately 10 minutes ago.",
      "pastMedical": ["Type 2 Diabetes Mellitus", "Hypertension", "Hyperlipidemia"],
      "medications": ["Insulin glargine 30 units daily", "Metformin 1000mg BID", "Lisinopril 20mg daily", "Atorvastatin 40mg daily"],
      "allergies": ["Sulfa — rash"],
      "lastOralIntake": "Dinner last evening, approximately 14 hours ago",
      "events": "Wife heard a thud from the kitchen. Found patient on floor, initially responsive but rapidly became unresponsive. Called 911 immediately."
    }
  },

  "scene": {
    "location": "Single-story residential home, kitchen",
    "time": "0815, Tuesday morning",
    "safety": "Scene is safe. No hazards identified.",
    "bystanders": "Wife present, anxious but cooperative. Reports patient is diabetic and takes insulin.",
    "visualCues": [
      "Patient supine on kitchen tile floor",
      "Insulin pen and glucose meter on kitchen counter",
      "Half-prepared breakfast on stove (not cooking)",
      "Patient is diaphoretic with pale skin",
      "Medic-alert bracelet visible on left wrist"
    ]
  },

  "phases": [
    {
      "id": "initial",
      "name": "Initial Contact",
      "description": "Patient found unresponsive on kitchen floor. Diaphoretic, tachycardic, hypertensive. Blood glucose critically low at 28 mg/dL.",
      "triggerCondition": "On EMS arrival",
      "isDefault": true,
      "transitions": [
        {
          "targetPhaseId": "seizure",
          "condition": "Dextrose not administered within 5 minutes of glucose check",
          "conditionType": "action_not_taken",
          "timeoutSeconds": 300,
          "triggerActionIds": ["establish-iv", "administer-d10"]
        }
      ],
      "clinicalPresentation": {
        "avpu": "Pain",
        "gcs": { "eye": 2, "verbal": 2, "motor": 4 },
        "airway": "Patent, no obstruction. No snoring or gurgling.",
        "breathing": "Respiratory rate elevated but adequate tidal volume. Lung sounds clear bilaterally.",
        "circulation": "Radial pulses present, rapid and weak. Skin cool, pale, and diaphoretic.",
        "skin": { "color": "Pale", "temperature": "Cool", "moisture": "Diaphoretic" },
        "pupils": "PERRL, 4mm bilaterally",
        "motorFunction": "Withdraws from pain in all extremities, no focal deficits noted",
        "otherFindings": [
          "Medic-alert bracelet: 'Type 2 Diabetes'",
          "No signs of trauma",
          "No tongue bite or incontinence"
        ],
        "patientSpeech": "Incomprehensible sounds only"
      },
      "monitorState": {
        "ecgRhythm": "Sinus Rhythm",
        "ecgWaveform": 9,
        "hr": 112,
        "bpSys": 148,
        "bpDia": 92,
        "respRate": 22,
        "spo2": 97,
        "etco2": 32,
        "temp": 36.4,
        "glucose": 28,
        "trendTimeSeconds": 0,
        "visibility": {
          "spo2Visible": true,
          "spo2Attached": true,
          "rrVisible": true,
          "etco2Visible": false,
          "cvpVisible": false
        }
      },
      "expectedActions": [
        {
          "id": "scene-safety",
          "action": "Assess scene safety and form general impression",
          "priority": "critical",
          "rationale": "Standard approach to every patient contact",
          "protocolReference": ""
        },
        {
          "id": "check-glucose",
          "action": "Check blood glucose level",
          "priority": "critical",
          "rationale": "Protocol requires glucose check for all patients with altered consciousness",
          "protocolReference": "medical-hypoglycemia > Assessment > Monitoring"
        },
        {
          "id": "assess-abc",
          "action": "Assess airway, breathing, circulation",
          "priority": "critical",
          "rationale": "XABC approach — identify life threats",
          "protocolReference": ""
        },
        {
          "id": "establish-iv",
          "action": "Establish IV access",
          "priority": "critical",
          "rationale": "Patient is unable to protect airway — IV dextrose is indicated over oral glucose",
          "protocolReference": "medical-hypoglycemia > Treatment 2b"
        },
        {
          "id": "administer-d10",
          "action": "Administer Dextrose 10% 250mL IV",
          "priority": "critical",
          "rationale": "BGL ≤60, patient unable to protect airway. D10 preferred per protocol safety considerations.",
          "protocolReference": "medical-hypoglycemia > Treatment 2b.i"
        },
        {
          "id": "assess-pump",
          "action": "Assess for insulin pump",
          "priority": "important",
          "rationale": "Protocol requires evaluation for automated insulin delivery device",
          "protocolReference": "medical-hypoglycemia > Assessment 2a"
        },
        {
          "id": "sample-history",
          "action": "Obtain SAMPLE history from wife",
          "priority": "important",
          "rationale": "Patient unable to provide history — wife is available and cooperative",
          "protocolReference": ""
        }
      ]
    },
    {
      "id": "post-dextrose",
      "name": "Post-Dextrose Administration",
      "description": "After IV dextrose administration, patient begins to improve. Mental status clearing, glucose rising. Vitals normalizing.",
      "triggerCondition": "After 250mL D10 administered IV (approximately 3-5 minutes)",
      "isDefault": true,
      "clinicalPresentation": {
        "avpu": "Verbal",
        "gcs": { "eye": 3, "verbal": 4, "motor": 5 },
        "airway": "Patent, patient beginning to vocalize",
        "breathing": "Rate normalizing, adequate depth. Clear lung sounds.",
        "circulation": "Radial pulses stronger. Skin still cool but less diaphoretic.",
        "skin": { "color": "Improving toward pink", "temperature": "Cool", "moisture": "Mildly diaphoretic" },
        "pupils": "PERRL, 4mm bilaterally",
        "motorFunction": "Moving all extremities purposefully, localizing",
        "otherFindings": [],
        "patientSpeech": "Confused but forming words. Asking 'what happened?'"
      },
      "monitorState": {
        "ecgRhythm": "Sinus Rhythm",
        "ecgWaveform": 9,
        "hr": 94,
        "bpSys": 132,
        "bpDia": 84,
        "respRate": 18,
        "spo2": 98,
        "etco2": 36,
        "temp": 36.4,
        "glucose": 68,
        "trendTimeSeconds": 120,
        "visibility": {
          "spo2Visible": true,
          "spo2Attached": true,
          "rrVisible": true,
          "etco2Visible": false,
          "cvpVisible": false
        }
      },
      "expectedActions": [
        {
          "id": "reassess-vitals",
          "action": "Reassess vital signs and mental status",
          "priority": "critical",
          "rationale": "Protocol requires reassessment after glucose/dextrose administration",
          "protocolReference": "medical-hypoglycemia > Treatment 3a"
        },
        {
          "id": "recheck-glucose",
          "action": "Recheck blood glucose",
          "priority": "critical",
          "rationale": "Previous hypoglycemia and mental status has not fully returned to normal",
          "protocolReference": "medical-hypoglycemia > Treatment 3b"
        },
        {
          "id": "continue-monitor",
          "action": "Continue monitoring, prepare for transport",
          "priority": "important",
          "rationale": "Patient improving but not yet at baseline. Ongoing assessment needed.",
          "protocolReference": ""
        }
      ]
    },
    {
      "id": "recovery",
      "name": "Recovery and Disposition",
      "description": "Patient returns to baseline mental status. Glucose above 80. Patient alert, oriented, and conversational.",
      "triggerCondition": "5-8 minutes after dextrose, glucose >80, mental status normalized",
      "isDefault": true,
      "clinicalPresentation": {
        "avpu": "Alert",
        "gcs": { "eye": 4, "verbal": 5, "motor": 6 },
        "airway": "Patent, self-maintained",
        "breathing": "Normal rate and depth. Clear bilaterally.",
        "circulation": "Strong radial pulses. Skin warm, dry, pink.",
        "skin": { "color": "Pink", "temperature": "Warm", "moisture": "Dry" },
        "pupils": "PERRL, 4mm bilaterally",
        "motorFunction": "Normal — moving all extremities, sitting up with assistance",
        "otherFindings": ["Patient recognizes wife, recalls taking insulin this morning but not eating"],
        "patientSpeech": "Alert and oriented x4, conversational, slightly embarrassed"
      },
      "monitorState": {
        "ecgRhythm": "Sinus Rhythm",
        "ecgWaveform": 9,
        "hr": 82,
        "bpSys": 126,
        "bpDia": 78,
        "respRate": 16,
        "spo2": 99,
        "etco2": 38,
        "temp": 36.6,
        "glucose": 94,
        "trendTimeSeconds": 180,
        "visibility": {
          "spo2Visible": true,
          "spo2Attached": true,
          "rrVisible": true,
          "etco2Visible": false,
          "cvpVisible": false
        }
      },
      "expectedActions": [
        {
          "id": "confirm-glucose-80",
          "action": "Recheck blood glucose — confirm >80 mg/dL",
          "priority": "critical",
          "rationale": "Must confirm euglycemia before considering refusal",
          "protocolReference": "medical-hypoglycemia > Disposition 4c.i"
        },
        {
          "id": "eval-safe-release",
          "action": "Evaluate disposition using safe-release criteria",
          "priority": "critical",
          "rationale": "All 8 criteria must be met for release without transport",
          "protocolReference": "medical-hypoglycemia > Disposition 4c"
        },
        {
          "id": "check-sulfonylureas",
          "action": "Confirm patient does not take sulfonylureas",
          "priority": "important",
          "rationale": "Sulfonylureas have long half-lives (12-60hrs) and patients are at risk for recurrent hypoglycemia",
          "protocolReference": "medical-hypoglycemia > Patient Safety 5"
        },
        {
          "id": "reliable-adult",
          "action": "Ensure reliable adult will stay with patient",
          "priority": "important",
          "rationale": "Required safe-release criterion — wife is present and willing",
          "protocolReference": "medical-hypoglycemia > Disposition 4c.vi"
        },
        {
          "id": "advise-carbs",
          "action": "Advise patient to eat a carbohydrate meal promptly",
          "priority": "important",
          "rationale": "Required criterion and prevents recurrence",
          "protocolReference": "medical-hypoglycemia > Disposition 4c.iv"
        }
      ]
    },
    {
      "id": "seizure",
      "name": "Hypoglycemic Seizure (Branch — Delayed Treatment)",
      "description": "Patient deteriorates into generalized tonic-clonic seizure due to prolonged severe hypoglycemia. This phase fires if dextrose is not administered in time.",
      "triggerCondition": "Branched from 'initial' — dextrose not administered within 5 minutes",
      "isDefault": false,
      "transitions": [
        {
          "targetPhaseId": "post-dextrose",
          "condition": "Dextrose administered after seizure controlled",
          "conditionType": "action_taken",
          "triggerActionIds": ["sz-iv-d10", "sz-glucagon"]
        }
      ],
      "clinicalPresentation": {
        "avpu": "Unresponsive",
        "gcs": { "eye": 1, "verbal": 1, "motor": 3 },
        "airway": "At risk — clenched jaw, excessive secretions. Position patient on side.",
        "breathing": "Irregular, apneic periods during tonic phase. Tachypneic during clonic phase.",
        "circulation": "Tachycardic, bounding pulses. Skin flushed and diaphoretic.",
        "skin": { "color": "Flushed/cyanotic perioral", "temperature": "Hot", "moisture": "Diaphoretic" },
        "pupils": "Fixed, dilated during active seizure",
        "motorFunction": "Generalized tonic-clonic activity, all extremities",
        "otherFindings": [
          "Tongue bite — blood at corner of mouth",
          "Urinary incontinence",
          "Duration: ongoing"
        ],
        "patientSpeech": "None — actively seizing"
      },
      "monitorState": {
        "ecgRhythm": "Sinus Rhythm",
        "ecgWaveform": 9,
        "hr": 138,
        "bpSys": 172,
        "bpDia": 104,
        "respRate": 8,
        "spo2": 88,
        "etco2": 22,
        "temp": 37.2,
        "glucose": 22,
        "trendTimeSeconds": 30,
        "visibility": {
          "spo2Visible": true,
          "spo2Attached": true,
          "rrVisible": true,
          "etco2Visible": false,
          "cvpVisible": false
        }
      },
      "expectedActions": [
        {
          "id": "sz-protect",
          "action": "Protect patient from injury — do not restrain, clear surroundings",
          "priority": "critical",
          "rationale": "Prevent secondary trauma during active seizure",
          "protocolReference": "medical-seizures"
        },
        {
          "id": "sz-position",
          "action": "Position on side, suction airway as needed",
          "priority": "critical",
          "rationale": "Maintain airway patency, prevent aspiration",
          "protocolReference": ""
        },
        {
          "id": "sz-iv-d10",
          "action": "Establish IV access and administer D10 immediately",
          "priority": "critical",
          "rationale": "Treat the underlying cause — seizure is secondary to hypoglycemia",
          "protocolReference": "medical-hypoglycemia > Treatment 2b.i"
        },
        {
          "id": "sz-glucagon",
          "action": "If IV not available, administer Glucagon 1mg IM",
          "priority": "critical",
          "rationale": "Alternative glucose replacement when IV access impossible during seizure",
          "protocolReference": "medical-hypoglycemia > Treatment 2b.ii"
        },
        {
          "id": "sz-must-transport",
          "action": "Note: Patient must be transported regardless of recovery — seizure occurred",
          "priority": "critical",
          "rationale": "Hypoglycemic patients who have seized must be transported regardless of response to therapy",
          "protocolReference": "medical-hypoglycemia > Disposition 4b"
        }
      ]
    }
  ],

  "assessment": {
    "criticalActions": [
      "Blood glucose checked",
      "IV access established",
      "Dextrose 10% administered IV (not oral glucose — patient unable to protect airway)",
      "Blood glucose rechecked after treatment",
      "Mental status reassessed after treatment",
      "Safe-release criteria evaluated if patient refuses transport"
    ],
    "expectedActions": [
      "SAMPLE history obtained from wife",
      "Assessed for insulin pump",
      "Full set of vitals obtained",
      "Identified cause of hypoglycemia (missed meals + insulin taken)",
      "Patient advised to eat carbohydrate meal",
      "Confirmed patient does not take sulfonylureas"
    ],
    "bonusActions": [
      "Discussed with patient: importance of not taking insulin without eating",
      "Recognized metformin on medication list — noted it can contribute to hypoglycemia",
      "Documented clear cause of hypoglycemia per release criteria",
      "Used D10 instead of D50 (preferred per safety considerations)"
    ]
  },

  "debriefing": {
    "learningObjectives": [
      "Recognize signs and symptoms of hypoglycemia",
      "Select appropriate glucose replacement route based on patient's ability to protect airway",
      "Understand why D10 is preferred over D50",
      "Apply safe-release criteria for resolved hypoglycemia",
      "Identify medications that increase risk of recurrent hypoglycemia",
      "Manage hypoglycemic seizure and understand why transport is mandatory post-seizure"
    ],
    "discussionQuestions": [
      "Why did we choose IV dextrose instead of oral glucose for this patient?",
      "What would you do differently if IV access could not be established?",
      "This patient takes metformin and insulin glargine. Can he be safely released? Why or why not?",
      "What if the glucose only came up to 55 after the first round of D10?",
      "What if this patient had also been seizing when you arrived?",
      "If the patient seizes, can you still release them at the scene after the seizure stops and glucose normalizes?"
    ],
    "commonPitfalls": [
      "Giving oral glucose to a patient who cannot protect their airway",
      "Using D50 when D10 is available (higher risk of tissue damage and hyperglycemia)",
      "Forgetting to recheck blood glucose after treatment",
      "Releasing patient without evaluating all safe-release criteria",
      "Not identifying sulfonylurea use as a risk factor for recurrent hypoglycemia",
      "Delaying dextrose administration while focusing on secondary assessments"
    ],
    "keyTakeaways": [
      "Always check glucose on any altered patient",
      "D10 is as effective as D50 and significantly safer",
      "All 8 safe-release criteria must be met — missing even one means transport",
      "Sulfonylureas have 12-60 hour half-lives — these patients need hospital observation",
      "Hypoglycemic patients who seize must be transported regardless of recovery"
    ]
  },

  "realiti": {
    "scenarioMonitorType": 20,
    "scenarioDefaultEnergy": 200,
    "scenarioDefaultPacerThreshold": 55
  }
}
```

---

## Implementation Roadmap

### Phase 1: Schema & Export Functions
1. Finalize unified schema JSON Schema file
2. Build REALITi export function (unified → REALITi JSON, flattening default path only)
3. Build HTML export function (unified → interactive HTML with branching support)
4. Validate REALITi export against their web interface (manual paste for now, Selenium later)

### Phase 2: Protocol Infrastructure
1. Convert your existing protocols to the markdown skill format
2. Build `protocol-index.md` with slug/keyword mappings
3. Set up protocol directory accessible to the agent

### Phase 3: Agentic Generation Loop
1. Build the system prompt with schema, ECG codes, and generation instructions
2. Implement protocol selection step (index lookup → load full protocols)
3. Implement structured output generation (unified JSON)
4. Implement validation step with retry loop
5. Wire up export functions

### Phase 4: Interactive HTML Template
1. Build the HTML template engine (takes unified JSON → rendered HTML)
2. Implement tabbed phase navigation with branching visualization
3. Implement expandable action rationales
4. Implement checklist/grading mode
5. Print CSS for paper handouts

### Phase 5: REALITi Automation (Future)
1. Selenium-based paste into REALITi web interface
2. Field-by-field mapping validation against their form
3. Batch scenario upload capability
