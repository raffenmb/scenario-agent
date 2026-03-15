import fs from 'fs';
import path from 'path';

export interface ScenarioIndexEntry {
  id: string;
  name: string;
  difficulty: string;
  category: string;
  tags: string[];
  protocols: string[];
  learningObjectives: string[];
  patientAge: number;
  patientSex: string;
  phaseCount: number;
  hasBranching: boolean;
}

export function buildScenarioIndex(outputDir: string): ScenarioIndexEntry[] {
  if (!fs.existsSync(outputDir)) return [];

  const entries: ScenarioIndexEntry[] = [];
  const dirs = fs.readdirSync(outputDir).filter((d) => {
    const full = path.join(outputDir, d);
    return fs.statSync(full).isDirectory();
  });

  for (const dir of dirs) {
    const unifiedPath = path.join(outputDir, dir, 'unified.json');
    if (!fs.existsSync(unifiedPath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(unifiedPath, 'utf-8'));
      entries.push({
        id: raw.meta?.id ?? dir,
        name: raw.meta?.name ?? '',
        difficulty: raw.meta?.difficulty ?? 'unknown',
        category: raw.meta?.category ?? '',
        tags: raw.meta?.tags ?? [],
        protocols: raw.meta?.protocols ?? [],
        learningObjectives: raw.debriefing?.learningObjectives ?? [],
        patientAge: raw.patient?.age ?? 0,
        patientSex: raw.patient?.sex ?? '',
        phaseCount: raw.phases?.length ?? 0,
        hasBranching: (raw.phases ?? []).some(
          (p: any) => p.isDefault === false
        ),
      });
    } catch {
      // Skip invalid files
    }
  }

  return entries;
}

export function formatScenarioIndexForPrompt(index: ScenarioIndexEntry[]): string {
  if (index.length === 0) {
    return 'No existing scenarios found.';
  }

  const lines = index.map((e) => {
    const protocols = e.protocols.join(', ');
    const objectives = e.learningObjectives.length > 0
      ? e.learningObjectives.slice(0, 3).join('; ')
      : 'none listed';
    return `- "${e.name}" (${e.difficulty}) | Protocols: ${protocols} | Patient: ${e.patientAge}${e.patientSex === 'male' ? 'M' : 'F'} | Phases: ${e.phaseCount}${e.hasBranching ? ' (branching)' : ''} | Objectives: ${objectives}`;
  });

  return `Existing scenarios (${index.length} total):\n${lines.join('\n')}`;
}
