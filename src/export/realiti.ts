import {
  UnifiedScenario,
  ECG_RHYTHM_CODES,
  SHOCKABLE_CODES,
  ARREST_WAVEFORM_CODES,
} from "../types/schema";

export function exportRealiti(scenario: UnifiedScenario): Record<string, any> {
  const defaultPhases = scenario.phases.filter((p) => p.isDefault === true || p.isDefault === undefined);
  const checklist = buildChecklist(scenario);

  return {
    scenarioId: scenario.meta.id,
    scenarioName: scenario.meta.name,
    scenarioType: "Vital Signs",
    scenarioVersion: 2,
    scenarioTime: scenario.meta.totalTimeSeconds,
    scenarioMonitorType: scenario.realiti?.scenarioMonitorType ?? 20,
    scenarioDefaultEnergy: scenario.realiti?.scenarioDefaultEnergy ?? 200,
    scenarioDefaultPacerThreshold: scenario.realiti?.scenarioDefaultPacerThreshold ?? 55,
    isDemo: false,
    isALSILegacy: false,
    scenarioStory: buildScenarioStory(scenario, defaultPhases),
    patientInformation: buildPatientInfo(scenario),
    labs: [],
    scenarioEvents: defaultPhases.map((phase) => buildScenarioEvent(phase, checklist, scenario)),
    checklist,
    media: [],
  };
}

function buildPatientInfo(scenario: UnifiedScenario): Record<string, any> {
  const p = scenario.patient;
  return {
    patientName: p.name,
    patientCondition: p.chiefComplaint,
    patientAge: p.age,
    patientAgeUnit: p.ageUnit ?? "years",
    patientAgeCategory: p.age >= 18 ? 0 : 1,
    patientSex: p.sex === "male" ? 1 : 2,
    patientHeight: p.height,
    patientWeight: parseFloat(p.weight.toFixed(1)),
    patientPhotoId: Math.min(Math.ceil(p.age * 1.2), 100),
    patientAdmitted: 1,
  };
}

function buildScenarioEvent(
  phase: UnifiedScenario["phases"][0],
  checklist: Record<string, any>[],
  scenario: UnifiedScenario
): Record<string, any> {
  const ms = phase.monitorState;

  let ecgWaveform = ms.ecgWaveform;
  if (ecgWaveform === undefined && ms.ecgRhythm) {
    ecgWaveform = ECG_RHYTHM_CODES[ms.ecgRhythm];
  }

  const isShockable = ecgWaveform !== undefined && SHOCKABLE_CODES.has(ecgWaveform);

  const parameters: Record<string, any> = {};
  if (ecgWaveform !== undefined) parameters.ecgWaveform = ecgWaveform;
  if (ms.hr !== undefined) parameters.hr = ms.hr;
  if (ms.bpSys !== undefined) parameters.bpSys = ms.bpSys;
  if (ms.bpDia !== undefined) parameters.bpDia = ms.bpDia;
  if (ms.respRate !== undefined) parameters.respRate = ms.respRate;
  if (ms.spo2 !== undefined) parameters.spo2 = ms.spo2;
  if (ms.etco2 !== undefined) parameters.etco2 = ms.etco2;
  if (ms.temp !== undefined) parameters.temp = ms.temp;
  if (ms.obstruction !== undefined) parameters.obstruction = ms.obstruction;

  // Glucose → custMeasure1
  if (ms.glucose !== undefined) {
    parameters.custMeasure1 = ms.glucose;
    parameters.custMeasureLabel1 = "mg/dL";
  }

  // Custom measures
  if (ms.customMeasures) {
    ms.customMeasures.forEach((cm, i) => {
      if (i === 0 && ms.glucose === undefined) {
        parameters.custMeasure1 = cm.value;
        parameters.custMeasureLabel1 = cm.label;
      } else if (i === 0 && ms.glucose !== undefined) {
        parameters.custMeasure2 = cm.value;
        parameters.custMeasureLabel2 = cm.label;
      } else if (i === 1) {
        const n = ms.glucose !== undefined ? 3 : 2;
        parameters[`custMeasure${n}`] = cm.value;
        parameters[`custMeasureLabel${n}`] = cm.label;
      }
    });
  }

  // Visibility toggles
  if (ms.visibility) {
    if (ms.visibility.spo2Visible !== undefined) parameters.spo2Visible = ms.visibility.spo2Visible;
    if (ms.visibility.spo2Attached !== undefined) parameters.spo2Attached = ms.visibility.spo2Attached;
    if (ms.visibility.rrVisible !== undefined) parameters.rrVisible = ms.visibility.rrVisible;
    if (ms.visibility.etco2Visible !== undefined) parameters.etco2Visible = ms.visibility.etco2Visible;
    if (ms.visibility.cvpVisible !== undefined) parameters.cvpVisible = ms.visibility.cvpVisible;
  }

  // Cardiac arrest enforcement
  const isArrest =
    (ecgWaveform !== undefined && ARREST_WAVEFORM_CODES.has(ecgWaveform)) ||
    (ms.hr === 0 && ms.bpSys === 0 && ms.bpDia === 0);
  if (isArrest) {
    parameters.spo2 = 0;
    parameters.spo2Visible = false;
  }

  const relatedChecklist = findRelatedChecklist(phase, checklist, scenario);

  return {
    type: "ScenarioEvent",
    name: phase.name,
    description: phase.description,
    monitorType: 0,
    trendTime: ms.trendTimeSeconds ?? 0,
    jumpTime: 0,
    defibShock: isShockable,
    defibDisarm: !isShockable,
    parameters,
    relatedMedia: [],
    relatedLabs: [],
    relatedChecklist,
    relatedSounds: [],
  };
}

function findRelatedChecklist(
  phase: UnifiedScenario["phases"][0],
  checklist: Record<string, any>[],
  scenario: UnifiedScenario
): string[] {
  if (!phase.expectedActions?.length) return [];
  const actionTexts = phase.expectedActions.map((a) => a.action.toLowerCase());
  return checklist
    .filter((item) =>
      actionTexts.some(
        (at) => item.title.toLowerCase().includes(at) || at.includes(item.title.toLowerCase())
      )
    )
    .map((item) => item.title);
}

function buildChecklist(scenario: UnifiedScenario): Record<string, any>[] {
  const items: Record<string, any>[] = [];
  const allActions = [
    ...(scenario.assessment.criticalActions ?? []),
    ...(scenario.assessment.expectedActions ?? []),
  ];
  for (const title of allActions) {
    items.push({ title, type: "Check", value: 0, icon: 1 });
  }
  return items;
}

function buildScenarioStory(
  scenario: UnifiedScenario,
  defaultPhases: UnifiedScenario["phases"]
): Record<string, any> {
  const history = scenario.patient.history.hpi ?? "";
  const discussion = (scenario.debriefing.learningObjectives ?? []).join(". ");
  const course = defaultPhases.map((p) => `${p.name}: ${p.description}`).join(" → ");
  return { history, discussion, course };
}
