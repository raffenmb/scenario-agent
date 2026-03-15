# Protocol Ingestion Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CLI-based protocol ingestion engine that converts source documents (PDF, DOCX, TXT, MD, images) into protocol `.md` files, and reorganize protocols into named sets with priority-ordered selection at scenario generation time.

**Architecture:** Layered pipeline — Document Reader (format-specific chunk extraction) → Ingestion Agent (Claude-powered extraction/classification) → State Manager (resumable progress tracking) → Protocol Writer + Reconciler (`.md` output with cross-ref resolution). Existing protocol loader and CLI updated for set-based organization.

**Tech Stack:** TypeScript, Node.js, Anthropic Claude API (vision), `pdfjs-dist` (PDF rendering), `mammoth` (DOCX extraction), `@inquirer/prompts` (interactive CLI)

**Spec:** `docs/superpowers/specs/2026-03-15-protocol-ingestion-engine-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/ingestion/document-reader.ts` | Format detection, chunk extraction. Produces `DocumentChunk[]` from any supported file. |
| `src/ingestion/document-reader.test.ts` | Unit tests for document reader with fixture files |
| `src/ingestion/state.ts` | State file CRUD: init, load, save, resume logic, mismatch detection |
| `src/ingestion/state.test.ts` | Unit tests for state management |
| `src/ingestion/protocol-writer.ts` | Converts finalized protocol data into `.md` files with YAML frontmatter |
| `src/ingestion/protocol-writer.test.ts` | Unit tests for protocol writer |
| `src/ingestion/reconciler.ts` | Resolves `[[UNRESOLVED:slug]]` placeholders across written `.md` files |
| `src/ingestion/reconciler.test.ts` | Unit tests for reconciler |
| `src/ingestion/types.ts` | Shared interfaces: `DocumentChunk`, `IngestionState`, `IngestionResult`, `CompletedProtocol` |
| `src/agents/protocol-ingester.ts` | Orchestrator: sliding-window loop calling Claude per chunk, managing state transitions |
| `src/agents/protocol-ingester.test.ts` | Integration test with a small fixture document |
| `src/prompts/protocol-ingester.ts` | System prompt for the ingestion agent |
| `src/cli/set-selector.ts` | Interactive set selection + priority ordering UI using `@inquirer/prompts` |
| `test-fixtures/ingestion/sample.txt` | Small multi-protocol text file for testing |
| `test-fixtures/ingestion/sample.md` | Small markdown protocol file for testing |
| `test-fixtures/ingestion/single-protocol.txt` | Single protocol text file for testing |

### Modified Files

| File | Change |
|---|---|
| `src/types/schema.ts` | Add `set` field to `ProtocolEntry` |
| `src/protocols/loader.ts` | Scan subdirectories, accept set names, build set-qualified index |
| `src/protocols/loader.test.ts` | Update tests for set-based loading |
| `src/prompts/protocol-selector.ts` | No changes needed — `formatIndexForPrompt` in loader.ts handles set context |
| `src/prompts/scenario-generator.ts` | Add priority-based conflict resolution instructions |
| `src/agents/protocol-selector.ts` | No changes needed — uses `readProtocol()` which already handles set-based index |
| `src/index.ts` | Add `ingest` command, add set selection to `generate` flow |
| `package.json` | Add new dependencies |

---

## Chunk 1: Foundation — Types, State Management, Protocol Writer

### Task 1: Install dependencies and create shared types

**Files:**
- Modify: `package.json`
- Create: `src/ingestion/types.ts`

- [ ] **Step 1: Install new dependencies**

```bash
npm install pdfjs-dist mammoth @inquirer/prompts
npm install --save-dev @types/mammoth
```

- [ ] **Step 2: Create shared ingestion types**

Create `src/ingestion/types.ts`:

```typescript
// src/ingestion/types.ts

export interface DocumentChunk {
  pageNumber: number;
  totalPages: number;
  type: 'vision' | 'text';
  content: string;
  mimeType?: string;
}

export interface IngestionState {
  sourceFile: string;
  sourceFileSize: number;
  sourceFileModified: number;
  sourceFormat: string;
  setName: string;
  setSlug: string;
  totalPages: number;
  currentPage: number;
  status: 'in_progress' | 'completed' | 'needs_reconciliation';
  currentProtocol: CurrentProtocol | null;
  completedIndex: CompletedProtocol[];
  skippedPages: SkippedPage[];
}

export interface CurrentProtocol {
  name: string;
  slug: string;
  startPage: number;
  accumulatedContent: string;
  hasFlowchart: boolean;
  unresolvedRefs: string[];
}

export interface CompletedProtocol {
  slug: string;
  name: string;
  description: string;
  pageRange: string;
  hasFlowchart: boolean;
  crossRefs: string[];
  content: string;
}

export interface SkippedPage {
  page: number;
  reason: string;
}

export interface IngestionResult {
  classification: 'protocol_content' | 'non_protocol';
  skipReason?: string;
  isNewProtocol: boolean;
  protocolName?: string;
  protocolSlug?: string;
  extractedContent: string;
  hasFlowchart: boolean;
  detectedRefs: string[];
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/ingestion/types.ts
git commit -m "feat: install ingestion dependencies and create shared types"
```

---

### Task 2: State file management

**Files:**
- Create: `src/ingestion/state.ts`
- Create: `src/ingestion/state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/ingestion/state.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  initState,
  loadState,
  saveState,
  checkResumability,
} from './state';
import { IngestionState } from './types';

describe('state management', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestion-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initState', () => {
    it('creates a fresh state object', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'AHA ACLS 2025',
        setSlug: 'aha-acls-2025',
        totalPages: 10,
      });
      expect(state.status).toBe('in_progress');
      expect(state.currentPage).toBe(1);
      expect(state.currentProtocol).toBeNull();
      expect(state.completedIndex).toEqual([]);
      expect(state.skippedPages).toEqual([]);
    });
  });

  describe('saveState / loadState', () => {
    it('round-trips state to disk', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test Set',
        setSlug: 'test-set',
        totalPages: 5,
      });
      saveState(tmpDir, state);
      const loaded = loadState(tmpDir);
      expect(loaded).toEqual(state);
    });

    it('returns null when no state file exists', () => {
      const loaded = loadState(tmpDir);
      expect(loaded).toBeNull();
    });
  });

  describe('checkResumability', () => {
    it('returns "resume" when state matches source file', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test',
        setSlug: 'test',
        totalPages: 5,
      });
      const result = checkResumability(state, 1024, 1700000000000);
      expect(result).toBe('resume');
    });

    it('returns "mismatch" when file size differs', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test',
        setSlug: 'test',
        totalPages: 5,
      });
      const result = checkResumability(state, 2048, 1700000000000);
      expect(result).toBe('mismatch');
    });

    it('returns "completed" when status is completed', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test',
        setSlug: 'test',
        totalPages: 5,
      });
      state.status = 'completed';
      const result = checkResumability(state, 1024, 1700000000000);
      expect(result).toBe('completed');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/ingestion/state.test.ts --no-coverage
```

