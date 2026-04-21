#!/usr/bin/env node
// validate.js — Validate a unified scenario JSON file
// Usage: node validate.js <unified.json>

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

const ARREST_WAVEFORM_CODES = new Set([18, 3]);

function validate(scenario) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!scenario.meta?.id) errors.push('meta.id is required');
  if (!scenario.meta?.name) errors.push('meta.name is required');
  if (!scenario.meta?.difficulty) errors.push('meta.difficulty is required');
  if (!scenario.meta?.protocols?.length) errors.push('meta.protocols must have at least one entry');
  if (!scenario.meta?.totalTimeSeconds) errors.push('meta.totalTimeSeconds is required');
  if (!scenario.patient?.name) errors.push('patient.name is required');
  if (!scenario.patient?.chiefComplaint) errors.push('patient.chiefComplaint is required');
  if (!scenario.phases?.length) errors.push('At least one phase is required');

  if (!scenario.phases?.length) return { valid: errors.length === 0, errors, warnings };

  // Phase references
  const phaseIds = new Set(scenario.phases.map(p => p.id));
  for (const phase of scenario.phases) {
    if (!phase.transitions) continue;
    for (const t of phase.transitions) {
      if (!phaseIds.has(t.targetPhaseId)) {
        errors.push(`Phase "${phase.id}": transition target "${t.targetPhaseId}" does not exist`);
      }
    }
  }

  // Circular reference check
  function hasCircular(startId, visited) {
    if (visited.has(startId)) return true;
    visited.add(startId);
    const phase = scenario.phases.find(p => p.id === startId);
    if (!phase?.transitions) return false;
    for (const t of phase.transitions) {
      if (hasCircular(t.targetPhaseId, new Set(visited))) return true;
    }
    return false;
  }
  for (const phase of scenario.phases) {
    if (hasCircular(phase.id, new Set())) {
      errors.push(`Circular reference detected from phase "${phase.id}"`);
      break;
    }
  }

  // Default path
  const defaultPhases = scenario.phases.filter(p => p.isDefault === true || p.isDefault === undefined);
  if (defaultPhases.length === 0) errors.push('No default path phases found');

  // Entry phase
  if (!scenario.phases.some(p => !p.triggerCondition)) {
    errors.push('No entry phase found — at least one phase must lack triggerCondition');
  }

  // Per-phase validation
  for (const phase of scenario.phases) {
    const ms = phase.monitorState;
    if (!ms) continue;

    // ECG waveform vs rhythm
    if (ms.ecgRhythm) {
      const expected = ECG_RHYTHM_CODES[ms.ecgRhythm];
      if (expected === undefined) {
        warnings.push(`Phase "${phase.id}": ecgRhythm "${ms.ecgRhythm}" not in ECG table`);
      } else if (ms.ecgWaveform !== undefined && expected !== ms.ecgWaveform) {
        errors.push(`Phase "${phase.id}": ecgWaveform ${ms.ecgWaveform} doesn't match "${ms.ecgRhythm}" (expected ${expected})`);
      }
    }

    // Cardiac arrest enforcement
    const isArrestWaveform = ms.ecgWaveform !== undefined && ARREST_WAVEFORM_CODES.has(ms.ecgWaveform);
    const isArrestVitals = ms.hr === 0 && ms.bpSys === 0 && ms.bpDia === 0;
    if (isArrestWaveform || isArrestVitals) {
      if (ms.spo2 !== undefined && ms.spo2 !== 0) {
        errors.push(`Phase "${phase.id}": cardiac arrest but spo2 is ${ms.spo2} (must be 0)`);
      }
      if (ms.visibility?.spo2Visible !== false) {
        errors.push(`Phase "${phase.id}": cardiac arrest but spo2Visible is not false`);
      }
    }

    // Obstruction range
    if (ms.obstruction !== undefined && (ms.obstruction < 0 || ms.obstruction > 100)) {
      errors.push(`Phase "${phase.id}": obstruction ${ms.obstruction} out of range 0-100`);
    }

    // trendTimeSeconds range (0 for initial phase, otherwise 10-60)
    if (ms.trendTimeSeconds !== undefined && ms.trendTimeSeconds !== 0) {
      if (ms.trendTimeSeconds < 10 || ms.trendTimeSeconds > 60) {
        warnings.push(`Phase "${phase.id}": trendTimeSeconds ${ms.trendTimeSeconds} outside 10-60 range (will be clamped on export). Use 0 only for initial/entry phase.`);
      }
    }

    // HR vs rhythm label
    if (ms.ecgRhythm && ms.hr !== undefined) {
      if (ms.ecgRhythm === 'Sinus Bradycardia' && ms.hr >= 60) {
        warnings.push(`Phase "${phase.id}": HR ${ms.hr} inconsistent with Sinus Bradycardia (expected <60)`);
      }
      if (ms.ecgRhythm === 'Sinus Tachycardia' && ms.hr <= 100) {
        warnings.push(`Phase "${phase.id}": HR ${ms.hr} inconsistent with Sinus Tachycardia (expected >100)`);
      }
      if (ms.ecgRhythm === 'Normal Sinus Rhythm' && (ms.hr < 60 || ms.hr > 100)) {
        warnings.push(`Phase "${phase.id}": HR ${ms.hr} outside normal range for Normal Sinus Rhythm (60-100)`);
      }
    }

    // AVPU/GCS consistency
    const cp = phase.clinicalPresentation;
    if (cp?.avpu && cp?.gcs) {
      const total = cp.gcs.eye + cp.gcs.verbal + cp.gcs.motor;
      if (cp.avpu === 'Unresponsive' && total > 6) {
        warnings.push(`Phase "${phase.id}": AVPU "Unresponsive" but GCS ${total} (expected <=6)`);
      }
      if (cp.avpu === 'Alert' && total < 14) {
        warnings.push(`Phase "${phase.id}": AVPU "Alert" but GCS ${total} (expected >=14)`);
      }
    }

    // Skin vs hemodynamics
    if (cp?.skin && ms) {
      const skinDesc = [cp.skin.color, cp.skin.temperature, cp.skin.moisture].filter(Boolean).join(' ').toLowerCase();
      if (ms.bpSys !== undefined && ms.bpSys < 90 && ms.hr !== undefined && ms.hr > 100) {
        if (skinDesc.includes('warm') && skinDesc.includes('pink') && skinDesc.includes('dry')) {
          warnings.push(`Phase "${phase.id}": warm/pink/dry skin inconsistent with hypotension + tachycardia`);
        }
      }
    }
  }

  // Weight
  const w = scenario.patient?.weight;
  if (w !== undefined && (typeof w !== 'number' || w <= 0)) {
    warnings.push(`patient.weight ${w} is invalid`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Main
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node validate.js <unified.json>');
  process.exit(1);
}

const scenario = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf-8'));
const result = validate(scenario);

for (const w of result.warnings) console.log(`  WARNING: ${w}`);
for (const e of result.errors) console.log(`  ERROR: ${e}`);

if (result.valid) {
  console.log(`  VALID (${result.warnings.length} warning(s), 0 errors)`);
  process.exit(0);
} else {
  console.log(`  INVALID (${result.warnings.length} warning(s), ${result.errors.length} error(s))`);
  process.exit(1);
}
