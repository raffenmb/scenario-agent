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
