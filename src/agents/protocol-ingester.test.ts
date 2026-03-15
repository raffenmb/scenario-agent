import fs from 'fs';
import path from 'path';
import os from 'os';
import { runIngestion } from './protocol-ingester';
import { DocumentChunk, IngestionState } from '../ingestion/types';
import { initState } from '../ingestion/state';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
        .mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: JSON.stringify({
              classification: 'protocol_content',
              isNewProtocol: true,
              protocolName: 'Test Protocol',
              protocolSlug: 'test-protocol',
              extractedContent: 'Assess the patient. Administer treatment.',
              hasFlowchart: false,
              detectedRefs: [],
            }),
          }],
        }),
    },
  }));
});

describe('protocol-ingester integration', () => {
  let tmpDir: string;
  let protocolDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingester-test-'));
    protocolDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('processes a single text chunk and produces a completed protocol', async () => {
    const chunks: DocumentChunk[] = [
      { pageNumber: 1, totalPages: 1, type: 'text', content: 'Test protocol content' },
    ];

    const state = initState({
      sourceFile: '/fake/file.txt',
      sourceFileSize: 100,
      sourceFileModified: 1700000000000,
      sourceFormat: 'txt',
      setName: 'Test',
      setSlug: 'test',
      totalPages: 1,
    });

    const result = await runIngestion(chunks, state, protocolDir, 'fake-key', {
      onPageStart: jest.fn(),
      onPageClassified: jest.fn(),
      onProtocolFinalized: jest.fn(),
      onError: jest.fn(),
    });

    expect(result.completedIndex.length).toBe(1);
    expect(result.completedIndex[0].slug).toBe('test-protocol');
    expect(result.completedIndex[0].name).toBe('Test Protocol');
    expect(result.status).toBe('needs_reconciliation');
  });
});
