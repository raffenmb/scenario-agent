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
    const writtenPath = writeProtocolFile(setDir, protocol, setName, ext);
    console.log(`  ✓ ${path.relative(process.cwd(), writtenPath)}`);
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
