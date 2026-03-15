// src/ingestion/types.ts

export interface DocumentChunk {
  pageNumber: number;
  totalPages: number;
  type: 'vision' | 'text';
  content: string;
  mimeType?: string;
}

export interface IngestionState {
  sourceFile: string;
  sourceFileSize: number;
  sourceFileModified: number;
  sourceFormat: string;
  setName: string;
  setSlug: string;
  totalPages: number;
  currentPage: number;
  status: 'in_progress' | 'completed' | 'needs_reconciliation';
  currentProtocol: CurrentProtocol | null;
  completedIndex: CompletedProtocol[];
  skippedPages: SkippedPage[];
}

export interface CurrentProtocol {
  name: string;
  slug: string;
  startPage: number;
  accumulatedContent: string;
  hasFlowchart: boolean;
  unresolvedRefs: string[];
}

export interface CompletedProtocol {
  slug: string;
  name: string;
  description: string;
  pageRange: string;
  hasFlowchart: boolean;
  crossRefs: string[];
  content: string;
}

export interface SkippedPage {
  page: number;
  reason: string;
}

export interface IngestionResult {
  classification: 'protocol_content' | 'non_protocol';
  skipReason?: string;
  isNewProtocol: boolean;
  protocolName?: string;
  protocolSlug?: string;
  extractedContent: string;
  hasFlowchart: boolean;
  detectedRefs: string[];
}
