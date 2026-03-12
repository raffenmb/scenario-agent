import { exportRealiti } from "./realiti";
import { UnifiedScenario } from "../types/schema";

function makeTestScenario(): UnifiedScenario {
  return {
    meta: {
      id: "hypo-001",
      name: "Hypoglycemic Emergency",
      difficulty: "intermediate",
      protocols: ["medical-hypoglycemia"],
      totalTimeSeconds: 900,
      tags: ["diabetes"],
    },
    patient: {
      name: "Robert Chen",
      age: 55,
      sex: "male",
      weight: 88,
      height: 175,
      chiefComplaint: "Unresponsive male",
      history: {
        hpi: "55-year-old male found unresponsive on kitchen floor.",
        pastMedical: ["Type 2 DM"],
        medications: ["Insulin glargine"],
        allergies: ["Sulfa"],
      },
    },
    scene: { location: "Kitchen" },
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
          respRate: 22,
          spo2: 97,
          etco2: 32,
          temp: 36.4,
          glucose: 28,
          trendTimeSeconds: 0,
          visibility: { spo2Visible: true, spo2Attached: true, rrVisible: true, etco2Visible: false, cvpVisible: false },
        },
        expectedActions: [
          { id: "check-glucose", action: "Check blood glucose", priority: "critical" },
        ],
      },
      {
        id: "seizure",
        name: "Seizure Branch",
        description: "Patient seizes",
        isDefault: false,
        clinicalPresentation: { avpu: "Unresponsive" },
        monitorState: { hr: 138, bpSys: 172, bpDia: 104, ecgWaveform: 9 },
        expectedActions: [],
      },
    ],
    assessment: {
      criticalActions: ["Blood glucose checked", "Dextrose administered"],
      expectedActions: ["SAMPLE history obtained"],
    },
    debriefing: {
      learningObjectives: ["Recognize hypoglycemia", "Select appropriate treatment"],
    },
    realiti: { scenarioMonitorType: 20 },
  };
}

describe("exportRealiti", () => {
  const result = exportRealiti(makeTestScenario());

  it("sets scenario-level fields correctly", () => {
    expect(result.scenarioId).toBe("hypo-001");
    expect(result.scenarioName).toBe("Hypoglycemic Emergency");
    expect(result.scenarioType).toBe("Vital Signs");
    expect(result.scenarioVersion).toBe(2);
    expect(result.isDemo).toBe(false);
    expect(result.isALSILegacy).toBe(false);
    expect(result.scenarioTime).toBe(900);
    expect(result.scenarioMonitorType).toBe(20);
  });

  it("maps patient information correctly", () => {
    const pi = result.patientInformation;
    expect(pi.patientName).toBe("Robert Chen");
    expect(pi.patientSex).toBe(1);
    expect(pi.patientWeight).toBe(88.0);
    expect(pi.patientAge).toBe(55);
    expect(pi.patientPhotoId).toBe(66);
    expect(pi.patientAdmitted).toBe(1);
  });

  it("excludes branch phases from scenarioEvents", () => {
    expect(result.scenarioEvents).toHaveLength(1);
    expect(result.scenarioEvents[0].name).toBe("Initial Contact");
  });

  it("maps monitor state to event parameters", () => {
    const params = result.scenarioEvents[0].parameters;
    expect(params.hr).toBe(112);
    expect(params.bpSys).toBe(148);
    expect(params.ecgWaveform).toBe(9);
    expect(params.custMeasure1).toBe(28);
    expect(params.custMeasureLabel1).toBe("mg/dL");
  });

  it("sets event-level constants", () => {
    const event = result.scenarioEvents[0];
    expect(event.type).toBe("ScenarioEvent");
    expect(event.monitorType).toBe(0);
    expect(event.jumpTime).toBe(0);
    expect(event.relatedMedia).toEqual([]);
    expect(event.relatedLabs).toEqual([]);
    expect(event.relatedSounds).toEqual([]);
  });

  it("sets defib flags based on rhythm", () => {
    const event = result.scenarioEvents[0];
    expect(event.defibShock).toBe(false);
    expect(event.defibDisarm).toBe(true);
  });

  it("builds checklist from assessment", () => {
    expect(result.checklist).toHaveLength(3);
    expect(result.checklist[0]).toEqual({
      title: "Blood glucose checked",
      type: "Check",
      value: 0,
      icon: 1,
    });
  });

  it("includes required empty arrays", () => {
    expect(result.labs).toEqual([]);
    expect(result.media).toEqual([]);
  });

  it("builds scenarioStory", () => {
    expect(result.scenarioStory.history).toContain("unresponsive");
    expect(result.scenarioStory.discussion).toBeTruthy();
    expect(result.scenarioStory.course).toBeTruthy();
  });
});
