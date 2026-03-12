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
  if (!css.includes("hint-branch")) {
    css += `
.phase-tab.hint-branch .hint-dot{display:block;background:var(--red,#dc2626);animation:pulse-hint 1s infinite}
.phase-tab.hint-next .hint-dot{display:block;background:var(--green,#16a34a);animation:pulse-hint 1.5s infinite}
@keyframes pulse-hint{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
.hint-dot{display:none;width:7px;height:7px;border-radius:50%;position:absolute;top:6px;right:4px}
.action-priority{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px}
.priority-critical{background:var(--red-light,#fef2f2);color:var(--red,#dc2626)}
.priority-important{background:var(--orange-light,#fff7ed);color:var(--orange,#ea580c)}
.priority-supplemental{background:#f5f5f4;color:var(--text-muted,#a8a29e)}
.action-check{width:18px;height:18px;flex-shrink:0}
`;
  }

  return css;
}

function buildBody(scenario: UnifiedScenario): string {
  const s = scenario;
  const allPhases = s.phases;

  return `
<div class="top-bar">
  <div class="scenario-name">${escHtml(s.meta.name)}</div>
  <div class="scenario-tags">
    <span class="tag tag-difficulty">${escHtml(s.meta.difficulty)}</span>
    ${s.meta.category ? `<span class="tag tag-category">${escHtml(s.meta.category)}</span>` : ""}
    <span class="tag tag-time">${Math.round(s.meta.totalTimeSeconds / 60)} min</span>
  </div>
  <div class="phase-strip">
    <div class="phase-tab active" data-panel="scene" onclick="showPanel(this, 'scene')">Scene<span class="hint-dot"></span></div>
    ${allPhases.map((p) => `<div class="phase-tab${p.isDefault === false ? " branch" : ""}" data-panel="phase-${p.id}" onclick="showPanel(this, 'phase-${p.id}')">${escHtml(p.name)}<span class="hint-dot"></span></div>`).join("\n    ")}
    <div class="phase-tab" data-panel="debrief" onclick="showPanel(this, 'debrief')">Debrief<span class="hint-dot"></span></div>
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
  <div class="card accordion" onclick="this.classList.toggle('open')">
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
        <input type="checkbox" class="action-check" data-action-id="${a.id}" data-phase-id="${phase.id}" onclick="updateHints();">
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
  <div id="debrief-actions"></div>
  ${(d.learningObjectives ?? []).length ? `
  <div class="card accordion" onclick="this.classList.toggle('open')">
    <div class="card-title">Learning Objectives</div>
    <div class="accordion-body"><ul class="findings-notes">${(d.learningObjectives ?? []).map((o) => `<li>${escHtml(o)}</li>`).join("")}</ul></div>
  </div>` : ""}
</div>`;
}

function vitalCell(name: string, value: number | string | undefined, unit: string): string {
  if (value === undefined) return "";
  return `<div class="vital-cell"><div class="vital-name">${name}</div><div class="vital-val">${value}</div><div class="vital-unit">${unit}</div></div>`;
}

function buildJs(scenario: UnifiedScenario): string {
  const transitionData = JSON.stringify(
    scenario.phases
      .filter((p) => p.transitions?.length)
      .map((p) => ({
        phaseId: p.id,
        transitions: p.transitions!.map((t) => ({
          targetPhaseId: t.targetPhaseId,
          triggerActionIds: t.triggerActionIds ?? [],
        })),
      }))
  );

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
var transitionData = ${transitionData};
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

function updateHints() {
  document.querySelectorAll('.phase-tab').forEach(t => {
    t.classList.remove('hint-branch', 'hint-next');
  });

  transitionData.forEach(function(phase) {
    phase.transitions.forEach(function(t) {
      if (!t.triggerActionIds.length) return;

      var allCompleted = t.triggerActionIds.every(function(actionId) {
        var checkbox = document.querySelector('[data-action-id="' + actionId + '"]');
        return checkbox && checkbox.checked;
      });

      var targetTab = document.querySelector('[data-panel="phase-' + t.targetPhaseId + '"]');
      if (!targetTab) return;

      if (!allCompleted) {
        targetTab.classList.add('hint-branch');
      }
    });
  });
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

    var card = document.createElement('div');
    card.className = 'card';
    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = phase.phaseName;
    card.appendChild(title);

    var content = document.createElement('div');
    content.className = 'card-content';
    content.style.padding = '4px 16px 12px';

    phase.actions.forEach(function(a, i) {
      var cb = checkboxes[i];
      var done = cb && cb.checked;
      var row = document.createElement('div');
      row.style.cssText = 'padding:8px 0;border-bottom:1px solid #f5f5f4;font-size:14px';
      if (i === phase.actions.length - 1) row.style.borderBottom = 'none';

      var top = document.createElement('div');
      top.style.cssText = 'display:flex;align-items:center;gap:10px';

      var icon = document.createElement('span');
      icon.style.cssText = 'flex-shrink:0;width:20px;text-align:center;font-size:14px';
      icon.textContent = done ? '\\u2713' : '\\u2717';
      icon.style.color = done ? 'var(--green)' : 'var(--red)';
      icon.style.fontWeight = '700';

      var text = document.createElement('span');
      text.textContent = a.action;
      text.style.color = done ? 'var(--text-secondary)' : 'var(--red)';
      if (!done) text.style.fontWeight = '600';

      top.appendChild(icon);
      top.appendChild(text);
      row.appendChild(top);

      if (!done && (a.rationale || a.protocolReference)) {
        var detail = document.createElement('div');
        detail.style.cssText = 'margin:4px 0 0 30px;font-size:12px;line-height:1.4';
        if (a.rationale) {
          var reason = document.createElement('div');
          reason.style.color = 'var(--text-muted)';
          reason.textContent = a.rationale;
          detail.appendChild(reason);
        }
        if (a.protocolReference) {
          var proto = document.createElement('div');
          proto.style.cssText = 'color:var(--blue);margin-top:2px;font-family:DM Mono,monospace;font-size:11px';
          proto.textContent = a.protocolReference;
          detail.appendChild(proto);
        }
        row.appendChild(detail);
      }

      content.appendChild(row);
    });

    card.appendChild(content);
    container.appendChild(card);
  });
}

// Initialize hints
updateHints();

// Accordion toggle
document.querySelectorAll('.accordion').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (e.target.type === 'checkbox') return;
  });
});
`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
