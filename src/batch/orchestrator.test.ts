import { buildForwardContext, buildScenarioDescription, GeneratedSummary } from './orchestrator';
import { BatchPlanEntry } from '../agents/batch-planner';

describe('buildForwardContext', () => {
  it('returns empty string when no scenarios generated yet', () => {
    expect(buildForwardContext([])).toBe('');
  });

  it('formats a single generated scenario', () => {
    const summaries: GeneratedSummary[] = [
      {
        title: 'Hypoglycemia Emergency',
        difficulty: 'beginner',
        patientAge: 67,
        patientSex: 'female',
        location: 'home',
        protocols: ['medical-hypoglycemia'],
        objectives: ['Glucose assessment', 'D10 administration'],
      },
    ];
    const result = buildForwardContext(summaries);
    expect(result).toContain('Hypoglycemia Emergency');
    expect(result).toContain('beginner');
    expect(result).toContain('67F');
    expect(result).toContain('medical-hypoglycemia');
    expect(result).toContain('differentiate');
  });

  it('formats multiple generated scenarios', () => {
    const summaries: GeneratedSummary[] = [
      {
        title: 'Scenario A',
        difficulty: 'beginner',
        patientAge: 45,
        patientSex: 'male',
        location: 'office',
        protocols: ['proto-a'],
        objectives: ['Obj 1'],
      },
      {
        title: 'Scenario B',
        difficulty: 'advanced',
        patientAge: 22,
        patientSex: 'female',
        location: 'park',
        protocols: ['proto-b'],
        objectives: ['Obj 2'],
      },
    ];
    const result = buildForwardContext(summaries);
    expect(result).toContain('Scenario A');
    expect(result).toContain('Scenario B');
  });
});

describe('buildScenarioDescription', () => {
  const planEntry: BatchPlanEntry = {
    title: 'Allergic Reaction — Anaphylaxis',
    description: '32M at restaurant, sudden onset after eating shellfish',
    targetProtocols: ['medical-allergic-reaction'],
    difficulty: 'intermediate',
    learningObjectives: ['Epinephrine administration', 'Airway management'],
  };

  it('includes title, description, difficulty, and objectives', () => {
    const result = buildScenarioDescription(planEntry, '');
    expect(result).toContain('Allergic Reaction');
    expect(result).toContain('32M at restaurant');
    expect(result).toContain('intermediate');
    expect(result).toContain('Epinephrine administration');
  });

  it('appends forward context when provided', () => {
    const context = 'Previously generated: Scenario A';
    const result = buildScenarioDescription(planEntry, context);
    expect(result).toContain('Previously generated');
  });

  it('omits forward context section when empty', () => {
    const result = buildScenarioDescription(planEntry, '');
    expect(result).not.toContain('Previously generated');
  });
});
