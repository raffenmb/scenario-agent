# Unified Scenario Schema Reference

This document defines the complete JSON schema for paramedic training scenarios, including the ECG rhythm code table, validation rules, and clinical consistency constraints.

## Table of Contents

1. [Top-Level Structure](#top-level-structure)
2. [meta](#meta)
3. [patient](#patient)
4. [scene](#scene)
5. [phases](#phases)
6. [assessment](#assessment)
7. [debriefing](#debriefing)
8. [realiti](#realiti-config)
9. [ECG Rhythm Code Table](#ecg-rhythm-code-table)
10. [Validation Rules](#validation-rules)
11. [Medication Action Rules](#medication-action-rules)

---

## Top-Level Structure

```json
{
  "meta": {},
  "patient": {},
  "scene": {},
  "phases": [],
  "assessment": {},
  "debriefing": {},
  "realiti": {}
}
```

All top-level keys are required except `realiti`.

---

## meta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique scenario identifier, e.g., "hypo-001" |
| name | string | yes | Descriptive scenario name |
| version | number | no | Default 1 |
| difficulty | string | yes | "beginner", "intermediate", or "advanced" |
| category | string | no | e.g., "Medical", "Trauma", "Cardiac" |
| protocols | string[] | yes | Protocol slugs used in this scenario |
| totalTimeSeconds | number | yes | Expected scenario duration in seconds |
| createdAt | string | no | ISO 8601 date-time |
| tags | string[] | no | Searchable tags |

---

## patient

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Realistic patient name |
| age | number | yes | Patient age |
| ageUnit | string | no | Default "years" |
| sex | string | yes | "male" or "female" |
| weight | number | yes | Weight in kg |
| height | number | yes | Height in cm |
| chiefComplaint | string | yes | Chief complaint |
| history | object | yes | SAMPLE history (see below) |

### patient.history

| Field | Type | Description |
|-------|------|-------------|
| hpi | string | Detailed history of present illness |
| pastMedical | string[] | Past medical history items |
| medications | string[] | Current medications with doses |
| allergies | string[] | Allergies with reaction type |
| lastOralIntake | string | Last oral intake |
| events | string | Events leading to EMS call |

---

## scene

| Field | Type | Description |
|-------|------|-------------|
| dispatch | string | What the paramedic hears from dispatch. Keep it realistic but generic — do NOT reveal the diagnosis. A postictal patient dispatches as "altered mental status," not "seizure." Include age, sex, brief complaint, and location type. |
| location | string | Detailed location description |
| time | string | Time and day context |
| safety | string | Scene safety considerations |
| bystanders | string | Who is present, what they report |
| visualCues | string[] | What providers see on arrival |

---

## phases

Array of phase objects. Each scenario needs:
- At least one phase with no `triggerCondition` (the entry phase)
- At least one phase with `isDefault: true` (the expected/"happy" path)
- At least one branch phase (`isDefault: false`) showing consequences of delayed/incorrect treatment
- Typically 3-5 phases on the default path, plus 1+ branch phases

### Phase object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique phase identifier (e.g., "initial", "post-treatment") |
| name | string | yes | Display name |
| description | string | yes | What's happening clinically |
| triggerCondition | string | no | What causes entry. Omit for the initial phase. |
| isDefault | boolean | no | true for happy path, false for branches. Default true. |
| transitions | array | no | Conditional transitions to other phases |
| clinicalPresentation | object | yes | What providers observe (NOT on monitor) |
| monitorState | object | yes | Values on the patient monitor |
| expectedActions | array | no | What providers should do in this phase |

### transitions[]

| Field | Type | Description |
|-------|------|-------------|
| targetPhaseId | string | id of target phase (must exist) |
| condition | string | Human-readable condition |
| conditionType | string | "action_not_taken", "action_taken", "time_elapsed", "vital_threshold" |
| timeoutSeconds | number | For time-based conditions |
| triggerActionIds | string[] | References to expectedActions[].id |

### clinicalPresentation

| Field | Type | Description |
|-------|------|-------------|
| avpu | string | "Alert", "Verbal", "Pain", or "Unresponsive" |
| gcs | object | `{ eye: 1-4, verbal: 1-5, motor: 1-6 }` |
| airway | string | Airway findings |
| breathing | string | Breathing findings |
| circulation | string | Circulation findings |
| skin | object | `{ color, temperature, moisture }` |
| pupils | string | Pupil findings |
| motorFunction | string | Motor function findings |
| otherFindings | string[] | Additional observations |
| patientSpeech | string | What patient says if conscious |

### monitorState

| Field | Type | Description |
|-------|------|-------------|
| ecgRhythm | string | Human-readable rhythm name from the ECG table below |
| ecgWaveform | number | REALITi waveform code from the ECG table below |
| hr | number | Heart rate (bpm) |
| bpSys | number | Systolic BP (mmHg) |
| bpDia | number | Diastolic BP (mmHg) |
| respRate | number | Respiratory rate (/min) |
| spo2 | number | SpO2 (%) |
| etco2 | number | EtCO2 (mmHg) |
| temp | number | Temperature (Celsius) |
| obstruction | number | Airway obstruction 0-100 |
| glucose | number | Blood glucose (mg/dL) |
| customMeasures | array | `[{ label: string, value: number }]` |
| trendTimeSeconds | number | Transition duration to this state. Use **0** only for the initial/entry phase (no previous state to transition from). For every subsequent phase use **10–60 seconds**, varied by clinical context: **10–20s** for abrupt events (arrest, arrhythmia onset, immediate drug response); **20–40s** for typical physiologic drift or medication effect; **40–60s** for the "long" transitions — slow deterioration, gradual response to fluids, wearing off of therapy. Values outside 0 or 10–60 are clamped on export. |
| visibility | object | `{ spo2Visible, spo2Attached, rrVisible, etco2Visible, cvpVisible }` (all boolean) |

### expectedActions[]

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique action ID within this phase |
| action | string | yes | The action description (see medication rules below) |
| priority | string | yes | "critical", "important", or "supplemental" |
| rationale | string | no | Why this action matters |
| protocolReference | string | no | Human-readable protocol name, e.g., "MATC: Hypoglycemia" |

---

## assessment

| Field | Type | Description |
|-------|------|-------------|
| criticalActions | string[] | Must-do actions — failure = scenario failure |
| expectedActions | string[] | Should-do actions |
| bonusActions | string[] | Above-and-beyond mastery actions |

---

## debriefing

| Field | Type | Description |
|-------|------|-------------|
| learningObjectives | string[] | What students should learn |
| discussionQuestions | string[] | Open-ended debrief questions |
| commonPitfalls | string[] | Common mistakes students make |
| keyTakeaways | string[] | Core lessons |

---

## realiti config

Optional REALITi-specific settings:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| scenarioMonitorType | number | 2 (Zoll X-Series, always) | Monitor display type — always emitted as 2 |
| scenarioDefaultEnergy | number | 200 | Default defibrillator energy (joules) |
| scenarioDefaultPacerThreshold | number | 55 | Default pacer threshold |

---

## ECG Rhythm Code Table

You MUST select `ecgRhythm` from this list and set the matching `ecgWaveform` code:

| Rhythm | Waveform Code |
|--------|--------------|
| Normal Sinus Rhythm | 9 |
| Sinus Rhythm | 9 |
| Sinus Bradycardia | 9 |
| Sinus Tachycardia | 9 |
| Asystole | 3 |
| Pulseless Electrical Activity (PEA) | 9 |
| Ventricular Fibrillation (Fine) | 18 |
| Ventricular Fibrillation (Coarse) | 18 |
| Ventricular Tachycardia (Monomorphic) | 12 |
| Ventricular Tachycardia (Polymorphic) | 12 |
| Torsades de Pointes | 12 |
| Atrial Fibrillation | 38 |
| Atrial Flutter | 1 |
| Supraventricular Tachycardia | 4 |
| First Degree AV Block | 5 |
| Second Degree AV Block Type I | 6 |
| Second Degree AV Block Type II | 103 |
| AV Block Type II 2:1 | 40 |
| Third Degree Heart Block | 100 |
| Idioventricular Rhythm | 91 |
| Accelerated Idioventricular Rhythm | 91 |
| Accelerated Junctional Rhythm | 79 |
| Left Bundle Branch Block | 80 |
| Right Bundle Branch Block | 82 |
| Wolff-Parkinson-White | 84 |
| Pacemaker Rhythm | 9 |
| Pacemaker Failure to Capture | 9 |
| Hyperkalemia Changes | 20 |
| Hypokalemia Changes | 21 |
| STEMI Anterior | 23 |
| STEMI Inferior | 24 |
| STEMI Lateral | 25 |
| STEMI Posterior | 26 |
| NSTEMI | 55 |
| Pericarditis | 22 |
| Brugada Syndrome | 35 |
| Wellens Syndrome | 36 |
| Early Repolarization | 41 |
| Pulmonary Embolism (S1Q3T3) | 45 |
| Long QT Syndrome | 37 |
| PVC | 49 |
| Atrial Tachycardia | 4 |
| Sinus Arrest | 3 |

### Shared-Code Rhythm Disambiguation

Several rhythms share waveform codes. Differentiate using vitals:

- **Code 9**: Normal Sinus (HR 60-100), Sinus Brady (HR <60), Sinus Tachy (HR >100), PEA (HR >0 but bpSys=0/bpDia=0)
- **Code 3**: Asystole (sustained), Sinus Arrest (transient pause)
- **Code 12**: Monomorphic VT, Polymorphic VT, Torsades (use Long QT context)
- **Code 91**: Idioventricular (HR 20-40), Accelerated Idioventricular (HR 40-100)

### Airway Obstruction Scale

| Condition | Value |
|-----------|-------|
| Normal | 0 |
| Mild asthma | 15 |
| Moderate asthma | 40 |
| Severe asthma | 70 |
| COPD exacerbation | 50 |
| Anaphylaxis | 60 |
| Foreign body | 80 |
| Complete obstruction / tension pneumo | 100 |

---

## Validation Rules

### Hard Errors (must fix)

1. **Required fields**: meta.id, meta.name, meta.difficulty, meta.protocols (non-empty), meta.totalTimeSeconds, patient.name, patient.chiefComplaint, at least one phase
2. **Phase references**: Every `transition.targetPhaseId` must match an existing phase id
3. **No circular references**: Phase transition chains must not loop back
4. **Default path exists**: At least one phase must have `isDefault: true` (or undefined, which defaults to true)
5. **Entry phase exists**: At least one phase must lack `triggerCondition`
6. **ECG waveform match**: If `ecgRhythm` is in the table, `ecgWaveform` must equal the table value
7. **Cardiac arrest enforcement**: If waveform is 18 (VFib) or 3 (Asystole), OR if hr=0 + bpSys=0 + bpDia=0: spo2 must be 0 and spo2Visible must be false
8. **Obstruction range**: 0-100

### Warnings (should fix)

1. **HR vs rhythm label**: Sinus Bradycardia should have HR <60, Sinus Tachycardia HR >100, Normal Sinus HR 60-100
2. **AVPU/GCS consistency**: Unresponsive should have GCS total <= 6, Alert should have GCS total >= 14
3. **Skin signs vs hemodynamics**: Warm/pink/dry skin with hypotension (BP <90) and tachycardia (HR >100) is inconsistent
4. **Weight validity**: Must be a positive number
5. **Unknown ECG rhythm**: ecgRhythm not in the table (may indicate a typo)

---

## Medication Action Rules

This is critical for clinical accuracy. When an `expectedAction` involves administering a medication, the action text MUST include ALL of the following from the protocol:

- **Drug name**
- **Dose** (with weight-based calculation if applicable)
- **Route** (IV, IM, IO, IN, PO, SQ, nebulized, etc.)
- **Concentration/formulation** if specified (e.g., "D10%" vs "D50%")
- **Rate** if specified (e.g., "infuse over 10 minutes")
- **Repeat/max dosing** if specified (e.g., "may repeat x1", "max 3 mg")

### Examples

**Bad:**
- "Administer dextrose"
- "Give glucagon"
- "Administer epinephrine per protocol"

**Good:**
- "Administer Dextrose 10% 250 mL (25 g) IV, titrate to mental status improvement"
- "Administer Glucagon 1 mg IM if IV access cannot be established"
- "Administer Epinephrine 1:1,000 (1 mg/mL) 0.3 mg IM in the lateral thigh; may repeat every 5-15 minutes"

### Weight-Based Dosing

If the protocol provides weight-based dosing, show BOTH the per-kg dose AND the calculated dose for this patient:

- "Administer Midazolam 0.1 mg/kg (8 mg for 80 kg patient) IN"
- "Administer Epinephrine 0.01 mg/kg (0.7 mg for 70 kg patient) IV/IO"
- "Administer Dexamethasone 0.6 mg/kg (42 mg for 70 kg patient) IV, max 16 mg"

For fixed-dose medications (not weight-based), just state the dose directly.

This rule applies to `expectedActions` in phases AND to `criticalActions`/`expectedActions` in the `assessment` section.

### Protocol Set Priority

When protocols from multiple sets are provided, they are listed in priority order (highest first). If conflicting guidance exists across sets, follow the higher-priority set. In `protocolReference`, use format: `"MATC: Protocol Name"`.

---

## Generation Guidelines

- Create realistic, clinically accurate scenarios based on the protocols provided
- Include 3-5 phases on the default path, plus at least 1 branch phase
- Make expectedActions specific and protocol-referenced where possible
- Write detailed clinicalPresentation — this is what makes the scenario useful for teaching
- Include practical visual cues in the scene that hint at the diagnosis
- Write debriefing content that promotes critical thinking, not just recall
- The dispatch line should sound like what a real dispatcher would say — brief, no diagnosis
