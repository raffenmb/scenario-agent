import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { CompletedProtocol } from './types';

interface ProtocolFrontmatter {
  protocol: string;
  slug: string;
  section: string;
  description: string;
  has_flowchart: boolean;
  cross_refs: string[];
  source_pages: string;
  source_format: string;
  ingested: boolean;
}

export function buildFrontmatter(
  protocol: CompletedProtocol,
  setName: string,
  sourceFormat: string
): ProtocolFrontmatter {
  return {
    protocol: protocol.name,
    slug: protocol.slug,
    section: setName,
    description: protocol.description,
    has_flowchart: protocol.hasFlowchart,
    cross_refs: protocol.crossRefs,
    source_pages: protocol.pageRange,
    source_format: sourceFormat,
    ingested: true,
  };
}

export function writeProtocolFile(
  setDir: string,
  protocol: CompletedProtocol,
  setName: string,
  sourceFormat: string
): string {
  fs.mkdirSync(setDir, { recursive: true });
  const frontmatter = buildFrontmatter(protocol, setName, sourceFormat);
  const fileContent = matter.stringify('\n' + protocol.content + '\n', frontmatter);
  const filePath = path.join(setDir, `${protocol.slug}.md`);
  fs.writeFileSync(filePath, fileContent);
  return filePath;
}
