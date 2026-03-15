import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  initState,
  loadState,
  saveState,
  checkResumability,
} from './state';
import { IngestionState } from './types';

describe('state management', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestion-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initState', () => {
    it('creates a fresh state object', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'AHA ACLS 2025',
        setSlug: 'aha-acls-2025',
        totalPages: 10,
      });
      expect(state.status).toBe('in_progress');
      expect(state.currentPage).toBe(1);
      expect(state.currentProtocol).toBeNull();
      expect(state.completedIndex).toEqual([]);
      expect(state.skippedPages).toEqual([]);
    });
  });

  describe('saveState / loadState', () => {
    it('round-trips state to disk', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test Set',
        setSlug: 'test-set',
        totalPages: 5,
      });
      saveState(tmpDir, state);
      const loaded = loadState(tmpDir);
      expect(loaded).toEqual(state);
    });

    it('returns null when no state file exists', () => {
      const loaded = loadState(tmpDir);
      expect(loaded).toBeNull();
    });
  });

  describe('checkResumability', () => {
    it('returns "resume" when state matches source file', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test',
        setSlug: 'test',
        totalPages: 5,
      });
      const result = checkResumability(state, 1024, 1700000000000);
      expect(result).toBe('resume');
    });

    it('returns "mismatch" when file size differs', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test',
        setSlug: 'test',
        totalPages: 5,
      });
      const result = checkResumability(state, 2048, 1700000000000);
      expect(result).toBe('mismatch');
    });

    it('returns "completed" when status is completed', () => {
      const state = initState({
        sourceFile: '/path/to/file.pdf',
        sourceFileSize: 1024,
        sourceFileModified: 1700000000000,
        sourceFormat: 'pdf',
        setName: 'Test',
        setSlug: 'test',
        totalPages: 5,
      });
      state.status = 'completed';
      const result = checkResumability(state, 1024, 1700000000000);
      expect(result).toBe('completed');
    });
  });
});
