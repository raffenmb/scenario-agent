// src/types/schema.ts

// --- Unified Scenario Schema Types ---

export interface UnifiedScenario {
  meta: ScenarioMeta;
  patient: Patient;
  scene: Scene;
  phases: Phase[];
  assessment: Assessment;
  debriefing: Debriefing;
  realiti?: RealitiConfig;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  version?: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  category?: string;
  protocols: string[];
  totalTimeSeconds: number;
  createdAt?: string;
  tags?: string[];
}

export interface Patient {
  name: string;
  age: number;
  ageUnit?: string;
  sex: "male" | "female";
  weight: number;
  height: number;
  chiefComplaint: string;
  history: PatientHistory;
}

export interface PatientHistory {
  hpi?: string;
  pastMedical?: string[];
  medications?: string[];
  allergies?: string[];
  lastOralIntake?: string;
  events?: string;
}

export interface Scene {
  location?: string;
  time?: string;
  safety?: string;
  bystanders?: string;
  visualCues?: string[];
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  triggerCondition?: string;
  isDefault?: boolean;
  transitions?: Transition[];
  clinicalPresentation: ClinicalPresentation;
  monitorState: MonitorState;
  expectedActions?: ExpectedAction[];
}

export interface Transition {
  targetPhaseId: string;
  condition: string;
  conditionType?: "action_not_taken" | "action_taken" | "time_elapsed" | "vital_threshold";
  timeoutSeconds?: number;
  triggerActionIds?: string[];
}

export interface ClinicalPresentation {
  avpu?: "Alert" | "Verbal" | "Pain" | "Unresponsive";
  gcs?: { eye: number; verbal: number; motor: number };
  airway?: string;
  breathing?: string;
  circulation?: string;
  skin?: { color?: string; temperature?: string; moisture?: string };
  pupils?: string;
  motorFunction?: string;
  otherFindings?: string[];
  patientSpeech?: string;
}

export interface MonitorState {
  ecgRhythm?: string;
  ecgWaveform?: number;
  hr?: number;
  bpSys?: number;
  bpDia?: number;
  respRate?: number;
  spo2?: number;
  etco2?: number;
  temp?: number;
  obstruction?: number;
  glucose?: number;
  customMeasures?: { label: string; value: number }[];
  trendTimeSeconds?: number;
  visibility?: MonitorVisibility;
}

export interface MonitorVisibility {
  spo2Visible?: boolean;
  spo2Attached?: boolean;
  rrVisible?: boolean;
  etco2Visible?: boolean;
  cvpVisible?: boolean;
}

export interface ExpectedAction {
  id: string;
  action: string;
  priority: "critical" | "important" | "supplemental";
  rationale?: string;
  protocolReference?: string;
}

export interface Assessment {
  criticalActions?: string[];
  expectedActions?: string[];
  bonusActions?: string[];
}

export interface Debriefing {
  learningObjectives?: string[];
  discussionQuestions?: string[];
  commonPitfalls?: string[];
  keyTakeaways?: string[];
}

export interface RealitiConfig {
  scenarioMonitorType?: number;
  scenarioDefaultEnergy?: number;
  scenarioDefaultPacerThreshold?: number;
}

// --- ECG Code Table ---

export const ECG_RHYTHM_CODES: Record<string, number> = {
  "Normal Sinus Rhythm": 9,
  "Sinus Bradycardia": 9,
  "Sinus Tachycardia": 9,
  "Asystole": 3,
  "Pulseless Electrical Activity (PEA)": 9,
  "Ventricular Fibrillation (Fine)": 18,
  "Ventricular Fibrillation (Coarse)": 18,
  "Ventricular Tachycardia (Monomorphic)": 12,
  "Ventricular Tachycardia (Polymorphic)": 12,
  "Torsades de Pointes": 12,
  "Atrial Fibrillation": 38,
  "Atrial Flutter": 1,
  "Supraventricular Tachycardia": 4,
  "First Degree AV Block": 5,
  "Second Degree AV Block Type I": 6,
  "Second Degree AV Block Type II": 103,
  "AV Block Type II 2:1": 40,
  "Third Degree Heart Block": 100,
  "Idioventricular Rhythm": 91,
  "Accelerated Idioventricular Rhythm": 91,
  "Accelerated Junctional Rhythm": 79,
  "Left Bundle Branch Block": 80,
  "Right Bundle Branch Block": 82,
  "Wolff-Parkinson-White": 84,
  "Pacemaker Rhythm": 9,
  "Pacemaker Failure to Capture": 9,
  "Hyperkalemia Changes": 20,
  "Hypokalemia Changes": 21,
  "STEMI Anterior": 23,
  "STEMI Inferior": 24,
  "STEMI Lateral": 25,
  "STEMI Posterior": 26,
  "NSTEMI": 55,
  "Pericarditis": 22,
  "Brugada Syndrome": 35,
  "Wellens Syndrome": 36,
  "Early Repolarization": 41,
  "Pulmonary Embolism (S1Q3T3)": 45,
  "Long QT Syndrome": 37,
  "PVC": 49,
  "Atrial Tachycardia": 4,
  "Sinus Arrest": 3,
};

export const SHOCKABLE_CODES = new Set([18, 12]);
export const ARREST_WAVEFORM_CODES = new Set([18, 3]);

// --- Protocol Index Entry ---

export interface ProtocolEntry {
  slug: string;
  section: string;
  description: string;
  filePath: string;
}

// --- Validation Result ---

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

// --- Protocol Selection Result ---

export interface ProtocolSelection {
  slug: string;
  rationale: string;
}
