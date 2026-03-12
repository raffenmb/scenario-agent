import { loadProtocolIndex, readProtocol } from "./loader";
import path from "path";

const PROTOCOL_DIR = path.resolve(__dirname, "../../protocol_docs");

describe("loadProtocolIndex", () => {
  it("loads all protocol files with valid frontmatter", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    expect(index.length).toBeGreaterThanOrEqual(60);
    for (const entry of index) {
      expect(entry.slug).toBeTruthy();
      expect(entry.section).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.filePath).toContain(".md");
    }
  });

  it("includes known protocol slugs", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    const slugs = index.map((e) => e.slug);
    expect(slugs).toContain("medical-hypoglycemia");
    expect(slugs).toContain("cv-stroke-tia");
    expect(slugs).toContain("trauma-extremity-hemorrhage");
  });
});

describe("readProtocol", () => {
  it("returns full file content for a valid slug", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    const content = readProtocol("medical-hypoglycemia", index);
    expect(content).toContain("Hypoglycemia");
    expect(content).toContain("Patient Care Goals");
  });

  it("returns null for an unknown slug", () => {
    const index = loadProtocolIndex(PROTOCOL_DIR);
    const content = readProtocol("nonexistent-protocol", index);
    expect(content).toBeNull();
  });
});
