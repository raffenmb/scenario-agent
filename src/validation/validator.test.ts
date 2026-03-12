import { validateScenario } from "./validator";
import { UnifiedScenario } from "../types/schema";

function makeValidScenario(overrides?: Partial<UnifiedScenario>): UnifiedScenario {
  return {
    meta: {
      id: "test-001",
      name: "Test Scenario",
      difficulty: "beginner",
      protocols: ["medical-hypoglycemia"],
      totalTimeSeconds: 600,
    },
    patient: {
      name: "John Doe",
      age: 55,
      sex: "male",
      weight: 80,
      height: 175,
      chiefComplaint: "Unresponsive",
      history: { hpi: "Found unresponsive" },
    },
    scene: { location: "Home" },
    phases: [
      {
        id: "initial",
        name: "Initial Contact",
        description: "Patient found unresponsive",
        isDefault: true,
        clinicalPresentation: { avpu: "Pain" },
        monitorState: {
          ecgRhythm: "Sinus Tachycardia",
          ecgWaveform: 9,
          hr: 112,
          bpSys: 148,
          bpDia: 92,
          spo2: 97,
        },
        expectedActions: [],
      },
    ],
    assessment: { criticalActions: ["Check glucose"] },
    debriefing: { learningObjectives: ["Recognize hypoglycemia"] },
    ...overrides,
  };
}

describe("validateScenario", () => {
  it("passes for a valid scenario", () => {
    const result = validateScenario(makeValidScenario());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors when ecgWaveform does not match ecgRhythm", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.ecgRhythm = "Atrial Fibrillation";
    scenario.phases[0].monitorState.ecgWaveform = 9;
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ecgWaveform"))).toBe(true);
  });

  it("errors when cardiac arrest missing spo2 rules", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.ecgWaveform = 18;
    scenario.phases[0].monitorState.ecgRhythm = "Ventricular Fibrillation (Coarse)";
    scenario.phases[0].monitorState.spo2 = 95;
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("spo2"))).toBe(true);
  });

  it("errors when cardiac arrest detected by vitals (hr=0, bp=0)", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.hr = 0;
    scenario.phases[0].monitorState.bpSys = 0;
    scenario.phases[0].monitorState.bpDia = 0;
    scenario.phases[0].monitorState.spo2 = 95;
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("spo2"))).toBe(true);
  });

  it("errors when transition references nonexistent phase", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].transitions = [
      { targetPhaseId: "nonexistent", condition: "test" },
    ];
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent"))).toBe(true);
  });

  it("errors when no entry phase exists", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].triggerCondition = "After something";
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("entry phase"))).toBe(true);
  });

  it("warns when AVPU inconsistent with GCS", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].clinicalPresentation.avpu = "Unresponsive";
    scenario.phases[0].clinicalPresentation.gcs = { eye: 4, verbal: 5, motor: 6 };
    const result = validateScenario(scenario);
    expect(result.warnings.some((w) => w.message.includes("AVPU"))).toBe(true);
  });

  it("warns when HR doesn't match rhythm label", () => {
    const scenario = makeValidScenario();
    scenario.phases[0].monitorState.ecgRhythm = "Sinus Bradycardia";
    scenario.phases[0].monitorState.ecgWaveform = 9;
    scenario.phases[0].monitorState.hr = 112;
    const result = validateScenario(scenario);
    expect(result.warnings.some((w) => w.message.includes("HR"))).toBe(true);
  });
});
