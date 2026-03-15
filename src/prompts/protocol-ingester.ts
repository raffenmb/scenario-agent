import { CompletedProtocol } from '../ingestion/types';

export function buildIngestionPrompt(
  completedIndex: CompletedProtocol[]
): string {
  const indexSummary = completedIndex.length > 0
    ? completedIndex.map((p) => `- ${p.slug}: ${p.description}`).join('\n')
    : '(none yet)';

  return `You are a protocol extraction engine for an EMS training scenario generator.

Your job: Given a page or chunk from a protocol source document, extract clinically actionable protocol content and classify the page.

## Your Task Per Page

For each page/chunk you receive, respond with a JSON object (no markdown, no code fences):

{
  "classification": "protocol_content" | "non_protocol",
  "skipReason": "string (only if non_protocol)",
  "isNewProtocol": true | false,
  "protocolName": "string (if new protocol detected)",
  "protocolSlug": "string (URL-safe slug, e.g., cardiac-arrest-adult)",
  "extractedContent": "string (the extracted clinical content)",
  "hasFlowchart": true | false,
  "detectedRefs": ["array of slug strings or UNRESOLVED:best-guess-slug"]
}

## Classification Rules

**protocol_content** — Pages containing clinically actionable protocols: treatment algorithms, standing orders, medication administration guides, decision-making procedures, assessment criteria, inclusion/exclusion criteria.

**non_protocol** — Cover pages, tables of contents, acknowledgments, administrative policy sections, revision histories, organizational preambles, blank pages, index pages. Set skipReason to a brief description (e.g., "cover page", "table of contents").

## Protocol Boundary Detection

- Set isNewProtocol=true when you detect the start of a new, distinct protocol (new title, new clinical topic).
- Set isNewProtocol=false when the current page continues the protocol already in progress.
- When isNewProtocol=true, you MUST provide protocolName and protocolSlug for the new protocol.

## Content Extraction Rules

1. Preserve dosages, timeframes, thresholds, and clinical criteria EXACTLY as stated. Never round, approximate, or paraphrase medication dosing.
2. Convert flowcharts and visual decision algorithms to conditional prose using If/Then/Else structures. Set hasFlowchart=true when you do this.
3. Preserve the clinical logic of every decision path — every branch, every condition, every action.
4. Use clear section structure: Patient Care Goals, Inclusion Criteria, Exclusion Criteria, Assessment, Treatment, Disposition (as applicable).
5. For cross-references ("see cardiac arrest protocol", "follow standing order for pain management"), check the completed index below. If a matching slug exists, add it to detectedRefs as the slug. If not, add it as "UNRESOLVED:best-guess-slug".

## Completed Protocols So Far

${indexSummary}

## Critical Rules

- Return ONLY the JSON object. No explanation, no markdown fences.
- extractedContent should contain the protocol text in clean prose, not raw OCR artifacts.
- If a page contains both protocol content and non-protocol content (e.g., a protocol starts halfway down), extract only the protocol portion and classify as protocol_content.
- When in doubt about whether content is a new protocol vs. continuation, prefer continuation (isNewProtocol=false).`;
}

export function buildIngestionUserMessage(
  chunk: { type: 'vision' | 'text'; content: string; mimeType?: string },
  currentProtocol: { name: string; slug: string; accumulatedContent: string } | null
): Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> {
  const parts: Array<any> = [];

  if (currentProtocol) {
    parts.push({
      type: 'text',
      text: `Currently extracting protocol: "${currentProtocol.name}" (slug: ${currentProtocol.slug})\n\nAccumulated content so far (last 500 chars):\n...${currentProtocol.accumulatedContent.slice(-500)}`,
    });
  } else {
    parts.push({
      type: 'text',
      text: 'No protocol currently in progress. This may be the start of a new protocol or non-protocol content.',
    });
  }

  if (chunk.type === 'vision') {
    parts.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: chunk.mimeType || 'image/png',
        data: chunk.content,
      },
    });
    parts.push({
      type: 'text',
      text: 'Extract the clinical protocol content from this page image. Respond with the JSON object only.',
    });
  } else {
    parts.push({
      type: 'text',
      text: `Page content:\n\n${chunk.content}\n\nExtract the clinical protocol content from this page. Respond with the JSON object only.`,
    });
  }

  return parts;
}
