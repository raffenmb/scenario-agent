// src/export/html.test.ts
import { exportHtml } from "./html";
import { UnifiedScenario } from "../types/schema";

function makeTestScenario(): UnifiedScenario {
  return {
    meta: {
      id: "test-001",
      name: "Test Scenario",
      difficulty: "intermediate",
      category: "Medical",
      protocols: ["medical-hypoglycemia"],
      totalTimeSeconds: 900,
      tags: ["diabetes", "hypoglycemia"],
    },
    patient: {
      name: "John Doe",
      age: 55,
      sex: "male",
      weight: 80,
      height: 175,
      chiefComplaint: "Unresponsive",
      history: {
        hpi: "Found unresponsive on floor",
        pastMedical: ["Diabetes"],
        medications: ["Insulin"],
        allergies: ["NKDA"],
        lastOralIntake: "Last night",
        events: "Wife heard thud",
      },
    },
    scene: {
      location: "Home kitchen",
      time: "0800",
      safety: "Scene safe",
      bystanders: "Wife present",
      visualCues: ["Patient on floor", "Insulin pen nearby"],
    },
    phases: [
      {
        id: "initial",
        name: "Initial Contact",
        description: "Patient found unresponsive",
        isDefault: true,
        clinicalPresentation: {
          avpu: "Pain",
          gcs: { eye: 2, verbal: 2, motor: 4 },
          airway: "Patent",
          breathing: "Rapid",
          circulation: "Tachycardic",
          skin: { color: "Pale", temperature: "Cool", moisture: "Diaphoretic" },
          pupils: "PERRL 4mm",
        },
        monitorState: {
          ecgRhythm: "Sinus Tachycardia",
          ecgWaveform: 9,
          hr: 112,
          bpSys: 148,
          bpDia: 92,
          respRate: 22,
          spo2: 97,
          glucose: 28,
        },
        expectedActions: [
          {
            id: "check-glucose",
            action: "Check blood glucose",
            priority: "critical",
            rationale: "Protocol requires glucose check",
          },
        ],
      },
    ],
    assessment: {
      criticalActions: ["Check glucose"],
      expectedActions: ["Get SAMPLE history"],
      bonusActions: ["Discuss insulin management"],
    },
    debriefing: {
      learningObjectives: ["Recognize hypoglycemia"],
      discussionQuestions: ["Why IV dextrose?"],
      commonPitfalls: ["Giving oral glucose to unresponsive patient"],
      keyTakeaways: ["Always check glucose on altered patients"],
    },
  };
}

describe("exportHtml", () => {
  it("returns a complete HTML document", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes scenario metadata", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("Test Scenario");
    expect(html).toContain("intermediate");
    expect(html).toContain("Medical");
  });

  it("includes patient information", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("John Doe");
    expect(html).toContain("Unresponsive");
  });

  it("includes phase data", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("Initial Contact");
    expect(html).toContain("Check blood glucose");
  });

  it("includes vital signs", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("112"); // HR
    expect(html).toContain("148"); // bpSys
    expect(html).toContain("28"); // glucose
  });

  it("includes debriefing content", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).toContain("Recognize hypoglycemia");
    expect(html).toContain("Why IV dextrose?");
  });

  it("is self-contained (no external JS dependencies)", () => {
    const html = exportHtml(makeTestScenario());
    expect(html).not.toMatch(/src=["']https?:\/\//);
  });
});