Expected: FAIL — module `./state` not found.

- [ ] **Step 3: Implement state management**

Create `src/ingestion/state.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { IngestionState } from './types';

const STATE_FILENAME = '.ingestion-state.json';

interface InitStateParams {
  sourceFile: string;
  sourceFileSize: number;
  sourceFileModified: number;
  sourceFormat: string;
  setName: string;
  setSlug: string;
  totalPages: number;
}

export function initState(params: InitStateParams): IngestionState {
  return {
    sourceFile: params.sourceFile,
    sourceFileSize: params.sourceFileSize,
    sourceFileModified: params.sourceFileModified,
    sourceFormat: params.sourceFormat,
    setName: params.setName,
    setSlug: params.setSlug,
    totalPages: params.totalPages,
    currentPage: 1,
    status: 'in_progress',
    currentProtocol: null,
    completedIndex: [],
    skippedPages: [],
  };
}

export function saveState(setDir: string, state: IngestionState): void {
  fs.mkdirSync(setDir, { recursive: true });
  const filePath = path.join(setDir, STATE_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function loadState(setDir: string): IngestionState | null {
  const filePath = path.join(setDir, STATE_FILENAME);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as IngestionState;
}

export type ResumabilityResult = 'resume' | 'completed' | 'mismatch';

export function checkResumability(
  state: IngestionState,
  currentFileSize: number,
  currentFileModified: number
): ResumabilityResult {
  if (state.status === 'completed') return 'completed';
  if (
    state.sourceFileSize !== currentFileSize ||
    state.sourceFileModified !== currentFileModified
  ) {
    return 'mismatch';
  }
  return 'resume';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/ingestion/state.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/state.ts src/ingestion/state.test.ts
git commit -m "feat: add ingestion state file management with resumption logic"
```

---

### Task 3: Protocol writer

**Files:**
- Create: `src/ingestion/protocol-writer.ts`
- Create: `src/ingestion/protocol-writer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/ingestion/protocol-writer.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { writeProtocolFile, buildFrontmatter } from './protocol-writer';
import { CompletedProtocol } from './types';

describe('protocol-writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleProtocol: CompletedProtocol = {
    slug: 'cardiac-arrest-adult',
    name: 'Cardiac Arrest — Adult',
    description: 'Use for unresponsive patients with no pulse.',
    pageRange: '12-15',
    hasFlowchart: true,
    crossRefs: ['vascular-access', 'post-rosc-care'],
    content: 'Assess initial rhythm.\n\nIf rhythm is VF/pVT:\n    Deliver defibrillation.',
  };

  describe('buildFrontmatter', () => {
    it('produces correct frontmatter object', () => {
      const fm = buildFrontmatter(sampleProtocol, 'AHA ACLS 2025', 'pdf');
      expect(fm.protocol).toBe('Cardiac Arrest — Adult');
      expect(fm.slug).toBe('cardiac-arrest-adult');
      expect(fm.section).toBe('AHA ACLS 2025');
      expect(fm.has_flowchart).toBe(true);
      expect(fm.cross_refs).toEqual(['vascular-access', 'post-rosc-care']);
      expect(fm.source_pages).toBe('12-15');
      expect(fm.source_format).toBe('pdf');
      expect(fm.ingested).toBe(true);
    });
  });

  describe('writeProtocolFile', () => {
    it('writes a valid .md file with frontmatter and body', () => {
      writeProtocolFile(tmpDir, sampleProtocol, 'Test Set', 'pdf');
      const filePath = path.join(tmpDir, 'cardiac-arrest-adult.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(raw);
      expect(data.slug).toBe('cardiac-arrest-adult');
      expect(data.ingested).toBe(true);
      expect(content.trim()).toContain('Assess initial rhythm.');
    });

    it('creates the output directory if it does not exist', () => {
      const nestedDir = path.join(tmpDir, 'nested', 'dir');
      writeProtocolFile(nestedDir, sampleProtocol, 'Test Set', 'pdf');
      expect(fs.existsSync(path.join(nestedDir, 'cardiac-arrest-adult.md'))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/ingestion/protocol-writer.test.ts --no-coverage
```

Expected: FAIL — module `./protocol-writer` not found.

- [ ] **Step 3: Implement protocol writer**

Create `src/ingestion/protocol-writer.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { CompletedProtocol } from './types';

interface ProtocolFrontmatter {
  protocol: string;
  slug: string;
  section: string;
  description: string;
  has_flowchart: boolean;
  cross_refs: string[];
  source_pages: string;
  source_format: string;
  ingested: boolean;
}

export function buildFrontmatter(
  protocol: CompletedProtocol,
  setName: string,
  sourceFormat: string
): ProtocolFrontmatter {
  return {
    protocol: protocol.name,
    slug: protocol.slug,
    section: setName,
    description: protocol.description,
    has_flowchart: protocol.hasFlowchart,
    cross_refs: protocol.crossRefs,
    source_pages: protocol.pageRange,
    source_format: sourceFormat,
    ingested: true,
  };
}

export function writeProtocolFile(
  setDir: string,
  protocol: CompletedProtocol,
  setName: string,
  sourceFormat: string
): string {
  fs.mkdirSync(setDir, { recursive: true });
  const frontmatter = buildFrontmatter(protocol, setName, sourceFormat);
  const fileContent = matter.stringify('\n' + protocol.content + '\n', frontmatter);
  const filePath = path.join(setDir, `${protocol.slug}.md`);
  fs.writeFileSync(filePath, fileContent);
  return filePath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/ingestion/protocol-writer.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/protocol-writer.ts src/ingestion/protocol-writer.test.ts
git commit -m "feat: add protocol writer for generating .md files from ingested data"
```

---

### Task 4: Reconciler

**Files:**
- Create: `src/ingestion/reconciler.ts`
- Create: `src/ingestion/reconciler.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/ingestion/reconciler.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { reconcileReferences, ReconciliationReport } from './reconciler';

describe('reconciler', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconciler-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves UNRESOLVED placeholders against a known index', () => {
    const content = `---
slug: test-protocol
---

