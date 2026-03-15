import fs from 'fs';
import path from 'path';
import { BatchPlanEntry } from '../agents/batch-planner';
import { generateScenario } from '../agents/scenario-generator';
import { exportRealiti } from '../export/realiti';
import { exportHtml } from '../export/html';
import { readProtocol } from '../protocols/loader';
import { ProtocolEntry } from '../types/schema';

export interface GeneratedSummary {
  title: string;
  difficulty: string;
  patientAge: number;
  patientSex: string;
  location: string;
  protocols: string[];
  objectives: string[];
}

export interface BatchResultEntry {
  planEntry: BatchPlanEntry;
  scenarioId: string;
  outputPath: string;
}

export interface BatchFailureEntry {
  planEntry: BatchPlanEntry;
  error: string;
}

export interface BatchResult {
  succeeded: BatchResultEntry[];
  failed: BatchFailureEntry[];
}

export function buildForwardContext(summaries: GeneratedSummary[]): string {
  if (summaries.length === 0) return '';

  const lines = summaries.map((s) => {
    const sex = s.patientSex === 'male' ? 'M' : 'F';
    return `- "${s.title}" (${s.difficulty}) — ${s.patientAge}${sex}, ${s.location}, protocols: ${s.protocols.join(', ')}. Objectives: ${s.objectives.join(', ')}`;
  });

  return `Previously generated in this batch (differentiate your scenario — vary demographics, scene, presentation):\n${lines.join('\n')}`;
}

export function buildScenarioDescription(
  planEntry: BatchPlanEntry,
  forwardContext: string
): string {
  let description = `Title: ${planEntry.title}
Description: ${planEntry.description}
Difficulty: ${planEntry.difficulty}
Learning Objectives: ${planEntry.learningObjectives.join(', ')}`;

  if (forwardContext) {
    description += `\n\n${forwardContext}`;
  }

  return description;
}

export async function executeBatch(
  plan: BatchPlanEntry[],
  protocolIndex: ProtocolEntry[],
  apiKey: string,
  outputDir: string,
  progress: {
    onScenarioStart: (index: number, total: number, title: string) => void;
    onScenarioSuccess: (index: number, scenarioId: string) => void;
    onScenarioFailure: (index: number, title: string, error: string) => void;
  }
): Promise<BatchResult> {
  const succeeded: BatchResultEntry[] = [];
  const failed: BatchFailureEntry[] = [];
  const summaries: GeneratedSummary[] = [];

  for (let i = 0; i < plan.length; i++) {
    const entry = plan[i];
    progress.onScenarioStart(i + 1, plan.length, entry.title);

    try {
      const forwardContext = buildForwardContext(summaries);
      const description = buildScenarioDescription(entry, forwardContext);

      const protocolsWithContent = entry.targetProtocols.map((slug) => ({
        slug,
        rationale: `Selected for batch scenario: ${entry.title}`,
        content: readProtocol(slug, protocolIndex) ?? `Protocol not found: ${slug}`,
      }));

      const { scenario } = await generateScenario(
        description,
        protocolsWithContent,
        apiKey,
        {
          onGenerating: () => {},
          onValidating: () => {},
          onValidationResult: () => {},
          onRetrying: () => {},
        }
      );

      const safeId = scenario.meta.id.replace(/[^a-zA-Z0-9_-]/g, '-');
      const scenarioDir = path.join(outputDir, safeId);
      fs.mkdirSync(scenarioDir, { recursive: true });

      fs.writeFileSync(
        path.join(scenarioDir, 'unified.json'),
        JSON.stringify(scenario, null, 2)
      );
      fs.writeFileSync(
        path.join(scenarioDir, 'realiti.json'),
        JSON.stringify(exportRealiti(scenario), null, 2)
      );
      fs.writeFileSync(
        path.join(scenarioDir, 'scenario.html'),
        exportHtml(scenario)
      );

      succeeded.push({
        planEntry: entry,
        scenarioId: scenario.meta.id,
        outputPath: scenarioDir,
      });

      summaries.push({
        title: scenario.meta.name,
        difficulty: scenario.meta.difficulty,
        patientAge: scenario.patient.age,
        patientSex: scenario.patient.sex,
        location: scenario.scene?.location ?? 'unknown',
        protocols: scenario.meta.protocols,
        objectives: scenario.debriefing?.learningObjectives ?? [],
      });

      progress.onScenarioSuccess(i + 1, scenario.meta.id);
    } catch (err: any) {
      failed.push({
        planEntry: entry,
        error: err.message ?? String(err),
      });
      progress.onScenarioFailure(i + 1, entry.title, err.message ?? String(err));
    }
  }

  return { succeeded, failed };
}
