import fs from 'fs';
import path from 'path';
import { IngestionState } from './types';

const STATE_FILENAME = '.ingestion-state.json';

interface InitStateParams {
  sourceFile: string;
  sourceFileSize: number;
  sourceFileModified: number;
  sourceFormat: string;
  setName: string;
  setSlug: string;
  totalPages: number;
}

export function initState(params: InitStateParams): IngestionState {
  return {
    sourceFile: params.sourceFile,
    sourceFileSize: params.sourceFileSize,
    sourceFileModified: params.sourceFileModified,
    sourceFormat: params.sourceFormat,
    setName: params.setName,
    setSlug: params.setSlug,
    totalPages: params.totalPages,
    currentPage: 1,
    status: 'in_progress',
    currentProtocol: null,
    completedIndex: [],
    skippedPages: [],
  };
}

export function saveState(setDir: string, state: IngestionState): void {
  fs.mkdirSync(setDir, { recursive: true });
  const filePath = path.join(setDir, STATE_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function loadState(setDir: string): IngestionState | null {
  const filePath = path.join(setDir, STATE_FILENAME);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as IngestionState;
}

export type ResumabilityResult = 'resume' | 'completed' | 'mismatch';

export function checkResumability(
  state: IngestionState,
  currentFileSize: number,
  currentFileModified: number
): ResumabilityResult {
  if (state.status === 'completed') return 'completed';
  if (
    state.sourceFileSize !== currentFileSize ||
    state.sourceFileModified !== currentFileModified
  ) {
    return 'mismatch';
  }
  return 'resume';
}