If VF detected, proceed to [[UNRESOLVED:cardiac-arrest]].
`;
    fs.writeFileSync(path.join(tmpDir, 'test-protocol.md'), content);

    const knownSlugs = new Set(['cardiac-arrest', 'post-rosc-care']);
    const report = reconcileReferences(tmpDir, knownSlugs);

    const updated = fs.readFileSync(path.join(tmpDir, 'test-protocol.md'), 'utf-8');
    expect(updated).toContain('[[cardiac-arrest]]');
    expect(updated).not.toContain('UNRESOLVED');
    expect(report.resolved).toBe(1);
    expect(report.unresolved).toBe(0);
  });

  it('leaves unresolved refs that have no match and reports them', () => {
    const content = `---
slug: test-protocol
---

See [[UNRESOLVED:unknown-protocol]] for details.
`;
    fs.writeFileSync(path.join(tmpDir, 'test-protocol.md'), content);

    const knownSlugs = new Set(['cardiac-arrest']);
    const report = reconcileReferences(tmpDir, knownSlugs);

    const updated = fs.readFileSync(path.join(tmpDir, 'test-protocol.md'), 'utf-8');
    expect(updated).toContain('[[UNRESOLVED:unknown-protocol]]');
    expect(report.unresolved).toBe(1);
    expect(report.unresolvedDetails.length).toBe(1);
    expect(report.unresolvedDetails[0].file).toBe('test-protocol.md');
  });

  it('handles files with no UNRESOLVED placeholders', () => {
    const content = `---
slug: clean-protocol
---

No references here.
`;
    fs.writeFileSync(path.join(tmpDir, 'clean-protocol.md'), content);

    const knownSlugs = new Set(['cardiac-arrest']);
    const report = reconcileReferences(tmpDir, knownSlugs);

    expect(report.resolved).toBe(0);
    expect(report.unresolved).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/ingestion/reconciler.test.ts --no-coverage
```

Expected: FAIL — module `./reconciler` not found.

- [ ] **Step 3: Implement reconciler**

Create `src/ingestion/reconciler.ts`:

```typescript
import fs from 'fs';
import path from 'path';

export interface ReconciliationReport {
  resolved: number;
  unresolved: number;
  unresolvedDetails: Array<{
    file: string;
    slug: string;
  }>;
}

const UNRESOLVED_PATTERN = /\[\[UNRESOLVED:([\w-]+)\]\]/g;

export function reconcileReferences(
  setDir: string,
  knownSlugs: Set<string>
): ReconciliationReport {
  const report: ReconciliationReport = {
    resolved: 0,
    unresolved: 0,
    unresolvedDetails: [],
  };

  const files = fs.readdirSync(setDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(setDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    content = content.replace(UNRESOLVED_PATTERN, (match, slug) => {
      if (knownSlugs.has(slug)) {
        report.resolved++;
        modified = true;
        return `[[${slug}]]`;
      } else {
        report.unresolved++;
        report.unresolvedDetails.push({ file, slug });
        return match;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content);
    }
  }

  return report;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/ingestion/reconciler.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/reconciler.ts src/ingestion/reconciler.test.ts
git commit -m "feat: add cross-reference reconciler for ingested protocols"
```

---

## Chunk 2: Document Reader

### Task 5: Document reader — text formats (TXT, MD)

**Files:**
- Create: `src/ingestion/document-reader.ts`
- Create: `src/ingestion/document-reader.test.ts`
- Create: `test-fixtures/ingestion/sample.txt`
- Create: `test-fixtures/ingestion/sample.md`

- [ ] **Step 1: Create test fixture files**

Create `test-fixtures/ingestion/sample.txt`:

```
# Cardiac Arrest Protocol

Assess initial rhythm.

If rhythm is VF/pVT:
    Deliver defibrillation at manufacturer-recommended dose.
    Resume CPR immediately for 2 minutes.

# Bradycardia Protocol

If heart rate < 60 bpm with symptoms:
    Administer Atropine 1mg IV.
    May repeat every 3-5 minutes. Max 3mg.
```

Create `test-fixtures/ingestion/sample.md`:

```markdown
# Pain Management

## Inclusion Criteria

Patients with acute pain requiring EMS intervention.

## Treatment

Administer Fentanyl 1 mcg/kg IV/IN. May repeat every 5 minutes. Max 3 mcg/kg.
```

- [ ] **Step 2: Write the failing tests**

Create `src/ingestion/document-reader.test.ts`:

```typescript
import path from 'path';
import { readDocument } from './document-reader';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/ingestion');

describe('document-reader', () => {
  describe('TXT files', () => {
    it('splits text files into chunks by headings', async () => {
      const chunks = await readDocument(path.join(FIXTURES, 'sample.txt'));
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].type).toBe('text');
      expect(chunks[0].pageNumber).toBe(1);
      expect(chunks[0].totalPages).toBe(chunks.length);
    });
  });

  describe('MD files', () => {
    it('reads markdown files as text chunks', async () => {
      const chunks = await readDocument(path.join(FIXTURES, 'sample.md'));
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].type).toBe('text');
      expect(chunks[0].content).toContain('Pain Management');
    });
  });

  describe('unsupported formats', () => {
    it('throws for unsupported file extensions', async () => {
      await expect(readDocument('/fake/file.xyz')).rejects.toThrow('Unsupported');
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/ingestion/document-reader.test.ts --no-coverage
```

Expected: FAIL — module `./document-reader` not found.

- [ ] **Step 4: Implement document reader (text formats first)**

Create `src/ingestion/document-reader.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { DocumentChunk } from './types';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.png', '.jpg', '.jpeg']);

export async function readDocument(filePath: string): Promise<DocumentChunk[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  switch (ext) {
    case '.txt':
    case '.md':
      return readTextFile(filePath);
    case '.png':
    case '.jpg':
    case '.jpeg':
      return readImageFile(filePath);
    case '.docx':
      return readDocxFile(filePath);
    case '.pdf':
      return readPdfFile(filePath);
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}

function readTextFile(filePath: string): DocumentChunk[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const sections = splitByHeadings(raw);

  return sections.map((content, i) => ({
    pageNumber: i + 1,
    totalPages: sections.length,
    type: 'text' as const,
    content,
  }));
}

function splitByHeadings(text: string): string[] {
  // Split on top-level markdown headings (# Title)
  const parts = text.split(/(?=^# )/m).filter((s) => s.trim().length > 0);
  if (parts.length === 0) {
    return [text];
  }
  return parts;
}

function readImageFile(filePath: string): DocumentChunk[] {
  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  return [
    {
      pageNumber: 1,
      totalPages: 1,
      type: 'vision',
      content: base64,
      mimeType,
    },
  ];
}

async function readDocxFile(filePath: string): Promise<DocumentChunk[]> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToMarkdown({ path: filePath });
  const sections = splitByHeadings(result.value);

  return sections.map((content, i) => ({
    pageNumber: i + 1,
    totalPages: sections.length,
    type: 'text' as const,
    content,
  }));
}

async function readPdfFile(filePath: string): Promise<DocumentChunk[]> {
  const pdfjs = await import('pdfjs-dist');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data }).promise;
  const totalPages = doc.numPages;
  const chunks: DocumentChunk[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });

    // Use node-canvas or similar to render to image
    // For now, extract text content as fallback
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ');

    // If page has meaningful text, use text extraction
    // Vision-based rendering requires canvas setup — see implementation notes
    chunks.push({
      pageNumber: i,
      totalPages,
      type: 'text',
      content: text,
    });
  }

  return chunks;
}
```

