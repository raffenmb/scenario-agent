#!/usr/bin/env node
// export-realiti.js — Convert unified scenario JSON to REALITi format
// Usage: node export-realiti.js <unified.json> <output.json>

const fs = require('fs');
const path = require('path');

const ECG_RHYTHM_CODES = {
  "Normal Sinus Rhythm": 9, "Sinus Rhythm": 9, "Sinus Bradycardia": 9, "Sinus Tachycardia": 9,
  "Asystole": 3, "Pulseless Electrical Activity (PEA)": 9,
  "Ventricular Fibrillation (Fine)": 18, "Ventricular Fibrillation (Coarse)": 18,
  "Ventricular Tachycardia (Monomorphic)": 12, "Ventricular Tachycardia (Polymorphic)": 12,
  "Torsades de Pointes": 12, "Atrial Fibrillation": 38, "Atrial Flutter": 1,
  "Supraventricular Tachycardia": 4, "First Degree AV Block": 5,
  "Second Degree AV Block Type I": 6, "Second Degree AV Block Type II": 103,
  "AV Block Type II 2:1": 40, "Third Degree Heart Block": 100,
  "Idioventricular Rhythm": 91, "Accelerated Idioventricular Rhythm": 91,
  "Accelerated Junctional Rhythm": 79, "Left Bundle Branch Block": 80,
  "Right Bundle Branch Block": 82, "Wolff-Parkinson-White": 84,
  "Pacemaker Rhythm": 9, "Pacemaker Failure to Capture": 9,
  "Hyperkalemia Changes": 20, "Hypokalemia Changes": 21,
  "STEMI Anterior": 23, "STEMI Inferior": 24, "STEMI Lateral": 25, "STEMI Posterior": 26,
  "NSTEMI": 55, "Pericarditis": 22, "Brugada Syndrome": 35, "Wellens Syndrome": 36,
  "Early Repolarization": 41, "Pulmonary Embolism (S1Q3T3)": 45, "Long QT Syndrome": 37,
  "PVC": 49, "Atrial Tachycardia": 4, "Sinus Arrest": 3,
};

const SHOCKABLE_CODES = new Set([18, 12]);
const ARREST_WAVEFORM_CODES = new Set([18, 3]);

function normalizeTrendTime(val) {
  if (!val) return 0;
  return Math.max(10, Math.min(60, val));
}

function exportRealiti(scenario) {
  const defaultPhases = scenario.phases.filter(p => p.isDefault === true || p.isDefault === undefined);
  const branchPhases = scenario.phases.filter(p => p.isDefault === false);
  const allPhases = [...defaultPhases, ...branchPhases];
  const checklist = buildChecklist(scenario);

  return {
    scenarioId: scenario.meta.id,
    scenarioName: scenario.meta.name,
    scenarioType: 'Vital Signs',
    scenarioVersion: 2,
    scenarioTime: scenario.meta.totalTimeSeconds,
    scenarioMonitorType: 2,
    scenarioDefaultEnergy: scenario.realiti?.scenarioDefaultEnergy ?? 200,
    scenarioDefaultPacerThreshold: scenario.realiti?.scenarioDefaultPacerThreshold ?? 55,
    isDemo: false,
    isALSILegacy: false,
    scenarioStory: buildStory(scenario, defaultPhases),
    patientInformation: buildPatientInfo(scenario),
    labs: [],
    scenarioEvents: allPhases.map(phase => buildEvent(phase, checklist, scenario)),
    checklist,
    media: [],
  };
}

function buildPatientInfo(scenario) {
  const p = scenario.patient;
  return {
    patientName: p.name,
    patientCondition: p.chiefComplaint,
    patientAge: p.age,
    patientAgeUnit: p.ageUnit ?? 'years',
    patientAgeCategory: p.age >= 18 ? 0 : 1,
    patientSex: p.sex === 'male' ? 1 : 2,
    patientHeight: p.height,
    patientWeight: parseFloat(p.weight.toFixed(1)),
    patientPhotoId: Math.min(Math.ceil(p.age * 1.2), 100),
    patientAdmitted: 1,
  };
}

function buildEvent(phase, checklist, scenario) {
  const ms = phase.monitorState;
  let ecgWaveform = ms.ecgWaveform;
  if (ecgWaveform === undefined && ms.ecgRhythm) {
    ecgWaveform = ECG_RHYTHM_CODES[ms.ecgRhythm];
  }

  const isShockable = ecgWaveform !== undefined && SHOCKABLE_CODES.has(ecgWaveform);
  const parameters = {};

  if (ecgWaveform !== undefined) parameters.ecgWaveform = ecgWaveform;
  if (ms.hr !== undefined) parameters.hr = ms.hr;
  if (ms.bpSys !== undefined) parameters.bpSys = ms.bpSys;
  if (ms.bpDia !== undefined) parameters.bpDia = ms.bpDia;
  if (ms.respRate !== undefined) parameters.respRate = ms.respRate;
  if (ms.spo2 !== undefined) parameters.spo2 = ms.spo2;
  if (ms.etco2 !== undefined) parameters.etco2 = ms.etco2;
  if (ms.temp !== undefined) parameters.temp = ms.temp;
  if (ms.obstruction !== undefined) parameters.obstruction = ms.obstruction;

  // Glucose -> custMeasure1
  if (ms.glucose !== undefined) {
    parameters.custMeasure1 = ms.glucose;
    parameters.custMeasureLabel1 = 'mg/dL';
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

  const relatedChecklist = findRelatedChecklist(phase, checklist);

  return {
    type: 'ScenarioEvent',
    name: phase.name,
    description: phase.description,
    monitorType: 0,
    trendTime: normalizeTrendTime(ms.trendTimeSeconds),
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

function findRelatedChecklist(phase, checklist) {
  if (!phase.expectedActions?.length) return [];
  const actionTexts = phase.expectedActions.map(a => a.action.toLowerCase());
  return checklist
    .filter(item => actionTexts.some(at => item.title.toLowerCase().includes(at) || at.includes(item.title.toLowerCase())))
    .map(item => item.title);
}

function buildChecklist(scenario) {
  const items = [];
  const allActions = [
    ...(scenario.assessment.criticalActions ?? []),
    ...(scenario.assessment.expectedActions ?? []),
  ];
  for (const title of allActions) {
    items.push({ title, type: 'Check', value: 0, icon: 1 });
  }
  return items;
}

function buildStory(scenario, defaultPhases) {
  const history = scenario.patient.history.hpi ?? '';
  const discussion = (scenario.debriefing.learningObjectives ?? []).join('. ');
  const course = defaultPhases.map(p => `${p.name}: ${p.description}`).join(' → ');
  return { history, discussion, course };
}

// Main
const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node export-realiti.js <unified.json> <output.json>');
  process.exit(1);
}

const scenario = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf-8'));
const result = exportRealiti(scenario);
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(result, null, 2));
console.log(`REALITi JSON written to: ${outputPath}`);
