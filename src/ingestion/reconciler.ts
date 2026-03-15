import fs from 'fs';
import path from 'path';

export interface ReconciliationReport {
  resolved: number;
  unresolved: number;
  unresolvedDetails: Array<{
    file: string;
    slug: string;
  }>;
}

const UNRESOLVED_PATTERN = /\[\[UNRESOLVED:([\w-]+)\]\]/g;

export function reconcileReferences(
  setDir: string,
  knownSlugs: Set<string>
): ReconciliationReport {
  const report: ReconciliationReport = {
    resolved: 0,
    unresolved: 0,
    unresolvedDetails: [],
  };

  const files = fs.readdirSync(setDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(setDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    content = content.replace(UNRESOLVED_PATTERN, (match, slug) => {
      if (knownSlugs.has(slug)) {
        report.resolved++;
        modified = true;
        return `[[${slug}]]`;
      } else {
        report.unresolved++;
        report.unresolvedDetails.push({ file, slug });
        return match;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content);
    }
  }

  return report;
}
