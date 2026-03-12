// src/integration.test.ts
import { validateScenario } from "./validation/validator";
import { exportRealiti } from "./export/realiti";
import { exportHtml } from "./export/html";
import { UnifiedScenario } from "./types/schema";
import Ajv from "ajv";
import fs from "fs";
import path from "path";

const exampleScenario: UnifiedScenario = {
  meta: {
    id: "hypo-001",
    name: "Diabetic Found Unresponsive — Hypoglycemic Emergency",
    version: 1,
    difficulty: "intermediate",
    category: "Medical",
    protocols: ["medical-hypoglycemia", "medical-altered-mental-status"],
    totalTimeSeconds: 900,
    tags: ["diabetes", "hypoglycemia", "altered mental status"],
  },
  patient: {
    name: "Robert Chen",
    age: 55,
    sex: "male",
    weight: 88.0,
    height: 175,
    chiefComplaint: "Unresponsive male",
    history: {
      hpi: "55-year-old male found unresponsive on kitchen floor by wife.",
      pastMedical: ["Type 2 Diabetes Mellitus", "Hypertension"],
      medications: ["Insulin glargine 30 units daily", "Metformin 1000mg BID"],
      allergies: ["Sulfa — rash"],
      lastOralIntake: "Dinner last evening",
      events: "Wife heard a thud from the kitchen.",
    },
  },
  scene: {
    location: "Single-story residential home, kitchen",
    time: "0815, Tuesday morning",
    safety: "Scene is safe.",
    bystanders: "Wife present, anxious but cooperative.",
    visualCues: ["Patient supine on kitchen tile floor", "Insulin pen on counter"],
  },
  phases: [
    {
      id: "initial",
      name: "Initial Contact",
      description: "Patient found unresponsive. BGL 28.",
      triggerCondition: undefined,
      isDefault: true,
      transitions: [
        {
          targetPhaseId: "seizure",
          condition: "Dextrose not administered within 5 minutes",
          conditionType: "action_not_taken",
          timeoutSeconds: 300,
          triggerActionIds: ["establish-iv", "administer-d10"],
        },
      ],
      clinicalPresentation: {
        avpu: "Pain",
        gcs: { eye: 2, verbal: 2, motor: 4 },
        airway: "Patent",
        breathing: "Elevated rate, adequate depth",
        circulation: "Radial pulses present, rapid and weak",
        skin: { color: "Pale", temperature: "Cool", moisture: "Diaphoretic" },
        pupils: "PERRL, 4mm",
        patientSpeech: "Incomprehensible sounds only",
      },
      monitorState: {
        ecgRhythm: "Sinus Tachycardia",
        ecgWaveform: 9,
        hr: 112,
        bpSys: 148,
        bpDia: 92,
        respRate: 22,
        spo2: 97,
        etco2: 32,
        temp: 36.4,
        glucose: 28,
        trendTimeSeconds: 0,
        visibility: { spo2Visible: true, spo2Attached: true, rrVisible: true, etco2Visible: false, cvpVisible: false },
      },
      expectedActions: [
        { id: "check-glucose", action: "Check blood glucose", priority: "critical", rationale: "Protocol requires glucose check" },
        { id: "establish-iv", action: "Establish IV access", priority: "critical", rationale: "IV dextrose indicated" },
        { id: "administer-d10", action: "Administer D10 250mL IV", priority: "critical", rationale: "BGL ≤60" },
      ],
    },
    {
      id: "post-dextrose",
      name: "Post-Dextrose",
      description: "Patient improving after D10.",
      triggerCondition: "After D10 administered",
      isDefault: true,
      clinicalPresentation: { avpu: "Verbal", gcs: { eye: 3, verbal: 4, motor: 5 } },
      monitorState: { ecgRhythm: "Sinus Rhythm", ecgWaveform: 9, hr: 94, bpSys: 132, bpDia: 84, respRate: 18, spo2: 98, glucose: 68, trendTimeSeconds: 120 },
      expectedActions: [
        { id: "recheck-glucose", action: "Recheck blood glucose", priority: "critical" },
      ],
    },
    {
      id: "seizure",
      name: "Hypoglycemic Seizure",
      description: "Patient seizes due to prolonged hypoglycemia.",
      triggerCondition: "Dextrose not given within 5 minutes",
      isDefault: false,
      clinicalPresentation: {
        avpu: "Unresponsive",
        gcs: { eye: 1, verbal: 1, motor: 3 },
      },
      monitorState: { ecgRhythm: "Sinus Tachycardia", ecgWaveform: 9, hr: 138, bpSys: 172, bpDia: 104, respRate: 8, spo2: 88, glucose: 22, trendTimeSeconds: 30 },
      expectedActions: [
        { id: "sz-protect", action: "Protect patient from injury", priority: "critical" },
        { id: "sz-iv-d10", action: "Establish IV and give D10", priority: "critical" },
      ],
    },
  ],
  assessment: {
    criticalActions: ["Blood glucose checked", "IV access established", "D10 administered"],
    expectedActions: ["SAMPLE history obtained", "Glucose rechecked"],
    bonusActions: ["Used D10 instead of D50"],
  },
  debriefing: {
    learningObjectives: ["Recognize hypoglycemia", "Select appropriate treatment"],
    discussionQuestions: ["Why IV dextrose instead of oral?"],
    commonPitfalls: ["Giving oral glucose to unresponsive patient"],
    keyTakeaways: ["Always check glucose on altered patients"],
  },
  realiti: { scenarioMonitorType: 20 },
};

describe("Integration: full pipeline", () => {
  it("validates the example scenario successfully", () => {
    const result = validateScenario(exampleScenario);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("exports valid REALITi JSON", () => {
    const realiti = exportRealiti(exampleScenario);

    // Validate against REALITi schema
    const schemaPath = path.resolve(__dirname, "../realiti_scenario.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(realiti);

    if (!valid) {
      console.error("REALITi validation errors:", validate.errors);
    }
    expect(valid).toBe(true);

    // Verify branch phase excluded
    expect(realiti.scenarioEvents).toHaveLength(2);
    expect(realiti.scenarioEvents.every((e: any) => e.name !== "Hypoglycemic Seizure")).toBe(true);

    // Verify glucose mapping
    expect(realiti.scenarioEvents[0].parameters.custMeasure1).toBe(28);
    expect(realiti.scenarioEvents[0].parameters.custMeasureLabel1).toBe("mg/dL");
  });

  it("exports valid HTML", () => {
    const html = exportHtml(exampleScenario);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Diabetic Found Unresponsive");
    // Branch phase IS included in HTML
    expect(html).toContain("Hypoglycemic Seizure");
    // All phase tabs present
    expect(html).toContain("Initial Contact");
    expect(html).toContain("Post-Dextrose");
  });
});