> **Scope note — PDF vision rendering:** This plan implements PDF text extraction via `pdfjs-dist` as the initial path. Full vision-based rendering (page-to-image for Claude vision) requires the `canvas` npm package and platform-specific native dependencies. This is explicitly deferred to a separate follow-up plan because: (1) it requires platform testing on Windows, (2) text extraction handles the majority of text-heavy protocol PDFs, and (3) it can be added as a drop-in enhancement to `readPdfFile()` without changing any other code. When implemented, the function will render each page to a canvas, export as PNG base64, and set `type: 'vision'` on the chunk. The ingestion agent already handles vision chunks.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/ingestion/document-reader.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ingestion/document-reader.ts src/ingestion/document-reader.test.ts test-fixtures/
git commit -m "feat: add document reader with text/md/image/docx/pdf support"
```

---

## Chunk 3: Set-Based Protocol Loader Refactor

### Task 6: Migrate protocols to MATC folder

**Files:**
- Modify: `protocol_docs/` directory structure

- [ ] **Step 1: Create MATC directory and move protocols**

```bash
mkdir -p protocol_docs/MATC
```

Then move all `.md` files from `protocol_docs/` root to `protocol_docs/MATC/`:

```bash
cd protocol_docs && for f in *.md; do mv "$f" "MATC/$f"; done && cd ..
```

- [ ] **Step 2: Verify the move**

```bash
ls protocol_docs/MATC/ | wc -l
ls protocol_docs/*.md 2>/dev/null | wc -l
```

Expected: 68 files in MATC, 0 in root.

- [ ] **Step 3: Commit**

```bash
git add protocol_docs/
git commit -m "refactor: migrate existing protocols to protocol_docs/MATC/"
```

---

### Task 7: Update ProtocolEntry type and loader

**Files:**
- Modify: `src/types/schema.ts:194-199`
- Modify: `src/protocols/loader.ts`
- Modify: `src/protocols/loader.test.ts`

- [ ] **Step 1: Update ProtocolEntry to include set field**

In `src/types/schema.ts`, update the `ProtocolEntry` interface:

```typescript
export interface ProtocolEntry {
  slug: string;
  set: string;
  section: string;
  description: string;
  filePath: string;
}
```

- [ ] **Step 2: Update loader tests for set-based loading**

Replace `src/protocols/loader.test.ts`:

```typescript
import { loadProtocolIndex, readProtocol, discoverSets } from './loader';
import path from 'path';

const PROTOCOL_DIR = path.resolve(__dirname, '../../protocol_docs');

describe('discoverSets', () => {
  it('discovers the MATC set directory', () => {
    const sets = discoverSets(PROTOCOL_DIR);
    expect(sets).toContain('MATC');
  });

  it('ignores files in the root (only returns directories)', () => {
    const sets = discoverSets(PROTOCOL_DIR);
    for (const set of sets) {
      expect(set).not.toContain('.');
    }
  });
});

describe('loadProtocolIndex', () => {
  it('loads protocols from specified sets', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    expect(index.length).toBeGreaterThanOrEqual(60);
    for (const entry of index) {
      expect(entry.slug).toBeTruthy();
      expect(entry.set).toBe('MATC');
      expect(entry.section).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it('includes known protocol slugs', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    const slugs = index.map((e) => e.slug);
    expect(slugs).toContain('medical-hypoglycemia');
    expect(slugs).toContain('cv-stroke-tia');
    expect(slugs).toContain('trauma-extremity-hemorrhage');
  });
});

describe('readProtocol', () => {
  it('returns full file content for a valid slug', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    const content = readProtocol('medical-hypoglycemia', index);
    expect(content).toContain('Hypoglycemia');
  });

  it('returns null for an unknown slug', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    const content = readProtocol('nonexistent-protocol', index);
    expect(content).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/protocols/loader.test.ts --no-coverage
```

Expected: FAIL — `discoverSets` not found, `loadProtocolIndex` signature mismatch.

- [ ] **Step 4: Update the loader implementation**

Replace `src/protocols/loader.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { ProtocolEntry } from '../types/schema';

export function discoverSets(protocolDir: string): string[] {
  return fs.readdirSync(protocolDir).filter((entry) => {
    const fullPath = path.join(protocolDir, entry);
    return fs.statSync(fullPath).isDirectory() && !entry.startsWith('.');
  });
}

export function loadProtocolIndex(
  protocolDir: string,
  setNames: string[]
): ProtocolEntry[] {
  const entries: ProtocolEntry[] = [];

  for (const setName of setNames) {
    const setDir = path.join(protocolDir, setName);
    if (!fs.existsSync(setDir)) {
      console.warn(`Protocol set directory not found: ${setDir}`);
      continue;
    }

    const files = fs.readdirSync(setDir).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(setDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { data } = matter(raw);

        if (!data.slug || !data.section || !data.description) {
          console.warn(`Skipping ${file}: missing required frontmatter (slug, section, or description)`);
          continue;
        }

        entries.push({
          slug: data.slug,
          set: setName,
          section: data.section,
          description: data.description,
          filePath,
        });
      } catch (err) {
        console.warn(`Skipping ${file}: failed to parse frontmatter`);
      }
    }
  }

  return entries;
}

export function readProtocol(slug: string, index: ProtocolEntry[]): string | null {
  const entry = index.find((e) => e.slug === slug);
  if (!entry) return null;
  try {
    return fs.readFileSync(entry.filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function formatIndexForPrompt(index: ProtocolEntry[]): string {
  const header = '| Slug | Set | Section | Description |';
  const divider = '|---|---|---|---|';
  const rows = index.map(
    (e) => `| ${e.slug} | ${e.set} | ${e.section} | ${e.description} |`
  );
  return [header, divider, ...rows].join('\n');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/protocols/loader.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/schema.ts src/protocols/loader.ts src/protocols/loader.test.ts
git commit -m "refactor: update protocol loader for set-based directory structure"
```

---

### Task 8: Update index.ts and prompts for set-based loading

**Files:**
- Modify: `src/index.ts:13,73`
- Modify: `src/prompts/protocol-selector.ts`
- Modify: `src/prompts/scenario-generator.ts`

- [ ] **Step 1: Update index.ts to use set-based loading**

In `src/index.ts`, update the `PROTOCOL_DIR` usage and `main()` function. Replace the protocol loading section (lines 72-75):

Change:
```typescript
const PROTOCOL_DIR = path.resolve(__dirname, "../protocol_docs");
```
Keep this the same (it's the root dir).

Replace the protocol loading block in `main()`:
```typescript
  console.log("Loading protocol index...");
  const protocolIndex = loadProtocolIndex(PROTOCOL_DIR);
  console.log(`  ${protocolIndex.length} protocols found`);
  console.log("");
```

With:
```typescript
  console.log("Loading protocol index...");
  const { discoverSets } = await import("./protocols/loader");
  const allSets = discoverSets(PROTOCOL_DIR);
  if (allSets.length === 0) {
    console.error("No protocol sets found in protocol_docs/. Run 'ingest' first or move protocols into a subdirectory.");
    process.exit(1);
  }
  // For now, select all sets. Interactive selection will be added in Task 10.
  const protocolIndex = loadProtocolIndex(PROTOCOL_DIR, allSets);
  console.log(`  ${protocolIndex.length} protocols found across ${allSets.length} set(s): ${allSets.join(", ")}`);
  console.log("");
```

Also add the `discoverSets` import at the top:
```typescript
import { loadProtocolIndex, readProtocol, discoverSets } from "./protocols/loader";
```

- [ ] **Step 2: Update protocol selector prompt to include set column**

The `formatIndexForPrompt` function was already updated in Task 7 to include the Set column. No changes needed to `src/prompts/protocol-selector.ts` — it calls `formatIndexForPrompt` which now includes the set.

- [ ] **Step 3: Add priority conflict resolution to scenario generator prompt**

In `src/prompts/scenario-generator.ts`, add this section before the `## Generation Guidelines` section (before line 159):

```typescript
## Protocol Set Priority

When protocols from multiple sets are provided, they are listed in priority order (highest priority first). If you encounter conflicting clinical guidance (dosages, thresholds, procedures) across protocols from different sets, follow the guidance from the higher-priority set. In the protocolReference field of each expectedAction, include the set name, e.g., "MATC: medical-anaphylaxis".

```

- [ ] **Step 4: Run all existing tests to verify nothing is broken**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/prompts/scenario-generator.ts
git commit -m "refactor: update CLI and prompts for set-based protocol loading"
```

---

## Chunk 4: Ingestion Agent & System Prompt

### Task 9: Ingestion agent system prompt

**Files:**
- Create: `src/prompts/protocol-ingester.ts`

- [ ] **Step 1: Create the ingestion system prompt**

Create `src/prompts/protocol-ingester.ts`:

```typescript
import { CompletedProtocol } from '../ingestion/types';

export function buildIngestionPrompt(
  completedIndex: CompletedProtocol[]
): string {
  const indexSummary = completedIndex.length > 0
    ? completedIndex.map((p) => `- ${p.slug}: ${p.description}`).join('\n')
    : '(none yet)';

  return `You are a protocol extraction engine for an EMS training scenario generator.

Your job: Given a page or chunk from a protocol source document, extract clinically actionable protocol content and classify the page.

## Your Task Per Page

For each page/chunk you receive, respond with a JSON object (no markdown, no code fences):

{
  "classification": "protocol_content" | "non_protocol",
  "skipReason": "string (only if non_protocol)",
  "isNewProtocol": true | false,
  "protocolName": "string (if new protocol detected)",
  "protocolSlug": "string (URL-safe slug, e.g., cardiac-arrest-adult)",
  "extractedContent": "string (the extracted clinical content)",
  "hasFlowchart": true | false,
  "detectedRefs": ["array of slug strings or UNRESOLVED:best-guess-slug"]
}

## Classification Rules

**protocol_content** — Pages containing clinically actionable protocols: treatment algorithms, standing orders, medication administration guides, decision-making procedures, assessment criteria, inclusion/exclusion criteria.

**non_protocol** — Cover pages, tables of contents, acknowledgments, administrative policy sections, revision histories, organizational preambles, blank pages, index pages. Set skipReason to a brief description (e.g., "cover page", "table of contents").

## Protocol Boundary Detection

- Set isNewProtocol=true when you detect the start of a new, distinct protocol (new title, new clinical topic).
- Set isNewProtocol=false when the current page continues the protocol already in progress.
- When isNewProtocol=true, you MUST provide protocolName and protocolSlug for the new protocol.

## Content Extraction Rules

1. Preserve dosages, timeframes, thresholds, and clinical criteria EXACTLY as stated. Never round, approximate, or paraphrase medication dosing.
2. Convert flowcharts and visual decision algorithms to conditional prose using If/Then/Else structures. Set hasFlowchart=true when you do this.
3. Preserve the clinical logic of every decision path — every branch, every condition, every action.
4. Use clear section structure: Patient Care Goals, Inclusion Criteria, Exclusion Criteria, Assessment, Treatment, Disposition (as applicable).
5. For cross-references ("see cardiac arrest protocol", "follow standing order for pain management"), check the completed index below. If a matching slug exists, add it to detectedRefs as the slug. If not, add it as "UNRESOLVED:best-guess-slug".

## Completed Protocols So Far

${indexSummary}

## Critical Rules

- Return ONLY the JSON object. No explanation, no markdown fences.
- extractedContent should contain the protocol text in clean prose, not raw OCR artifacts.
- If a page contains both protocol content and non-protocol content (e.g., a protocol starts halfway down), extract only the protocol portion and classify as protocol_content.
- When in doubt about whether content is a new protocol vs. continuation, prefer continuation (isNewProtocol=false).`;
}

export function buildIngestionUserMessage(
  chunk: { type: 'vision' | 'text'; content: string; mimeType?: string },
  currentProtocol: { name: string; slug: string; accumulatedContent: string } | null
): Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> {
  const parts: Array<any> = [];

  if (currentProtocol) {
    parts.push({
      type: 'text',
      text: `Currently extracting protocol: "${currentProtocol.name}" (slug: ${currentProtocol.slug})\n\nAccumulated content so far (last 500 chars):\n...${currentProtocol.accumulatedContent.slice(-500)}`,
    });
  } else {
    parts.push({
      type: 'text',
      text: 'No protocol currently in progress. This may be the start of a new protocol or non-protocol content.',
    });
  }

  if (chunk.type === 'vision') {
    parts.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: chunk.mimeType || 'image/png',
        data: chunk.content,
      },
    });
    parts.push({
      type: 'text',
      text: 'Extract the clinical protocol content from this page image. Respond with the JSON object only.',
    });
  } else {
    parts.push({
      type: 'text',
      text: `Page content:\n\n${chunk.content}\n\nExtract the clinical protocol content from this page. Respond with the JSON object only.`,
    });
  }

  return parts;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/prompts/protocol-ingester.ts
git commit -m "feat: add system prompt for protocol ingestion agent"
```

---

### Task 10: Ingestion agent orchestrator

**Files:**
- Create: `src/agents/protocol-ingester.ts`
- Create: `src/agents/protocol-ingester.test.ts`
- Create: `test-fixtures/ingestion/single-protocol.txt`

- [ ] **Step 1: Create a test fixture**

Create `test-fixtures/ingestion/single-protocol.txt`:

```
# Anaphylaxis Protocol

## Patient Care Goals

Rapidly identify and treat anaphylaxis to prevent cardiovascular collapse and death.

## Inclusion Criteria

Patients presenting with signs and symptoms of anaphylaxis: urticaria, angioedema, bronchospasm, hypotension, or GI symptoms following exposure to a known or suspected allergen.

## Treatment

Administer Epinephrine 1:1,000 (1 mg/mL) 0.3 mg IM in the lateral thigh. May repeat every 5-15 minutes if symptoms persist. Max 3 doses.

If hypotension persists after epinephrine:
    Establish IV access.
    Administer Normal Saline 1L IV bolus. May repeat as needed.

If bronchospasm present:
    Administer Albuterol 2.5 mg via nebulizer. May repeat every 5 minutes.

## Disposition

Transport to nearest appropriate facility. Monitor for biphasic reaction.
```

- [ ] **Step 2: Create the ingestion orchestrator**

Create `src/agents/protocol-ingester.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { DocumentChunk, IngestionState, IngestionResult, CompletedProtocol } from '../ingestion/types';
import { buildIngestionPrompt, buildIngestionUserMessage } from '../prompts/protocol-ingester';
import { saveState } from '../ingestion/state';
import path from 'path';

interface IngestionProgressCallback {
  onPageStart: (page: number, total: number) => void;
  onPageClassified: (page: number, classification: string, skipReason?: string) => void;
  onProtocolFinalized: (name: string, slug: string) => void;
  onError: (page: number, error: string) => void;
}

export async function runIngestion(
  chunks: DocumentChunk[],
  state: IngestionState,
  protocolDir: string,
  apiKey: string,
  progress: IngestionProgressCallback
): Promise<IngestionState> {
  const client = new Anthropic({ apiKey });
  const setDir = path.join(protocolDir, state.setSlug);

  for (let i = state.currentPage - 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    progress.onPageStart(chunk.pageNumber, chunk.totalPages);

    const systemPrompt = buildIngestionPrompt(state.completedIndex);
    const userContent = buildIngestionUserMessage(
      chunk,
      state.currentProtocol
    );

    let result: IngestionResult;
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
      });

      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in response');
      }

      let jsonText = (textBlock as Anthropic.TextBlock).text.trim();
      const fenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) {
        jsonText = fenceMatch[1].trim();
      }

      result = JSON.parse(jsonText) as IngestionResult;
    } catch (err: any) {
      progress.onError(chunk.pageNumber, err.message);
      state.skippedPages.push({ page: chunk.pageNumber, reason: `error: ${err.message}` });
      state.currentPage = chunk.pageNumber + 1;
      saveState(setDir, state);
      continue;
    }

    if (result.classification === 'non_protocol') {
      progress.onPageClassified(chunk.pageNumber, 'non_protocol', result.skipReason);
      state.skippedPages.push({
        page: chunk.pageNumber,
        reason: result.skipReason || 'non-protocol content',
      });
      state.currentPage = chunk.pageNumber + 1;
      saveState(setDir, state);
      continue;
    }

    progress.onPageClassified(chunk.pageNumber, 'protocol_content');

    // If new protocol detected, finalize the current one first
    if (result.isNewProtocol && state.currentProtocol) {
      const completed = finalizeProtocol(state.currentProtocol, chunk.pageNumber - 1);
      state.completedIndex.push(completed);
      progress.onProtocolFinalized(completed.name, completed.slug);
      state.currentProtocol = null;
    }

    // Start new protocol if needed
    if (result.isNewProtocol || !state.currentProtocol) {
      state.currentProtocol = {
        name: result.protocolName || 'Unknown Protocol',
        slug: result.protocolSlug || `protocol-${chunk.pageNumber}`,
        startPage: chunk.pageNumber,
        accumulatedContent: '',
        hasFlowchart: false,
        unresolvedRefs: [],
      };
    }

    // Append extracted content
    state.currentProtocol.accumulatedContent += '\n\n' + result.extractedContent;
    state.currentProtocol.accumulatedContent = state.currentProtocol.accumulatedContent.trim();

    if (result.hasFlowchart) {
      state.currentProtocol.hasFlowchart = true;
    }

    for (const ref of result.detectedRefs) {
      if (ref.startsWith('UNRESOLVED:') && !state.currentProtocol.unresolvedRefs.includes(ref)) {
        state.currentProtocol.unresolvedRefs.push(ref);
      }
    }

    state.currentPage = chunk.pageNumber + 1;
    saveState(setDir, state);
  }

  // Finalize last protocol if one is in progress
  if (state.currentProtocol) {
    const completed = finalizeProtocol(state.currentProtocol, chunks.length);
    state.completedIndex.push(completed);
    progress.onProtocolFinalized(completed.name, completed.slug);
    state.currentProtocol = null;
  }

  state.status = 'needs_reconciliation';
  saveState(setDir, state);
  return state;
}

function finalizeProtocol(
  current: NonNullable<IngestionState['currentProtocol']>,
  endPage: number
): CompletedProtocol {
  // Generate a one-line description from the first meaningful sentence
  const firstSentence = current.accumulatedContent
    .split(/[.\n]/)
    .map((s) => s.trim())
    .find((s) => s.length > 20) || current.name;

  // unresolvedRefs contains "UNRESOLVED:slug" strings — strip prefix for crossRefs
  const crossRefs = current.unresolvedRefs.map((r) =>
    r.startsWith('UNRESOLVED:') ? r.replace('UNRESOLVED:', '') : r
  );

  return {
    slug: current.slug,
    name: current.name,
    description: firstSentence.substring(0, 200),
    pageRange: current.startPage === endPage
      ? `${current.startPage}`
      : `${current.startPage}-${endPage}`,
    hasFlowchart: current.hasFlowchart,
    crossRefs,
    content: current.accumulatedContent,
  };
}
```

- [ ] **Step 3: Write integration test**

Create `src/agents/protocol-ingester.test.ts`. This test mocks the Anthropic API to avoid real API calls:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runIngestion } from './protocol-ingester';
import { DocumentChunk, IngestionState } from '../ingestion/types';
import { initState } from '../ingestion/state';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
        .mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: JSON.stringify({
              classification: 'protocol_content',
              isNewProtocol: true,
              protocolName: 'Test Protocol',
              protocolSlug: 'test-protocol',
              extractedContent: 'Assess the patient. Administer treatment.',
              hasFlowchart: false,
              detectedRefs: [],
            }),
          }],
        }),
    },
  }));
});

describe('protocol-ingester integration', () => {
  let tmpDir: string;
  let protocolDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingester-test-'));
    protocolDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('processes a single text chunk and produces a completed protocol', async () => {
    const chunks: DocumentChunk[] = [
      { pageNumber: 1, totalPages: 1, type: 'text', content: 'Test protocol content' },
    ];

    const state = initState({
      sourceFile: '/fake/file.txt',
      sourceFileSize: 100,
      sourceFileModified: 1700000000000,
      sourceFormat: 'txt',
      setName: 'Test',
      setSlug: 'test',
      totalPages: 1,
    });

    const result = await runIngestion(chunks, state, protocolDir, 'fake-key', {
      onPageStart: jest.fn(),
      onPageClassified: jest.fn(),
      onProtocolFinalized: jest.fn(),
      onError: jest.fn(),
    });

    expect(result.completedIndex.length).toBe(1);
    expect(result.completedIndex[0].slug).toBe('test-protocol');
    expect(result.completedIndex[0].name).toBe('Test Protocol');
    expect(result.status).toBe('needs_reconciliation');
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/agents/protocol-ingester.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agents/protocol-ingester.ts src/agents/protocol-ingester.test.ts test-fixtures/ingestion/single-protocol.txt
git commit -m "feat: add protocol ingestion agent orchestrator with integration test"
```

---

## Chunk 5: CLI Integration

### Task 11: Interactive set selector

**Files:**
- Create: `src/cli/set-selector.ts`

- [ ] **Step 1: Create the set selector UI**

Create `src/cli/set-selector.ts`:

```typescript
import { checkbox } from '@inquirer/prompts';
import * as readline from 'readline';

interface ProtocolSet {
  name: string;
  protocolCount: number;
}

export interface SetSelection {
  selectedSets: string[];
  priorityOrder: string[];
}

export async function selectProtocolSets(
  sets: ProtocolSet[]
): Promise<SetSelection> {
  if (sets.length === 0) {
    throw new Error('No protocol sets available.');
  }

  if (sets.length === 1) {
    console.log(`  Using protocol set: ${sets[0].name} (${sets[0].protocolCount} protocols)`);
    return {
      selectedSets: [sets[0].name],
      priorityOrder: [sets[0].name],
    };
  }

  const selected = await checkbox({
    message: 'Select protocol sets for this scenario:',
    choices: sets.map((s) => ({
      name: `${s.name} (${s.protocolCount} protocols)`,
      value: s.name,
      checked: true,
    })),
  });

  if (selected.length === 0) {
    throw new Error('At least one protocol set must be selected.');
  }

  if (selected.length === 1) {
    return {
      selectedSets: selected,
      priorityOrder: selected,
    };
  }

  // Priority ordering
  console.log('\n  Assign priority order (highest priority first):');
  console.log('  Current order:');
  selected.forEach((name, i) => console.log(`    ${i + 1}. ${name}`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const reorder = await new Promise<string>((resolve) => {
    rl.question('  Enter new order (e.g., "2,1,3") or press Enter to keep: ', resolve);
  });
  rl.close();

  let priorityOrder = selected;
  if (reorder.trim()) {
    const indices = reorder.split(',').map((s) => parseInt(s.trim()) - 1);
    if (indices.length === selected.length && indices.every((i) => i >= 0 && i < selected.length)) {
      priorityOrder = indices.map((i) => selected[i]);
    } else {
      console.log('  Invalid order, keeping original.');
    }
  }

  console.log('  Priority order:');
  priorityOrder.forEach((name, i) => console.log(`    ${i + 1}. ${name}`));

  return {
    selectedSets: selected,
    priorityOrder,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/set-selector.ts
git commit -m "feat: add interactive protocol set selector with priority ordering"
```

---

### Task 12: Wire up the full CLI

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite index.ts with ingest and generate commands**

Replace `src/index.ts` with the full updated version that includes both `ingest` and `generate` commands. Key changes:

- Parse `process.argv` for `ingest` vs `generate` subcommands
- `generate` command: discover sets → interactive selection → load index → existing flow
- `ingest` command: parse `--name` flag → check state → read document → run ingestion → confirm → write → reconcile

```typescript
// src/index.ts
import 'dotenv/config';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { loadProtocolIndex, readProtocol, discoverSets } from './protocols/loader';
import { selectProtocols } from './agents/protocol-selector';
import { generateScenario } from './agents/scenario-generator';
import { exportRealiti } from './export/realiti';
import { exportHtml } from './export/html';
import { ValidationResult } from './types/schema';
import { selectProtocolSets } from './cli/set-selector';

const PROTOCOL_DIR = path.resolve(__dirname, '../protocol_docs');
const OUTPUT_DIR = path.resolve(__dirname, '../output');

function printHeader() {
  console.log('');
  console.log('╭──────────────────────────────────────╮');
  console.log('│  Paramedic Scenario Generator        │');
  console.log('╰──────────────────────────────────────╯');
  console.log('');
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
      `  ✓ Valid (${result.warnings.length} warning${result.warnings.length !== 1 ? 's' : ''}, 0 errors)`
    );
  } else {
    console.log(
      `  ✗ Invalid (${result.warnings.length} warning${result.warnings.length !== 1 ? 's' : ''}, ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''})`
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── INGEST COMMAND ──

async function runIngestCommand(args: string[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  // Parse --name flag
  let setName: string | undefined;
  let filePath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      setName = args[++i];
    } else if (!args[i].startsWith('--')) {
      filePath = args[i];
    }
  }

  if (!filePath) {
    console.error('Usage: ts-node src/index.ts ingest [--name "Set Name"] <file-path>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  if (!setName) {
    setName = await promptUser('Enter a name for this protocol set:\n> ');
    if (!setName) {
      console.error('A protocol set name is required.');
      process.exit(1);
    }
  }

  const setSlug = slugify(setName);
  const setDir = path.join(PROTOCOL_DIR, setSlug);

  console.log(`\nIngesting: ${resolvedPath}`);
  console.log(`Protocol set: "${setName}" (${setSlug})`);
  console.log('');

  // Check for existing state
  const { loadState, initState, saveState, checkResumability } = await import('./ingestion/state');
  const existingState = loadState(setDir);

  const fileStat = fs.statSync(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase().replace('.', '');

  let state;
  if (existingState) {
    const resumability = checkResumability(existingState, fileStat.size, fileStat.mtimeMs);
    if (resumability === 'completed') {
      const answer = await promptUser('This document has already been processed. Re-run? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Exiting.');
        return;
      }
      // Start fresh
      state = undefined;
    } else if (resumability === 'mismatch') {
      const answer = await promptUser('Source file has changed since last run. Restart? (Y/n): ');
      if (answer.toLowerCase() === 'n') {
        console.log('Exiting.');
        return;
      }
      state = undefined;
    } else {
      console.log(`Resuming from page ${existingState.currentPage}...`);
      state = existingState;
    }
  }

  // Read document
  const { readDocument } = await import('./ingestion/document-reader');
  console.log('Reading document...');
  const chunks = await readDocument(resolvedPath);
  console.log(`  ${chunks.length} page(s) detected\n`);

  if (!state) {
    state = initState({
      sourceFile: resolvedPath,
      sourceFileSize: fileStat.size,
      sourceFileModified: fileStat.mtimeMs,
      sourceFormat: ext,
      setName,
      setSlug,
      totalPages: chunks.length,
    });
  }

  // Run ingestion
  const { runIngestion } = await import('./agents/protocol-ingester');
  console.log('─── Ingesting Protocols ───');
  state = await runIngestion(chunks, state, PROTOCOL_DIR, apiKey, {
    onPageStart: (page, total) => process.stdout.write(`  Page ${page}/${total}... `),
    onPageClassified: (page, cls, reason) => {
      if (cls === 'non_protocol') {
        console.log(`skipped (${reason})`);
      } else {
        console.log('protocol content');
      }
    },
    onProtocolFinalized: (name, slug) => console.log(`  ✓ Finalized: ${name} (${slug})`),
    onError: (page, error) => console.log(`  ✗ Error on page ${page}: ${error}`),
  });
  console.log('');

  // Summary
  if (state.completedIndex.length === 0) {
    console.log('No protocols were extracted from this document.');
    return;
  }

  console.log(`Extracted ${state.completedIndex.length} protocol(s) from ${path.basename(resolvedPath)}`);
  console.log(`into set "${setName}":`);
  for (const p of state.completedIndex) {
    console.log(`  - ${p.slug} (pp. ${p.pageRange}, ${p.crossRefs.length} cross-ref${p.crossRefs.length !== 1 ? 's' : ''})`);
  }
  console.log(`  Skipped ${state.skippedPages.length} page(s)`);

  const totalUnresolved = state.completedIndex.reduce(
    (sum, p) => sum + p.crossRefs.filter((r) => r.startsWith('UNRESOLVED:')).length,
    0
  );
  if (totalUnresolved > 0) {
    console.log(`  ${totalUnresolved} unresolved reference(s) (will attempt resolution)`);
  }
  console.log('');

  // Confirmation
  const confirm = await promptUser(`Write to protocol_docs/${setSlug}/? (Y/n): `);
  if (confirm.toLowerCase() === 'n') {
    console.log('Cancelled. State file preserved for future resume.');
    return;
  }

  // Write protocol files
  const { writeProtocolFile } = await import('./ingestion/protocol-writer');
  for (const protocol of state.completedIndex) {
    const filePath = writeProtocolFile(setDir, protocol, setName, ext);
    console.log(`  ✓ ${path.relative(process.cwd(), filePath)}`);
  }

  // Reconciliation
  const { reconcileReferences } = await import('./ingestion/reconciler');
  const allSlugs = new Set<string>();

  // Gather slugs from all existing sets
  const existingSets = discoverSets(PROTOCOL_DIR);
  for (const s of existingSets) {
    const idx = loadProtocolIndex(PROTOCOL_DIR, [s]);
    for (const entry of idx) {
      allSlugs.add(entry.slug);
    }
  }
  // Add newly ingested slugs
  for (const p of state.completedIndex) {
    allSlugs.add(p.slug);
  }

  const report = reconcileReferences(setDir, allSlugs);
  if (report.resolved > 0 || report.unresolved > 0) {
    console.log(`\n  Cross-references: ${report.resolved} resolved, ${report.unresolved} unresolved`);
    for (const detail of report.unresolvedDetails) {
      console.log(`    ⚠ ${detail.file}: [[UNRESOLVED:${detail.slug}]]`);
    }
  }

  state.status = 'completed';
  saveState(setDir, state);
  console.log('\nDone!');
}

// ── GENERATE COMMAND ──

async function runGenerateCommand(scenarioInput?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const userInput = scenarioInput || await promptUser('Describe your scenario:\n> ');
  if (!userInput) {
    console.error('No scenario description provided.');
    process.exit(1);
  }

  console.log('');

  // Discover and select protocol sets
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

  const { priorityOrder } = await selectProtocolSets(setInfo);
  console.log('');

  console.log('Loading protocol index...');
  const protocolIndex = loadProtocolIndex(PROTOCOL_DIR, priorityOrder);
  console.log(`  ${protocolIndex.length} protocols found across ${priorityOrder.length} set(s)`);
  console.log('');

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

// ── MAIN ──

async function main() {
  printHeader();

  const command = process.argv[2];

  if (command === 'ingest') {
    await runIngestCommand(process.argv.slice(3));
  } else if (command === 'generate') {
    await runGenerateCommand(process.argv.slice(3).join(' ') || undefined);
  } else {
    // Default: generate (backwards-compatible)
    await runGenerateCommand();
  }
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run all tests to verify nothing is broken**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts src/cli/set-selector.ts
git commit -m "feat: add ingest command and set-based generate flow to CLI"
```

---

## Chunk 6: End-to-End Verification

### Task 13: Smoke test the full flow

- [ ] **Step 1: Run all unit tests**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 2: Verify protocol migration**

```bash
ls protocol_docs/MATC/ | head -5
```

Expected: Protocol `.md` files are in the MATC directory.

- [ ] **Step 3: Test ingest command with the test fixture**

```bash
ts-node src/index.ts ingest --name "Test Protocols" test-fixtures/ingestion/single-protocol.txt
```

Expected: The ingestion engine processes the file, extracts the anaphylaxis protocol, shows the summary, prompts for confirmation, and writes to `protocol_docs/test-protocols/`.

- [ ] **Step 4: Verify the generated protocol file**

```bash
cat protocol_docs/test-protocols/anaphylaxis*.md
```

Expected: Valid `.md` file with YAML frontmatter including `ingested: true` and the protocol body.

- [ ] **Step 5: Clean up test output**

```bash
rm -rf protocol_docs/test-protocols/
```

- [ ] **Step 6: Commit any final fixes**

Stage only the specific files that were fixed, then commit:

```bash
git commit -m "fix: address issues found during smoke testing"
```

Only commit this step if fixes were needed. Skip if everything passed cleanly.
