import { BatchPlanEntry, validateBatchPlan } from './batch-planner';

describe('validateBatchPlan', () => {
  const validEntry: BatchPlanEntry = {
    title: 'Hypoglycemia Emergency',
    description: '45M found confused at home, history of diabetes',
    targetProtocols: ['medical-hypoglycemia'],
    difficulty: 'beginner',
    learningObjectives: ['Glucose assessment', 'D10 administration'],
  };

  it('accepts a valid batch plan', () => {
    const result = validateBatchPlan([validEntry]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects empty plan', () => {
    const result = validateBatchPlan([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('empty');
  });

  it('rejects entry missing title', () => {
    const bad = { ...validEntry, title: '' };
    const result = validateBatchPlan([bad]);
    expect(result.valid).toBe(false);
  });

  it('rejects entry with no target protocols', () => {
    const bad = { ...validEntry, targetProtocols: [] };
    const result = validateBatchPlan([bad]);
    expect(result.valid).toBe(false);
  });

  it('rejects entry with invalid difficulty', () => {
    const bad = { ...validEntry, difficulty: 'extreme' };
    const result = validateBatchPlan([bad]);
    expect(result.valid).toBe(false);
  });
});
