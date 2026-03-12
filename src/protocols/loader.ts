import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { ProtocolEntry } from "../types/schema";

export function loadProtocolIndex(protocolDir: string): ProtocolEntry[] {
  const entries: ProtocolEntry[] = [];
  const files = fs.readdirSync(protocolDir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const filePath = path.join(protocolDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(raw);

      if (!data.slug || !data.section || !data.description) {
        console.warn(`Skipping ${file}: missing required frontmatter (slug, section, or description)`);
        continue;
      }

      entries.push({
        slug: data.slug,
        section: data.section,
        description: data.description,
        filePath,
      });
    } catch (err) {
      console.warn(`Skipping ${file}: failed to parse frontmatter`);
    }
  }

  return entries;
}

export function readProtocol(slug: string, index: ProtocolEntry[]): string | null {
  const entry = index.find((e) => e.slug === slug);
  if (!entry) return null;
  try {
    return fs.readFileSync(entry.filePath, "utf-8");
  } catch {
    return null;
  }
}

export function formatIndexForPrompt(index: ProtocolEntry[]): string {
  const header = "| Slug | Section | Description |";
  const divider = "|---|---|---|";
  const rows = index.map((e) => `| ${e.slug} | ${e.section} | ${e.description} |`);
  return [header, divider, ...rows].join("\n");
}
