// src/export/html.ts
import fs from "fs";
import path from "path";
import { UnifiedScenario, Phase } from "../types/schema";

const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/scenario.html");

export function exportHtml(scenario: UnifiedScenario): string {
  const css = extractCss();
  const js = buildJs(scenario);
  const body = buildBody(scenario);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>${escHtml(scenario.meta.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>`;
}

function extractCss(): string {
  let css = "";
  try {
    const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    const match = template.match(/<style>([\s\S]*?)<\/style>/);
    css = match ? match[1] : "";
  } catch {
    css = "body { font-family: sans-serif; padding: 20px; }";
  }

  // Ensure hint styles exist (may not be in the static template)
  if (!css.includes("timer-widget")) {
    css += `
.action-priority{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px}
.priority-critical{background:var(--red-light,#fef2f2);color:var(--red,#dc2626)}
.priority-important{background:var(--orange-light,#fff7ed);color:var(--orange,#ea580c)}
.priority-supplemental{background:#f5f5f4;color:var(--text-muted,#a8a29e)}
.action-check{width:18px;height:18px;flex-shrink:0}
.top-bar-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.timer-widget{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
#timer-display{font-family:'DM Mono',monospace;font-size:20px;font-weight:700;color:var(--text-muted,#a8a29e);font-variant-numeric:tabular-nums;line-height:1}
.timer-controls{display:flex;gap:4px}
.timer-btn{font-family:'DM Mono',monospace;font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;border:1px solid var(--card-border,#e8e6e1);background:var(--card,#fff);color:var(--text-secondary,#57534e);cursor:pointer;line-height:1.4}
.timer-btn:hover{background:#f5f5f4}
.timer-btn-stop{border-color:var(--red-border,#fecaca);color:var(--red,#dc2626)}
.timer-btn-stop:hover{background:var(--red-light,#fef2f2)}
#timer-display.timer-warn{color:var(--orange,#ea580c)}
#timer-display.timer-danger{color:var(--red,#dc2626)}
.debrief-phase-card{overflow:hidden}
.debrief-phase-header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px}
.debrief-phase-name{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted,#a8a29e)}
.debrief-phase-score{font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--text-muted,#a8a29e)}
.debrief-phase-score.score-perfect{color:var(--green,#16a34a)}
.debrief-phase-score.score-none{color:var(--red,#dc2626)}
.debrief-phase-body{padding:0 16px 14px}
.debrief-done-section{background:var(--green-light,#f0fdf4);border:1px solid var(--green-border,#bbf7d0);border-radius:var(--radius-sm,10px);padding:6px 12px;margin-bottom:10px}
.debrief-done-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:var(--green,#16a34a)}
.debrief-done-icon{font-weight:700;flex-shrink:0;font-size:12px}
.debrief-done-text{color:var(--text-secondary,#57534e)}
.debrief-missed-label{font-family:'DM Mono',monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--red,#dc2626);padding:4px 0 8px}
.debrief-missed-row{background:var(--red-light,#fef2f2);border:1px solid var(--red-border,#fecaca);border-radius:var(--radius-sm,10px);padding:10px 12px;margin-bottom:6px}
.debrief-missed-row:last-child{margin-bottom:0}
.debrief-missed-top{display:flex;align-items:center;gap:8px}
.debrief-missed-text{font-size:14px;font-weight:600;color:var(--text,#1c1917)}
.debrief-missed-detail{padding:6px 0 0 0;margin-top:6px;border-top:1px solid var(--red-border,#fecaca)}
.debrief-missed-rationale{font-size:12px;color:var(--text-secondary,#57534e);line-height:1.4}
.debrief-missed-protocol{font-family:'DM Mono',monospace;font-size:11px;color:var(--blue,#2563eb);margin-top:2px}
`;
  }

  return css;
}

function buildBody(scenario: UnifiedScenario): string {
  const s = scenario;
  const allPhases = s.phases;

  return `
<div class="top-bar">
  <div class="top-bar-header">
    <div>
      <div class="scenario-name">${escHtml(s.meta.name)}</div>
      <div class="scenario-tags">
        <span class="tag tag-difficulty">${escHtml(s.meta.difficulty)}</span>
        ${s.meta.category ? `<span class="tag tag-category">${escHtml(s.meta.category)}</span>` : ""}
      </div>
    </div>
    <div class="timer-widget" id="scenario-timer" data-total="${s.meta.totalTimeSeconds}">
      <span id="timer-display">${Math.floor(s.meta.totalTimeSeconds / 60)}:${String(s.meta.totalTimeSeconds % 60).padStart(2, "0")}</span>
      <div class="timer-controls">
        <button id="timer-start" class="timer-btn" onclick="timerStart()">start</button>
        <button id="timer-pause" class="timer-btn" onclick="timerPause()" style="display:none">pause</button>
        <button id="timer-stop" class="timer-btn timer-btn-stop" onclick="timerStop()" style="display:none">stop</button>
        <button id="timer-reset" class="timer-btn" onclick="timerReset()" style="display:none">reset</button>
      </div>
    </div>
  </div>
  <div class="phase-strip">
    <div class="phase-tab active" data-panel="scene" onclick="showPanel(this, 'scene')">Scene</div>
    ${allPhases.map((p) => `<div class="phase-tab${p.isDefault === false ? " branch" : ""}" data-panel="phase-${p.id}" onclick="showPanel(this, 'phase-${p.id}')">${escHtml(p.name)}</div>`).join("\n    ")}
    <div class="phase-tab" data-panel="debrief" onclick="showPanel(this, 'debrief')">Debrief</div>
  </div>
</div>
<div class="content">
  ${buildScenePanel(s)}
  ${allPhases.map((p, i) => buildPhasePanel(p, i === 0 ? s.patient : undefined)).join("\n")}
  ${buildDebriefPanel(s)}
</div>`;
}

function buildScenePanel(s: UnifiedScenario): string {
  const scene = s.scene;
  const p = s.patient;

  return `
<div class="panel active" id="panel-scene">
  ${scene?.dispatch ? `<div class="card">
    <div class="card-title">Dispatch</div>
    <div class="card-content" style="font-size:14px;color:var(--text-secondary)">${escHtml(scene.dispatch)}</div>
  </div>` : ""}
  <div class="card accordion open" onclick="this.classList.toggle('open')">
    <div class="card-title">Scene Setup</div>
    <div class="accordion-body">
      ${scene?.location ? `<div class="scene-row"><div class="scene-label">Location</div><div class="scene-value">${escHtml(scene.location)}</div></div>` : ""}
      ${scene?.time ? `<div class="scene-row"><div class="scene-label">Time</div><div class="scene-value">${escHtml(scene.time)}</div></div>` : ""}
      ${scene?.safety ? `<div class="scene-row"><div class="scene-label">Safety</div><div class="scene-value">${escHtml(scene.safety)}</div></div>` : ""}
      ${scene?.bystanders ? `<div class="scene-row"><div class="scene-label">Bystanders</div><div class="scene-value">${escHtml(scene.bystanders)}</div></div>` : ""}
      ${scene?.visualCues?.length ? `<div class="scene-row"><div class="scene-label">Visual Cues</div><ul class="cue-list">${scene.visualCues.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul></div>` : ""}
    </div>
  </div>

  <div class="card">
    <div class="card-title">Patient Information</div>
    <div class="card-content">
      <div class="patient-chips">
        <div class="patient-chip"><strong>${escHtml(p.name)}</strong></div>
        <div class="patient-chip">${p.age} ${p.ageUnit ?? "years"}</div>
        <div class="patient-chip">${p.sex}</div>
        <div class="patient-chip">${p.weight}kg</div>
        <div class="patient-chip">${p.height}cm</div>
      </div>
    </div>
  </div>

</div>`;
}

function buildPhasePanel(phase: Phase, patient?: import("../types/schema").Patient): string {
  const cp = phase.clinicalPresentation;
  const ms = phase.monitorState;
  const isBranch = phase.isDefault === false;

  const avpuMap: Record<string, string> = { Alert: "sel-a", Verbal: "sel-v", Pain: "sel-p", Unresponsive: "sel-u" };

  return `
<div class="panel" id="panel-phase-${phase.id}">
  <div class="card phase-card${isBranch ? " branch-card" : ""}">
    <div class="card-content">
      <div class="phase-title">${escHtml(phase.name)}</div>
      ${phase.triggerCondition ? `<div class="phase-trigger">▸ ${escHtml(phase.triggerCondition)}</div>` : ""}
      <div class="phase-desc">${escHtml(phase.description)}</div>
    </div>
  </div>

  ${cp?.airway || cp?.breathing || cp?.circulation ? `
  <div class="card">
    <div class="card-title">Primary Survey (ABCs)</div>
    <div class="card-content">
      ${cp.airway ? `<div class="finding-row"><div class="finding-label">Airway</div><div class="finding-value">${escHtml(cp.airway)}</div></div>` : ""}
      ${cp.breathing ? `<div class="finding-row"><div class="finding-label">Breathing</div><div class="finding-value">${escHtml(cp.breathing)}</div></div>` : ""}
      ${cp.circulation ? `<div class="finding-row"><div class="finding-label">Circulation</div><div class="finding-value">${escHtml(cp.circulation)}</div></div>` : ""}
    </div>
  </div>` : ""}

  ${cp?.avpu ? `
  <div class="card">
    <div class="card-title">Level of Consciousness</div>
    <div class="card-content">
      <div class="avpu-bar">
        ${["Alert", "Verbal", "Pain", "Unresponsive"].map((level) => `<div class="avpu-seg${cp.avpu === level ? ` ${avpuMap[level]}` : ""}">${level[0]}</div>`).join("")}
      </div>
      ${cp.gcs ? `<div class="gcs-row">GCS: E${cp.gcs.eye} V${cp.gcs.verbal} M${cp.gcs.motor} = <span class="gcs-total">${cp.gcs.eye + cp.gcs.verbal + cp.gcs.motor}</span></div>` : ""}
    </div>
  </div>` : ""}

  <div class="card">
    <div class="card-title">Vital Signs</div>
    <div class="card-content">
      <div class="vitals-grid">
        ${vitalCell("HR", ms.hr, "bpm")}
        ${vitalCell("BP", ms.bpSys && ms.bpDia ? `${ms.bpSys}/${ms.bpDia}` : undefined, "mmHg")}
        ${vitalCell("RR", ms.respRate, "/min")}
        ${vitalCell("SpO2", ms.spo2, "%")}
        ${vitalCell("EtCO2", ms.etco2, "mmHg")}
        ${vitalCell("Temp", ms.temp, "°C")}
        ${ms.glucose !== undefined ? vitalCell("Glucose", ms.glucose, "mg/dL") : ""}
      </div>
      ${ms.ecgRhythm ? `<div class="ecg-label">ECG: ${escHtml(ms.ecgRhythm)}</div>` : ""}
    </div>
  </div>

  ${cp ? `
  <div class="card">
    <div class="card-title">Physical Findings</div>
    <div class="card-content">
      ${cp.airway ? `<div class="finding-row"><div class="finding-label">Airway</div><div class="finding-value">${escHtml(cp.airway)}</div></div>` : ""}
      ${cp.breathing ? `<div class="finding-row"><div class="finding-label">Breathing</div><div class="finding-value">${escHtml(cp.breathing)}</div></div>` : ""}
      ${cp.circulation ? `<div class="finding-row"><div class="finding-label">Circulation</div><div class="finding-value">${escHtml(cp.circulation)}</div></div>` : ""}
      ${cp.skin ? `<div class="finding-row"><div class="finding-label">Skin</div><div class="skin-chips">${[cp.skin.color, cp.skin.temperature, cp.skin.moisture].filter(Boolean).map((s) => `<span class="skin-chip">${escHtml(s!)}</span>`).join("")}</div></div>` : ""}
      ${cp.pupils ? `<div class="finding-row"><div class="finding-label">Pupils</div><div class="finding-value">${escHtml(cp.pupils)}</div></div>` : ""}
      ${cp.motorFunction ? `<div class="finding-row"><div class="finding-label">Motor</div><div class="finding-value">${escHtml(cp.motorFunction)}</div></div>` : ""}
      ${cp.patientSpeech ? `<div class="finding-row"><div class="finding-label">Speech</div><div class="finding-value speech">"${escHtml(cp.patientSpeech)}"</div></div>` : ""}
      ${cp.otherFindings?.length ? `<ul class="findings-notes">${cp.otherFindings.map((f) => `<li>${escHtml(f)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>` : ""}

  ${patient ? `
  <div class="card">
    <div class="card-title">SAMPLE History</div>
    <div class="card-content">
      <div class="sample-grid">
        <div class="sample-cell full"><span class="sample-letter">S</span><div class="sample-name">Signs/Symptoms</div><div class="sample-text">${escHtml(patient.chiefComplaint)}</div></div>
        <div class="sample-cell"><span class="sample-letter">A</span><div class="sample-name">Allergies</div><div class="sample-text">${escHtml((patient.history.allergies ?? []).join(", ") || "NKDA")}</div></div>
        <div class="sample-cell"><span class="sample-letter">M</span><div class="sample-name">Medications</div><div class="sample-text">${escHtml((patient.history.medications ?? []).join(", ") || "None")}</div></div>
        <div class="sample-cell"><span class="sample-letter">P</span><div class="sample-name">Past Medical</div><div class="sample-text">${escHtml((patient.history.pastMedical ?? []).join(", ") || "None")}</div></div>
        <div class="sample-cell"><span class="sample-letter">L</span><div class="sample-name">Last Oral Intake</div><div class="sample-text">${escHtml(patient.history.lastOralIntake ?? "Unknown")}</div></div>
        <div class="sample-cell full"><span class="sample-letter">E</span><div class="sample-name">Events</div><div class="sample-text">${escHtml(patient.history.events ?? patient.history.hpi ?? "")}</div></div>
      </div>
    </div>
  </div>` : ""}

  ${phase.expectedActions?.length ? `
  <div class="card">
    <div class="card-title">Expected Actions</div>
    <div class="card-content">
      ${phase.expectedActions.map((a) => `
      <div class="action-card" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f4">
        <input type="checkbox" class="action-check" data-action-id="${a.id}" data-phase-id="${phase.id}">
        <span class="action-priority priority-${a.priority}">${a.priority.toUpperCase()}</span>
        <span class="action-text">${escHtml(a.action)}</span>
      </div>`).join("")}
    </div>
  </div>` : ""}
</div>`;
}

function buildDebriefPanel(s: UnifiedScenario): string {
  const d = s.debriefing;
  return `
<div class="panel" id="panel-debrief">
  ${(d.learningObjectives ?? []).length ? `
  <div class="card accordion" onclick="this.classList.toggle('open')">
    <div class="card-title">Learning Objectives</div>
    <div class="accordion-body"><ul class="findings-notes">${(d.learningObjectives ?? []).map((o) => `<li>${escHtml(o)}</li>`).join("")}</ul></div>
  </div>` : ""}
  <div id="debrief-actions" style="display:flex;flex-direction:column;gap:12px"></div>
</div>`;
}

function vitalCell(name: string, value: number | string | undefined, unit: string): string {
  if (value === undefined) return "";
  return `<div class="vital-cell"><div class="vital-name">${name}</div><div class="vital-val">${value}</div><div class="vital-unit">${unit}</div></div>`;
}

function buildJs(scenario: UnifiedScenario): string {
  // Build phase action metadata for debrief summary
  const firstPhaseId = scenario.phases[0]?.id ?? "";
  const phaseActionData = JSON.stringify(
    scenario.phases
      .filter((p) => p.expectedActions?.length)
      .map((p) => ({
        phaseId: p.id,
        phaseName: p.name,
        actions: p.expectedActions!.map((a) => ({
          id: a.id,
          action: a.action,
          priority: a.priority,
          rationale: a.rationale ?? "",
          protocolReference: a.protocolReference ?? "",
        })),
      }))
  );

  return `
var phaseActionData = ${phaseActionData};
var firstPhaseId = ${JSON.stringify(firstPhaseId)};

function showPanel(tab, panelId) {
  document.querySelectorAll('.phase-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  var panel = document.getElementById('panel-' + panelId);
  if (panel) panel.classList.add('active');
  if (panelId === 'debrief') buildDebriefActions();
}

function buildDebriefActions() {
  var container = document.getElementById('debrief-actions');
  if (!container) return;
  container.innerHTML = '';

  phaseActionData.forEach(function(phase) {
    var isFirst = phase.phaseId === firstPhaseId;
    var checkboxes = phase.actions.map(function(a) {
      return document.querySelector('[data-action-id="' + a.id + '"][data-phase-id="' + phase.phaseId + '"]');
    });
    var anyChecked = checkboxes.some(function(cb) { return cb && cb.checked; });

    if (!isFirst && !anyChecked) return;

    var doneActions = [];
    var missedActions = [];
    phase.actions.forEach(function(a, i) {
      var cb = checkboxes[i];
      if (cb && cb.checked) doneActions.push(a);
      else missedActions.push(a);
    });
    var total = phase.actions.length;
    var doneCount = doneActions.length;

    var card = document.createElement('div');
    card.className = 'card debrief-phase-card';

    // Phase header with score
    var header = document.createElement('div');
    header.className = 'debrief-phase-header';
    var hLeft = document.createElement('div');
    hLeft.className = 'debrief-phase-name';
    hLeft.textContent = phase.phaseName;
    var hRight = document.createElement('div');
    hRight.className = 'debrief-phase-score';
    if (doneCount === total) {
      hRight.classList.add('score-perfect');
    } else if (doneCount === 0) {
      hRight.classList.add('score-none');
    }
    hRight.textContent = doneCount + '/' + total;
    header.appendChild(hLeft);
    header.appendChild(hRight);
    card.appendChild(header);

    var body = document.createElement('div');
    body.className = 'debrief-phase-body';

    // Completed actions — compact green strip
    if (doneActions.length) {
      var doneSection = document.createElement('div');
      doneSection.className = 'debrief-done-section';
      doneActions.forEach(function(a) {
        var row = document.createElement('div');
        row.className = 'debrief-done-row';
        row.innerHTML = '<span class="debrief-done-icon">\\u2713</span><span class="debrief-done-text">' + a.action + '</span>';
        doneSection.appendChild(row);
      });
      body.appendChild(doneSection);
    }

    // Missed actions — prominent red treatment
    if (missedActions.length) {
      var missLabel = document.createElement('div');
      missLabel.className = 'debrief-missed-label';
      missLabel.textContent = 'MISSED';
      body.appendChild(missLabel);

      missedActions.forEach(function(a) {
        var row = document.createElement('div');
        row.className = 'debrief-missed-row';

        var top = document.createElement('div');
        top.className = 'debrief-missed-top';
        var badge = document.createElement('span');
        badge.className = 'action-priority priority-' + a.priority;
        badge.textContent = a.priority.toUpperCase();
        var text = document.createElement('span');
        text.className = 'debrief-missed-text';
        text.textContent = a.action;
        top.appendChild(badge);
        top.appendChild(text);
        row.appendChild(top);

        if (a.rationale || a.protocolReference) {
          var detail = document.createElement('div');
          detail.className = 'debrief-missed-detail';
          if (a.rationale) {
            var reason = document.createElement('div');
            reason.className = 'debrief-missed-rationale';
            reason.textContent = a.rationale;
            detail.appendChild(reason);
          }
          if (a.protocolReference) {
            var proto = document.createElement('div');
            proto.className = 'debrief-missed-protocol';
            proto.textContent = 'Protocol: ' + a.protocolReference;
            detail.appendChild(proto);
          }
          row.appendChild(detail);
        }
        body.appendChild(row);
      });
    }

    card.appendChild(body);
    container.appendChild(card);
  });
}

// Accordion toggle
document.querySelectorAll('.accordion').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (e.target.type === 'checkbox') return;
  });
});

// Timer
var timerEl = document.getElementById('scenario-timer');
var timerTotal = timerEl ? parseInt(timerEl.getAttribute('data-total')) : 0;
var timerRemaining = timerTotal;
var timerInterval = null;

function timerFormat(s) {
  var m = Math.floor(s / 60);
  var sec = s % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function timerUpdate() {
  var d = document.getElementById('timer-display');
  if (!d) return;
  d.textContent = timerFormat(timerRemaining);
  d.classList.remove('timer-warn', 'timer-danger');
  if (timerRemaining <= 60) d.classList.add('timer-danger');
  else if (timerRemaining <= timerTotal * 0.25) d.classList.add('timer-warn');
}

function timerStart() {
  document.getElementById('timer-start').style.display = 'none';
  document.getElementById('timer-pause').style.display = '';
  document.getElementById('timer-stop').style.display = '';
  document.getElementById('timer-reset').style.display = 'none';
  timerInterval = setInterval(function() {
    timerRemaining--;
    timerUpdate();
    if (timerRemaining <= 0) { timerRemaining = 0; timerStop(); }
  }, 1000);
}

function timerPause() {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('timer-pause').style.display = 'none';
  document.getElementById('timer-start').style.display = '';
}

function timerStop() {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('timer-start').style.display = 'none';
  document.getElementById('timer-pause').style.display = 'none';
  document.getElementById('timer-stop').style.display = 'none';
  document.getElementById('timer-reset').style.display = '';
}

function timerReset() {
  timerRemaining = timerTotal;
  timerUpdate();
  document.getElementById('timer-reset').style.display = 'none';
  document.getElementById('timer-start').style.display = '';
}
`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
