// src/index.ts
import "dotenv/config";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { loadProtocolIndex, readProtocol } from "./protocols/loader";
import { selectProtocols } from "./agents/protocol-selector";
import { generateScenario } from "./agents/scenario-generator";
import { exportRealiti } from "./export/realiti";
import { exportHtml } from "./export/html";
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const userInput = await promptUser("Describe your scenario:\n> ");
  if (!userInput) {
    console.error("No scenario description provided.");
    process.exit(1);
  }

  console.log("");

  console.log("Loading protocol index...");
  const protocolIndex = loadProtocolIndex(PROTOCOL_DIR);
  console.log(`  ${protocolIndex.length} protocols found`);
  console.log("");

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

  const protocolsWithContent = selections.map((s) => ({
    slug: s.slug,
    rationale: s.rationale,
    content: readProtocol(s.slug, protocolIndex) ?? `Protocol not found: ${s.slug}`,
  }));

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

  console.log("─── Export ───");
  const safeId = scenario.meta.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const outputDir = path.join(OUTPUT_DIR, safeId);
  fs.mkdirSync(outputDir, { recursive: true });

  const unifiedPath = path.join(outputDir, "unified.json");
  fs.writeFileSync(unifiedPath, JSON.stringify(scenario, null, 2));
  console.log(`  ✓ ${path.relative(process.cwd(), unifiedPath)}`);

  const realitiJson = exportRealiti(scenario);
  const realitiPath = path.join(outputDir, "realiti.json");
  fs.writeFileSync(realitiPath, JSON.stringify(realitiJson, null, 2));
  console.log(`  ✓ ${path.relative(process.cwd(), realitiPath)}`);

  const htmlPath = path.join(outputDir, "scenario.html");
  fs.writeFileSync(htmlPath, exportHtml(scenario));
  console.log(`  ✓ ${path.relative(process.cwd(), htmlPath)}`);

  console.log("");
  console.log(`Done! Generated "${scenario.meta.name}"`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
