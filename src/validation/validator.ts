import {
  UnifiedScenario,
  ValidationResult,
  ValidationIssue,
  ECG_RHYTHM_CODES,
  SHOCKABLE_CODES,
  ARREST_WAVEFORM_CODES,
} from "../types/schema";

export function validateScenario(scenario: UnifiedScenario): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  validateRequired(scenario, errors);
  validatePhaseReferences(scenario, errors);
  validateDefaultPath(scenario, errors);
  validateEntryPhase(scenario, errors);

  for (const phase of scenario.phases) {
    validateMonitorState(phase, errors, warnings);
    validateClinicalConsistency(phase, warnings);
  }

  validateWeight(scenario, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

function validateRequired(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  if (!scenario.meta?.id) errors.push({ path: "meta.id", message: "meta.id is required" });
  if (!scenario.meta?.name) errors.push({ path: "meta.name", message: "meta.name is required" });
  if (!scenario.meta?.difficulty) errors.push({ path: "meta.difficulty", message: "meta.difficulty is required" });
  if (!scenario.meta?.protocols?.length) errors.push({ path: "meta.protocols", message: "meta.protocols must have at least one entry" });
  if (!scenario.meta?.totalTimeSeconds) errors.push({ path: "meta.totalTimeSeconds", message: "meta.totalTimeSeconds is required" });
  if (!scenario.patient?.name) errors.push({ path: "patient.name", message: "patient.name is required" });
  if (!scenario.patient?.chiefComplaint) errors.push({ path: "patient.chiefComplaint", message: "patient.chiefComplaint is required" });
  if (!scenario.phases?.length) errors.push({ path: "phases", message: "At least one phase is required" });
}

function validatePhaseReferences(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  const phaseIds = new Set(scenario.phases.map((p) => p.id));

  for (const phase of scenario.phases) {
    if (!phase.transitions) continue;
    for (const transition of phase.transitions) {
      if (!phaseIds.has(transition.targetPhaseId)) {
        errors.push({
          path: `phases[${phase.id}].transitions`,
          message: `Transition targetPhaseId "${transition.targetPhaseId}" does not match any phase id`,
        });
      }
    }
  }

  // Circular reference check
  for (const phase of scenario.phases) {
    if (hasCircularPath(phase.id, scenario.phases, new Set())) {
      errors.push({
        path: `phases[${phase.id}]`,
        message: `Circular reference detected starting from phase "${phase.id}"`,
      });
      break;
    }
  }
}

function hasCircularPath(startId: string, phases: UnifiedScenario["phases"], visited: Set<string>): boolean {
  if (visited.has(startId)) return true;
  visited.add(startId);
  const phase = phases.find((p) => p.id === startId);
  if (!phase?.transitions) return false;
  for (const t of phase.transitions) {
    if (hasCircularPath(t.targetPhaseId, phases, new Set(visited))) return true;
  }
  return false;
}

function validateDefaultPath(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  const defaultPhases = scenario.phases.filter((p) => p.isDefault === true || p.isDefault === undefined);
  if (defaultPhases.length === 0) {
    errors.push({ path: "phases", message: "No default path phases found" });
  }
}

function validateEntryPhase(scenario: UnifiedScenario, errors: ValidationIssue[]) {
  const hasEntry = scenario.phases.some((p) => !p.triggerCondition);
  if (!hasEntry) {
    errors.push({ path: "phases", message: "No entry phase found — at least one phase must lack triggerCondition" });
  }
}

function validateMonitorState(phase: UnifiedScenario["phases"][0], errors: ValidationIssue[], warnings: ValidationIssue[]) {
  const ms = phase.monitorState;
  if (!ms) return;

  // ECG waveform vs rhythm
  if (ms.ecgRhythm && ms.ecgWaveform !== undefined) {
    const expectedCode = ECG_RHYTHM_CODES[ms.ecgRhythm];
    if (expectedCode !== undefined && expectedCode !== ms.ecgWaveform) {
      errors.push({
        path: `phases[${phase.id}].monitorState`,
        message: `ecgWaveform ${ms.ecgWaveform} does not match ecgRhythm "${ms.ecgRhythm}" (expected ${expectedCode})`,
      });
    }
  }

  // Cardiac arrest detection
  const isArrestByWaveform = ms.ecgWaveform !== undefined && ARREST_WAVEFORM_CODES.has(ms.ecgWaveform);
  const isArrestByVitals = ms.hr === 0 && ms.bpSys === 0 && ms.bpDia === 0;

  if (isArrestByWaveform || isArrestByVitals) {
    if (ms.spo2 !== undefined && ms.spo2 !== 0) {
      errors.push({
        path: `phases[${phase.id}].monitorState`,
        message: `Cardiac arrest detected but spo2 is ${ms.spo2} (must be 0)`,
      });
    }
    if (ms.visibility?.spo2Visible !== false) {
      errors.push({
        path: `phases[${phase.id}].monitorState.visibility`,
        message: `Cardiac arrest detected but spo2Visible is not false`,
      });
    }
  }

  // Obstruction range
  if (ms.obstruction !== undefined && (ms.obstruction < 0 || ms.obstruction > 100)) {
    errors.push({
      path: `phases[${phase.id}].monitorState.obstruction`,
      message: `Obstruction ${ms.obstruction} out of range 0-100`,
    });
  }

  // HR vs rhythm label warnings
  if (ms.ecgRhythm && ms.hr !== undefined) {
    if (ms.ecgRhythm === "Sinus Bradycardia" && ms.hr >= 60) {
      warnings.push({
        path: `phases[${phase.id}].monitorState`,
        message: `HR ${ms.hr} inconsistent with ecgRhythm "Sinus Bradycardia" (expected <60)`,
      });
    }
    if (ms.ecgRhythm === "Sinus Tachycardia" && ms.hr <= 100) {
      warnings.push({
        path: `phases[${phase.id}].monitorState`,
        message: `HR ${ms.hr} inconsistent with ecgRhythm "Sinus Tachycardia" (expected >100)`,
      });
    }
    if (ms.ecgRhythm === "Normal Sinus Rhythm" && (ms.hr < 60 || ms.hr > 100)) {
      warnings.push({
        path: `phases[${phase.id}].monitorState`,
        message: `HR ${ms.hr} outside normal range for "Normal Sinus Rhythm" (expected 60-100)`,
      });
    }
  }
}

function validateClinicalConsistency(phase: UnifiedScenario["phases"][0], warnings: ValidationIssue[]) {
  const cp = phase.clinicalPresentation;
  if (!cp) return;

  if (cp.avpu && cp.gcs) {
    const gcsTotal = cp.gcs.eye + cp.gcs.verbal + cp.gcs.motor;
    if (cp.avpu === "Unresponsive" && gcsTotal > 6) {
      warnings.push({
        path: `phases[${phase.id}].clinicalPresentation`,
        message: `AVPU is "Unresponsive" but GCS total is ${gcsTotal} (expected ≤6)`,
      });
    }
    if (cp.avpu === "Alert" && gcsTotal < 14) {
      warnings.push({
        path: `phases[${phase.id}].clinicalPresentation`,
        message: `AVPU is "Alert" but GCS total is ${gcsTotal} (expected ≥14)`,
      });
    }
  }

  // Skin signs vs vitals
  const ms = phase.monitorState;
  if (cp.skin && ms) {
    const skinDesc = [cp.skin.color, cp.skin.temperature, cp.skin.moisture].filter(Boolean).join(" ").toLowerCase();
    if (ms.bpSys !== undefined && ms.bpSys < 90 && ms.hr !== undefined && ms.hr > 100) {
      if (skinDesc.includes("warm") && skinDesc.includes("pink") && skinDesc.includes("dry")) {
        warnings.push({
          path: `phases[${phase.id}].clinicalPresentation.skin`,
          message: `Skin signs "warm, pink, dry" inconsistent with hypotension (BP ${ms.bpSys}) and tachycardia (HR ${ms.hr})`,
        });
      }
    }
  }
}

function validateWeight(scenario: UnifiedScenario, warnings: ValidationIssue[]) {
  const w = scenario.patient?.weight;
  if (w !== undefined && (typeof w !== "number" || w <= 0)) {
    warnings.push({ path: "patient.weight", message: `Weight ${w} is invalid (must be a positive number)` });
  }
}
