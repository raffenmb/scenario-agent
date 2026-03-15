import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { ProtocolEntry } from '../types/schema';

export function discoverSets(protocolDir: string): string[] {
  return fs.readdirSync(protocolDir).filter((entry) => {
    const fullPath = path.join(protocolDir, entry);
    return fs.statSync(fullPath).isDirectory() && !entry.startsWith('.');
  });
}

export function loadProtocolIndex(
  protocolDir: string,
  setNames: string[]
): ProtocolEntry[] {
  const entries: ProtocolEntry[] = [];

  for (const setName of setNames) {
    const setDir = path.join(protocolDir, setName);
    if (!fs.existsSync(setDir)) {
      console.warn(`Protocol set directory not found: ${setDir}`);
      continue;
    }

    const files = fs.readdirSync(setDir).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(setDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { data } = matter(raw);

        if (!data.slug || !data.section || !data.description) {
          console.warn(`Skipping ${file}: missing required frontmatter (slug, section, or description)`);
          continue;
        }

        entries.push({
          slug: data.slug,
          set: setName,
          section: data.section,
          description: data.description,
          filePath,
        });
      } catch (err) {
        console.warn(`Skipping ${file}: failed to parse frontmatter`);
      }
    }
  }

  return entries;
}

export function readProtocol(slug: string, index: ProtocolEntry[]): string | null {
  const entry = index.find((e) => e.slug === slug);
  if (!entry) return null;
  try {
    return fs.readFileSync(entry.filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function formatIndexForPrompt(index: ProtocolEntry[]): string {
  const header = '| Slug | Set | Section | Description |';
  const divider = '|---|---|---|---|';
  const rows = index.map(
    (e) => `| ${e.slug} | ${e.set} | ${e.section} | ${e.description} |`
  );
  return [header, divider, ...rows].join('\n');
}
