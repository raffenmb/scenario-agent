# Protocol Ingestion Engine & Set-Based Protocol Selection

| Field | Value |
|---|---|
| Date | 2026-03-15 |
| Status | Draft |
| Scope | CLI-based protocol ingestion from source documents + priority-ordered set selection for scenario generation |

---

## Problem

The app currently ships with a fixed library of 28 hand-written protocol `.md` files in `protocol_docs/`. Users cannot add their own protocols without manually authoring Markdown files with the correct frontmatter format. Different organizations, certifications, and jurisdictions use different protocol sets (regional EMS, AHA ACLS, local fire department, etc.), and users need the ability to bring their own protocols into the system.

## Solution

Two connected features:

1. **Protocol Ingestion Engine** — A CLI command that accepts protocol source documents (PDF, DOCX, TXT, MD, images), extracts clinically actionable protocols using Claude, and writes them as `.md` files in the existing format.
2. **Set-Based Protocol Selection** — Protocols are organized into named sets (folders). At scenario generation time, users select which sets to include and assign priority order for conflict resolution.

---

## Architecture: Layered Pipeline

The ingestion engine follows the existing codebase pattern of separating agents, I/O, and orchestration.

### Layer 1: Document Reader

**New file:** `src/ingestion/document-reader.ts`

Converts any supported source file into a normalized array of chunks for the ingestion agent.

**Format handling:**

| Format | Strategy |
|---|---|
| PDF | Render each page as a base64 image for Claude vision |
| Images (PNG, JPG) | Single chunk sent directly to vision |
| DOCX | Programmatic text extraction via `mammoth`. Embedded images detected and sent to vision separately |
| TXT, MD | Raw text split by heading boundaries or fixed token windows (~2000 tokens) |

**Output interface:**

```typescript
interface DocumentChunk {
  pageNumber: number;
  totalPages: number;
  type: 'vision' | 'text';
  content: string;           // text content or base64 image data
  mimeType?: string;         // for vision chunks
  embeddedImages?: string[]; // base64 images extracted from DOCX
}
```

The reader is stateless — it converts a file path into an ordered array of chunks. All intelligence lives in the agent layer.

### Layer 2: Ingestion Agent

**New files:** `src/agents/protocol-ingester.ts`, `src/prompts/protocol-ingester.ts`

Claude-powered extraction agent following the same pattern as `protocol-selector.ts` and `scenario-generator.ts`.

**Per-chunk processing:** For each chunk, the orchestrator sends Claude:
- The current chunk (vision or text)
- The `currentProtocol` accumulator from the state file
- The `completedIndex` from the state file (for cross-reference matching)

Claude responds with structured JSON:

```typescript
interface IngestionResult {
  classification: 'protocol_content' | 'non_protocol';
  skipReason?: string;
  isNewProtocol: boolean;
  protocolName?: string;
  protocolSlug?: string;
  extractedContent: string;
  hasFlowchart: boolean;
  detectedRefs: string[];   // slugs or UNRESOLVED:best-guess
}
```

**Agent responsibilities:**
- Classify pages as protocol vs. non-protocol (TOC, cover pages, admin content, revision history)
- Extract clinical content faithfully — dosages, thresholds, criteria preserved verbatim
- Convert flowcharts and visual decision algorithms to conditional prose (If/Then/Else)
- Detect cross-references to other protocols and generate slug guesses
- Determine protocol boundaries (new protocol vs. continuation of current)

**Key design choice:** Claude does extraction and classification only. The orchestrator handles all file I/O, state management, and the processing loop.

### Layer 3: State File & Resumption

**New file:** `src/ingestion/state.ts`

A JSON state file persisted per protocol set, enabling resume on interruption.

**Location:** `protocol_docs/{set-name}/.ingestion-state.json`

**Structure:**

```typescript
interface IngestionState {
  sourceFile: string;
  sourceFormat: string;
  totalPages: number;
  currentPage: number;
  status: 'in_progress' | 'completed' | 'needs_reconciliation';
  currentProtocol: {
    name: string;
    slug: string;
    startPage: number;
    accumulatedContent: string;
    hasFlowchart: boolean;
    unresolvedRefs: string[];
  } | null;
  completedIndex: Array<{
    slug: string;
    name: string;
    description: string;
    pageRange: string;
    hasFlowchart: boolean;
    crossRefs: string[];
  }>;
  skippedPages: Array<{
    page: number;
    reason: string;
  }>;
}
```

**Resumption logic:**
- On startup, check for existing state file in the set's directory.
- If found and `status === 'in_progress'`, resume from `currentPage`.
- If found and `status === 'completed'`, inform user it's already processed and ask if they want to re-run.
- If not found, initialize fresh state.
- State file is written after every page — worst case on interruption is re-processing one page.
- If the source file has changed since the state was saved (different file size or modified date), warn the user and ask whether to resume or restart.

### Layer 4: Protocol Writer & Reconciliation

**New files:** `src/ingestion/protocol-writer.ts`, `src/ingestion/reconciler.ts`

**Writing:** When the ingestion agent finalizes a protocol, the writer produces a `.md` file matching the existing format:

```yaml
---
protocol: Cardiac Arrest — Adult
slug: cardiac-arrest-adult
section: "{Set Name}"
description: Use for unresponsive patients with no pulse...
has_flowchart: true
cross_refs:
  - vascular-access
  - post-rosc-care
source_pages: "12-15"
source_format: pdf
ingested: true
---

[extracted protocol body with [[slug]] cross-references]
```

