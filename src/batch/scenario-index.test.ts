import { buildScenarioIndex, formatScenarioIndexForPrompt, ScenarioIndexEntry } from './scenario-index';
import path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../../output');

describe('buildScenarioIndex', () => {
  it('returns an array of ScenarioIndexEntry from output/', () => {
    const index = buildScenarioIndex(OUTPUT_DIR);
    expect(Array.isArray(index)).toBe(true);
    expect(index.length).toBeGreaterThan(0);
  });

  it('extracts expected fields from hypo-001', () => {
    const index = buildScenarioIndex(OUTPUT_DIR);
    const hypo = index.find((e) => e.id === 'hypo-001');
    expect(hypo).toBeDefined();
    expect(hypo!.name).toBe('Hypoglycemic Emergency with Altered Mental Status');
    expect(hypo!.difficulty).toBe('beginner');
    expect(hypo!.protocols).toContain('medical-hypoglycemia');
    expect(hypo!.learningObjectives.length).toBeGreaterThan(0);
    expect(hypo!.patientAge).toBe(67);
    expect(hypo!.patientSex).toBe('female');
    expect(hypo!.phaseCount).toBeGreaterThanOrEqual(2);
    expect(typeof hypo!.hasBranching).toBe('boolean');
  });

  it('returns empty array for nonexistent directory', () => {
    const index = buildScenarioIndex('/nonexistent/path');
    expect(index).toEqual([]);
  });
});

describe('formatScenarioIndexForPrompt', () => {
  it('formats index entries as a readable text block', () => {
    const index = buildScenarioIndex(OUTPUT_DIR);
    const formatted = formatScenarioIndexForPrompt(index);
    expect(formatted).toContain('Hypoglycemic Emergency');
    expect(formatted).toContain('beginner');
    expect(formatted).toContain('medical-hypoglycemia');
  });

  it('returns a message when no scenarios exist', () => {
    const formatted = formatScenarioIndexForPrompt([]);
    expect(formatted).toContain('No existing scenarios');
  });
});
