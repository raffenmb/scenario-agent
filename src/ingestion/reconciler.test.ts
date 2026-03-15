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