- `ingested: true` distinguishes from hand-written protocols
- `section` is set to the protocol set's display name
- Output location: `protocol_docs/{set-slug}/{slug}.md`

**Reconciliation pass** (runs after all pages processed):
1. Scan all newly written `.md` files for `[[UNRESOLVED:slug]]` placeholders
2. Match against the completed index + all existing protocols across all sets
3. Replace resolved references with valid `[[slug]]` links
4. Generate a summary report
5. Update state file status to `completed`

**Confirmation step:** Before writing files, the CLI displays:

```
Extracted 12 protocols from regional-protocols.pdf
into set "Regional EMS 2024":
  - cardiac-arrest-adult (pp. 12-15, 2 cross-refs)
  - chest-pain-acs (pp. 16-19, 3 cross-refs)
  ...
  Skipped 4 pages (cover, TOC, acknowledgments, revision history)
  2 unresolved references (will need manual review)

Write to protocol_docs/regional-ems-2024/? (Y/n)
```

User confirms, then files are written and reconciliation runs.

---

## Set-Based Protocol Organization

### Folder Structure

```
protocol_docs/
  MATC/
    cv-bradycardia.md
    cv-chest-pain-acs.md
    medical-hypoglycemia.md
    ...
  aha-acls-2025/
    vfib-pvt.md
    bradycardia-algorithm.md
    .ingestion-state.json
  regional-ems-2024/
    cardiac-arrest-adult.md
    chest-pain-acs.md
    .ingestion-state.json
```

**Migration:** Existing 28 protocols move from `protocol_docs/` root into `protocol_docs/MATC/`. The protocol loader is updated to scan subdirectories.

### Priority-Ordered Selection

At scenario generation time, the user selects which sets to include and assigns a priority order:

```
Select protocol sets for this scenario:
  [x] 1. MATC (28 protocols)          <- highest priority
  [x] 2. AHA ACLS 2025 (8 protocols)
  [ ]    Regional EMS 2024 (12 protocols)

  [Reorder] [Continue]
```

- Selection is **set-level only** — all protocols in a selected set are available, no individual protocol toggling
- Priority order determines conflict resolution: when multiple protocols from different sets address the same clinical situation with differing guidance (dosages, thresholds, procedures), the scenario generator follows the higher-priority set
- The protocol selector agent sees all protocols from selected sets
- The scenario generator's system prompt is updated with priority instructions and cites which protocol drove each decision in the `protocolReference` field

---

## CLI Commands & Flow

### Ingest Mode

```
ts-node src/index.ts ingest --name "AHA ACLS 2025" path/to/file.pdf
```

1. Prompt for name interactively if `--name` not provided
2. Check for existing state file — resume if found
3. Run document reader to produce chunks
4. Run ingestion agent loop (page by page, updating state)
5. Run reconciliation pass
6. Display summary, prompt for confirmation
7. Write `.md` files to `protocol_docs/{set-slug}/`

### Generate Mode (Modified)

```
ts-node src/index.ts generate "52-year-old male with chest pain"
```

1. Scan `protocol_docs/` for subdirectories — each is a protocol set
2. Display interactive checklist of sets with protocol counts
3. User selects sets and assigns priority order
4. Protocol loader builds index from selected sets only
5. Existing flow continues — protocol selector agent, scenario generator, export

### Modified Files

- `src/index.ts` — add `ingest` command, add set selection step to `generate`
- `src/protocols/loader.ts` — accept array of set directory names, scan subdirectories, build unified index

### New Dependency

`@inquirer/prompts` (or similar) for interactive checklist and reordering UI.

---

## Edge Cases

| Case | Handling |
|---|---|
| Duplicate slugs across sets | Disambiguate with set prefix: `aha-acls-2025/cardiac-arrest-adult` vs `MATC/cardiac-arrest-adult` |
| Corrupt/unreadable page | Log as skipped with reason `"unreadable"`, continue processing |
| Document yields zero protocols | Inform user, don't create set folder |
| State file mismatch (source file changed) | Warn user, ask whether to resume or restart |
| No protocol sets found | Error with guidance to move built-in protocols or run ingestion |
| Empty set folder | Skip with warning during generation |
| Cross-ref to protocol in unselected set | Protocol selector agent won't find it — same as missing protocol today |
| Conflicting guidance across sets | Higher-priority set wins; scenario generator cites which protocol it followed |

---

## Files to Create

| File | Purpose |
|---|---|
| `src/ingestion/document-reader.ts` | Format detection, chunk extraction |
| `src/ingestion/state.ts` | State file management, resumption logic |
| `src/ingestion/protocol-writer.ts` | Write finalized protocols as `.md` files |
| `src/ingestion/reconciler.ts` | Resolve cross-reference placeholders |
| `src/agents/protocol-ingester.ts` | Claude-powered extraction agent |
| `src/prompts/protocol-ingester.ts` | System prompt for ingestion agent |

## Files to Modify

| File | Change |
|---|---|
| `src/index.ts` | Add `ingest` command, add set selection to `generate` flow |
| `src/protocols/loader.ts` | Scan subdirectories, accept set names, build unified index |
| `src/prompts/scenario-generator.ts` | Add priority-based conflict resolution instructions |
| `protocol_docs/` | Move existing protocols into `protocol_docs/MATC/` |
