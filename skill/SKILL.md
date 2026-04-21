---
name: scenario-generator
description: >
  Generate realistic paramedic EMS training scenarios with clinically accurate vitals, protocol-referenced expected actions,
  branching decision paths, and export to interactive HTML and REALITi patient monitor simulator JSON.
  Use this skill whenever Raff asks to create a paramedic scenario, generate a training scenario, build a sim scenario,
  make a patient scenario, create scenarios for lab, generate EMS scenarios, or anything involving paramedic training
  scenario creation. Also use when asked to batch-generate multiple scenarios. Even if the request is casual like
  "make me a scenario" or "I need a hypoglycemia sim" or "build some scenarios for next week's lab", this is the right
  skill. Protocol ingestion (importing new protocol documents) lives in a separate `protocol_loader` project — do NOT
  use this skill for that.
---

# Paramedic Scenario Generator

You generate structured EMS training scenarios for MATC paramedic education. Each scenario produces:
- **Unified JSON** — the canonical scenario data (phases, vitals, expected actions, debriefing)
- **REALITi JSON** — formatted for the REALITi patient monitor simulator
- **Interactive HTML** — a self-contained mobile-friendly web page for student self-assessment

## Quick Start

When the user asks you to create scenarios, ask them:

> What would you like to do?
> 1. **Generate a single scenario** — describe a clinical situation and I'll build it
> 2. **Generate a batch** — I'll plan a diverse set of scenarios covering protocol gaps

Then follow the appropriate workflow below.

If the user asks to **ingest or import a protocol document** (PDF/DOCX/etc.) into a new protocol set, that is **not this skill** — it lives in the standalone `protocol_loader` project at `C:\Users\mattr\Desktop\ems_ai\protocol_loader\`. Point the user there.

## Where Things Live

- **Protocol files**: `<skill-path>/references/protocols/MATC/` — 68 MATC EMS protocol markdown files with YAML frontmatter
- **Export scripts**: `<skill-path>/scripts/` — Node.js scripts for HTML export, REALITi export, and validation
- **HTML template**: `<skill-path>/assets/scenario-template.html` — CSS template for interactive HTML
- **Schema reference**: `<skill-path>/references/schema.md` — full schema, ECG table, validation rules

The default output directory is `~/Desktop/projects/scenario_agent/output/`. Create a subdirectory named after the scenario ID (e.g., `output/hypo-001/`).

---

## Mode 1: Single Scenario Generation

### Step 1: Select Protocols

Read the protocol index to find relevant protocols. To build the index, glob `<skill-path>/references/protocols/MATC/*.md` and read the YAML frontmatter (between the `---` markers) of each file to get `slug`, `section`, and `description`.

Based on the user's scenario description, identify 2-5 relevant protocols. Read the full content of each selected protocol — you need the clinical details (dosages, thresholds, decision criteria) to generate accurate expected actions.

When selecting protocols, also check for cross-references inside them (lines like `> See: \`slug\``). If a cross-referenced protocol is clinically relevant, read it too.

### Step 2: Generate Unified JSON

Read `<skill-path>/references/schema.md` for the complete schema specification, ECG rhythm code table, and clinical rules. This reference is essential — it contains the exact field definitions, validation constraints, and medication dosing rules you must follow.

Generate a complete JSON object conforming to the unified scenario schema. Key things to get right:

- **ECG rhythm/waveform pairing**: Every `ecgRhythm` must come from the ECG table, and `ecgWaveform` must be the matching code
- **Medication actions**: When an expected action involves a medication, include drug name, dose (with weight-based calculation), route, concentration, and repeat/max dosing — all from the protocol
- **Cardiac arrest enforcement**: If the rhythm is asystole or VFib, or HR=0/BP=0/0, set spo2=0 and spo2Visible=false
- **AVPU/GCS consistency**: Unresponsive must have GCS <= 6, Alert must have GCS >= 14
- **Branching**: Include at least one branch phase showing consequences of delayed/incorrect treatment
- **Dispatch realism**: The dispatch line should be generic (what a paramedic hears over the radio) — don't reveal the diagnosis

### Step 3: Validate

Run the validation script against the generated JSON:

```bash
node "<skill-path>/scripts/validate.js" "<output-dir>/unified.json"
```

If there are errors, fix them in the JSON and re-validate. Warnings are informational but should be addressed if they indicate genuine clinical inconsistency.

### Step 4: Export

Run all three export scripts:

```bash
node "<skill-path>/scripts/export-realiti.js" "<output-dir>/unified.json" "<output-dir>/realiti.json"
node "<skill-path>/scripts/export-html.js" "<output-dir>/unified.json" "<output-dir>/index.html" "<skill-path>/assets/scenario-template.html"
node "<skill-path>/scripts/export-print.js" "<output-dir>/unified.json" "<output-dir>/printable.html"
```

Tell the user where the files are and offer to open the interactive HTML in their browser. The print HTML is meant to be opened and sent to Print / Save as PDF.

---

## Mode 2: Batch Generation

### Step 1: Gather Requirements

Ask:
- How many scenarios?
- Any constraints? (e.g., "BLS-only", "focus on cardiac", "intermediate difficulty", "pediatric only")

### Step 2: Build Scenario Index

Scan the output directory for existing `unified.json` files. For each, note the scenario ID, name, protocols used, and difficulty. This prevents generating duplicates.

### Step 3: Plan the Batch

Design a batch plan following these priorities:
1. **Gap filling** — protocols with no existing scenarios come first
2. **Difficulty balance** — mix beginner, intermediate, and advanced
3. **Unique before similar** — exhaust distinct protocol combos before variations
4. **Realistic first, then complex** — straightforward cases early, multi-protocol complications later
5. **Demographic variety** — vary age, sex, and scene settings

Present the plan as a numbered list with title, difficulty, target protocols, and learning objectives. Ask for approval or revision.

### Step 4: Generate Each Scenario

For each plan entry, follow the single-scenario workflow (Steps 1-4 above). After each scenario, note what was generated so far to inform diversity in subsequent scenarios. If a generation fails validation after 3 attempts, skip it and move to the next.

Report progress: "Generating scenario 3/8: Pediatric Febrile Seizure..."

---

## Protocol Reference Format

Each protocol in `references/protocols/MATC/` has YAML frontmatter:

```yaml
---
protocol: Human Readable Name
slug: section-kebab-case
section: Medical | Trauma | Cardiac | Respiratory | Resuscitation | Toxicology | Environmental | OB/GYN | Pediatric
description: When to use this protocol
---
```

The slug format is `section-topic` (e.g., `medical-hypoglycemia`, `trauma-burns`, `cv-chest-pain-acs-stemi`).

When referencing protocols in `expectedAction.protocolReference`, use the human-readable format: `"MATC: Protocol Name"` (e.g., `"MATC: Hypoglycemia"`, `"MATC: Cardiac Arrest"`).

---

## Output Structure

Each generated scenario creates a directory:

```
output/<scenario-id>/
  unified.json          — Complete scenario data (canonical source)
  realiti.json          — REALITi-compatible format (paste into REALITi web UI)
  index.html            — Interactive HTML (tabs, timer, checkboxes, mobile-optimized; named `index.html` so GitHub Pages / static hosts serve it at the directory root)
  printable.html   — Printable HTML (sequential layout, no interactivity, no debrief) — open in a browser and Print to PDF
```

The scenario ID should be descriptive and kebab-cased: `hypo-001`, `trauma-mvc-002`, `cardiac-stemi-001`.
