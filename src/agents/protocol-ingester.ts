import Anthropic from '@anthropic-ai/sdk';
import { DocumentChunk, IngestionState, IngestionResult, CompletedProtocol } from '../ingestion/types';
import { buildIngestionPrompt, buildIngestionUserMessage } from '../prompts/protocol-ingester';
import { saveState } from '../ingestion/state';
import path from 'path';

interface IngestionProgressCallback {
  onPageStart: (page: number, total: number) => void;
  onPageClassified: (page: number, classification: string, skipReason?: string) => void;
  onProtocolFinalized: (name: string, slug: string) => void;
  onError: (page: number, error: string) => void;
}

export async function runIngestion(
  chunks: DocumentChunk[],
  state: IngestionState,
  protocolDir: string,
  apiKey: string,
  progress: IngestionProgressCallback
): Promise<IngestionState> {
  const client = new Anthropic({ apiKey });
  const setDir = path.join(protocolDir, state.setSlug);

  for (let i = state.currentPage - 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    progress.onPageStart(chunk.pageNumber, chunk.totalPages);

    const systemPrompt = buildIngestionPrompt(state.completedIndex);
    const userContent = buildIngestionUserMessage(
      chunk,
      state.currentProtocol
    );

    let result: IngestionResult;
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent as any }],
      });

      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in response');
      }

      let jsonText = (textBlock as Anthropic.TextBlock).text.trim();
      const fenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) {
        jsonText = fenceMatch[1].trim();
      }

      result = JSON.parse(jsonText) as IngestionResult;
    } catch (err: any) {
      progress.onError(chunk.pageNumber, err.message);
      state.skippedPages.push({ page: chunk.pageNumber, reason: `error: ${err.message}` });
      state.currentPage = chunk.pageNumber + 1;
      saveState(setDir, state);
      continue;
    }

    if (result.classification === 'non_protocol') {
      progress.onPageClassified(chunk.pageNumber, 'non_protocol', result.skipReason);
      state.skippedPages.push({
        page: chunk.pageNumber,
        reason: result.skipReason || 'non-protocol content',
      });
      state.currentPage = chunk.pageNumber + 1;
      saveState(setDir, state);
      continue;
    }

    progress.onPageClassified(chunk.pageNumber, 'protocol_content');

    // If new protocol detected, finalize the current one first
    if (result.isNewProtocol && state.currentProtocol) {
      const completed = finalizeProtocol(state.currentProtocol, chunk.pageNumber - 1);
      state.completedIndex.push(completed);
      progress.onProtocolFinalized(completed.name, completed.slug);
      state.currentProtocol = null;
    }

    // Start new protocol if needed
    if (result.isNewProtocol || !state.currentProtocol) {
      state.currentProtocol = {
        name: result.protocolName || 'Unknown Protocol',
        slug: result.protocolSlug || `protocol-${chunk.pageNumber}`,
        startPage: chunk.pageNumber,
        accumulatedContent: '',
        hasFlowchart: false,
        unresolvedRefs: [],
      };
    }

    // Append extracted content
    state.currentProtocol.accumulatedContent += '\n\n' + result.extractedContent;
    state.currentProtocol.accumulatedContent = state.currentProtocol.accumulatedContent.trim();

    if (result.hasFlowchart) {
      state.currentProtocol.hasFlowchart = true;
    }

    for (const ref of result.detectedRefs) {
      if (ref.startsWith('UNRESOLVED:') && !state.currentProtocol.unresolvedRefs.includes(ref)) {
        state.currentProtocol.unresolvedRefs.push(ref);
      }
    }

    state.currentPage = chunk.pageNumber + 1;
    saveState(setDir, state);
  }

  // Finalize last protocol if one is in progress
  if (state.currentProtocol) {
    const completed = finalizeProtocol(state.currentProtocol, chunks.length);
    state.completedIndex.push(completed);
    progress.onProtocolFinalized(completed.name, completed.slug);
    state.currentProtocol = null;
  }

  state.status = 'needs_reconciliation';
  saveState(setDir, state);
  return state;
}

function finalizeProtocol(
  current: NonNullable<IngestionState['currentProtocol']>,
  endPage: number
): CompletedProtocol {
  // Generate a one-line description from the first meaningful sentence
  const firstSentence = current.accumulatedContent
    .split(/[.\n]/)
    .map((s) => s.trim())
    .find((s) => s.length > 20) || current.name;

  // unresolvedRefs contains "UNRESOLVED:slug" strings — strip prefix for crossRefs
  const crossRefs = current.unresolvedRefs.map((r) =>
    r.startsWith('UNRESOLVED:') ? r.replace('UNRESOLVED:', '') : r
  );

  return {
    slug: current.slug,
    name: current.name,
    description: firstSentence.substring(0, 200),
    pageRange: current.startPage === endPage
      ? `${current.startPage}`
      : `${current.startPage}-${endPage}`,
    hasFlowchart: current.hasFlowchart,
    crossRefs,
    content: current.accumulatedContent,
  };
}
