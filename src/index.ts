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
import { ValidationResult, ProtocolEntry } from './types/schema';
import { selectProtocolSets } from './cli/set-selector';
import { select, input, confirm as confirmPrompt } from '@inquirer/prompts';
import { buildScenarioIndex } from './batch/scenario-index';
import { generateBatchPlan } from './agents/batch-planner';
import { executeBatch } from './batch/orchestrator';

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

// ── GENERATE COMMAND ──

async function runBatchFlow(apiKey: string, priorityOrder: string[], protocolIndex: ProtocolEntry[]) {
  // Step 1: Batch size
  const sizeStr = await input({ message: 'How many scenarios would you like to generate?' });
  const batchSize = parseInt(sizeStr, 10);
  if (isNaN(batchSize) || batchSize < 1) {
    console.error('Invalid number.');
    process.exit(1);
  }

  if (batchSize > 15) {
    const proceed = await confirmPrompt({
      message: `Generating ${batchSize} scenarios will consume significant API tokens. Continue?`,
      default: false,
    });
    if (!proceed) {
      console.log('Cancelled.');
      return;
    }
  }

  // Step 2: Optional constraints
  const constraints = await input({
    message: 'Any specific constraints? (e.g., BLS-only, focus on cardiac, intermediate difficulty)\n  Press Enter to skip:',
  });

  // Step 3: Build scenario index
  console.log('\nIndexing existing scenarios...');
  const scenarioIndex = buildScenarioIndex(OUTPUT_DIR);
  console.log(`  ${scenarioIndex.length} existing scenario(s) found`);
  console.log('');

  // Step 4: Generate batch plan
  console.log('─── Batch Planning ───');
  console.log('  Building batch plan...');
  let plan = await generateBatchPlan(protocolIndex, scenarioIndex, batchSize, constraints, apiKey);

  // Step 5: Display plan and get approval
  let approved = false;
  while (!approved) {
    console.log(`\nBatch Plan (${plan.length} scenarios):\n`);
    plan.forEach((entry, i) => {
      console.log(`  ${i + 1}. ${entry.title} (${entry.difficulty})`);
      console.log(`     Protocols: ${entry.targetProtocols.join(', ')}`);
      console.log(`     ${entry.description}`);
      console.log(`     Objectives: ${entry.learningObjectives.join(', ')}`);
      console.log('');
    });

    const action = await select({
      message: 'Approve this plan?',
      choices: [
        { name: 'Approve — start generating', value: 'approve' },
        { name: 'Revise — provide feedback', value: 'revise' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'approve') {
      approved = true;
    } else if (action === 'cancel') {
      console.log('Cancelled.');
      return;
    } else {
      const feedback = await input({ message: 'What would you like to change?' });
      console.log('\n  Regenerating plan...');
      plan = await generateBatchPlan(
        protocolIndex,
        scenarioIndex,
        batchSize,
        constraints ? `${constraints}\n\nRevision feedback: ${feedback}` : feedback,
        apiKey
      );
    }
  }

  // Step 6: Execute batch
  console.log('');
  console.log('─── Batch Generation ───');
  const result = await executeBatch(plan, protocolIndex, apiKey, OUTPUT_DIR, {
    onScenarioStart: (i, total, title) =>
      process.stdout.write(`  Generating scenario ${i}/${total}: ${title}... `),
    onScenarioSuccess: (i, scenarioId) =>
      console.log(`✓ (${scenarioId})`),
    onScenarioFailure: (i, title, error) =>
      console.log(`✗ (${error})`),
  });

  // Step 7: Summary
  console.log('');
  console.log(`Batch complete: ${result.succeeded.length}/${plan.length} scenarios generated successfully.`);
  if (result.failed.length > 0) {
    console.log('Failed:');
    result.failed.forEach((f) => console.log(`  - ${f.planEntry.title}: ${f.error}`));
  }
}

async function runGenerateCommand(scenarioInput?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  // Discover and select protocol sets (shared by both flows)
  const allSets = discoverSets(PROTOCOL_DIR);
  if (allSets.length === 0) {
    console.error('No protocol sets found in protocol_docs/. Create a subdirectory with protocol markdown files, or use the protocol_loader project to ingest a protocol document.');
    process.exit(1);
  }

  const setInfo = allSets.map((name) => {
    const setDir = path.join(PROTOCOL_DIR, name);
    const count = fs.readdirSync(setDir).filter((f) => f.endsWith('.md')).length;
    return { name, protocolCount: count };
  });

  // Mode selection (skip if scenario input provided via CLI arg — that's single mode)
  let mode: 'single' | 'batch' = 'single';
  if (!scenarioInput) {
    mode = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Generate a single scenario', value: 'single' as const },
        { name: 'Generate a batch of scenarios', value: 'batch' as const },
      ],
    });
  }

  const { priorityOrder } = await selectProtocolSets(setInfo);
  console.log('');

  console.log('Loading protocol index...');
  const protocolIndex = loadProtocolIndex(PROTOCOL_DIR, priorityOrder);
  console.log(`  ${protocolIndex.length} protocols found across ${priorityOrder.length} set(s)`);
  console.log('');

  if (mode === 'batch') {
    await runBatchFlow(apiKey, priorityOrder, protocolIndex);
    return;
  }

  // Single scenario flow (existing logic)
  const userInput = scenarioInput || await promptUser('Describe your scenario:\n> ');
  if (!userInput) {
    console.error('No scenario description provided.');
    process.exit(1);
  }

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

  if (command === 'generate') {
    await runGenerateCommand(process.argv.slice(3).join(' ') || undefined);
  } else {
    await runGenerateCommand();
  }
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
