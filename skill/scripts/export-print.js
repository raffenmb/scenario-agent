#!/usr/bin/env node
// export-print.js — Convert unified scenario JSON to a printable (print-optimized) HTML document.
// Sequential layout, no tabs/accordions/timer, page-break hints per phase. Opens in any browser
// and prints cleanly. Skips the debrief (intentional — debrief stays in the interactive HTML).
// Usage: node export-print.js <unified.json> <output.html>

const fs = require('fs');
const path = require('path');

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cToF(c) { if (c === undefined || c === null) return undefined; return Math.round((c * 9/5 + 32) * 10) / 10; }
function kgToLbs(kg) { if (kg === undefined || kg === null) return undefined; return Math.round(kg * 2.20462); }
function cmToFtIn(cm) {
  if (cm === undefined || cm === null) return undefined;
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn - ft * 12);
  if (inches === 12) return `${ft + 1}'0"`;
  return `${ft}'${inches}"`;
}

const GCS_EYE = { 1: 'No response', 2: 'To pain', 3: 'To speech', 4: 'Spontaneous' };
const GCS_VERBAL = { 1: 'No response', 2: 'Incomprehensible sounds', 3: 'Inappropriate words', 4: 'Confused', 5: 'Oriented' };
const GCS_MOTOR = { 1: 'No response', 2: 'Extension (decerebrate)', 3: 'Flexion (decorticate)', 4: 'Withdraws from pain', 5: 'Localizes pain', 6: 'Obeys commands' };

const AVPU_LETTERS = ['A', 'V', 'P', 'U'];
const AVPU_LEVELS = ['Alert', 'Verbal', 'Pain', 'Unresponsive'];

function renderGcs(gcs) {
  const total = gcs.eye + gcs.verbal + gcs.motor;
  return `<div class="gcs-detail">
    <div class="gcs-item"><span class="gcs-part">Eyes</span><span class="gcs-desc">${GCS_EYE[gcs.eye] || '—'}</span><span class="gcs-score">${gcs.eye}</span></div>
    <div class="gcs-item"><span class="gcs-part">Verbal</span><span class="gcs-desc">${GCS_VERBAL[gcs.verbal] || '—'}</span><span class="gcs-score">${gcs.verbal}</span></div>
    <div class="gcs-item"><span class="gcs-part">Motor</span><span class="gcs-desc">${GCS_MOTOR[gcs.motor] || '—'}</span><span class="gcs-score">${gcs.motor}</span></div>
    <div class="gcs-total-row">Total GCS <span class="gcs-total">${total}</span></div>
  </div>`;
}

function renderAvpu(selected) {
  return `<div class="avpu-bar">${AVPU_LEVELS.map((level, i) => {
    const isSel = selected === level;
    const sel = isSel ? ` sel-${level[0].toLowerCase()}` : '';
    return `<div class="avpu-seg${sel}">${AVPU_LETTERS[i]}</div>`;
  }).join('')}</div>`;
}

function vitalCell(name, value, unit, opts) {
  if (value === undefined || value === null || value === '') return '';
  const cls = opts && opts.full ? ' full-width' : '';
  const unitHtml = unit ? `<div class="vital-unit">${escHtml(unit)}</div>` : '';
  return `<div class="vital-cell${cls}"><div class="vital-name">${escHtml(name)}</div><div class="vital-val">${escHtml(String(value))}</div>${unitHtml}</div>`;
}

function renderVitals(ms) {
  if (!ms) return '';
  const bp = (ms.bpSys !== undefined && ms.bpDia !== undefined) ? `${ms.bpSys}/${ms.bpDia}` : undefined;
  const ecg = ms.ecgRhythm ? `<div class="ecg-label">⏦ ${escHtml(ms.ecgRhythm)}</div>` : '';
  return `<div class="card">
    <div class="card-title">Vital Signs</div>
    <div class="card-content" style="padding:0">
      ${ecg}
      <div class="vitals-grid">
        ${vitalCell('HR', ms.hr, 'bpm')}
        ${vitalCell('BP', bp, 'mmHg')}
        ${vitalCell('SpO₂', ms.spo2 !== undefined ? ms.spo2 + '%' : undefined, '')}
        ${vitalCell('RR', ms.respRate, '/min')}
        ${vitalCell('EtCO₂', ms.etco2, 'mmHg')}
        ${vitalCell('Temp', ms.temp !== undefined ? cToF(ms.temp) + '°' : undefined, 'F')}
        ${ms.glucose !== undefined ? vitalCell('Glucose', ms.glucose, 'mg/dL', { full: true }) : ''}
      </div>
    </div>
  </div>`;
}

function renderFindings(cp) {
  if (!cp) return '';
  const rows = [];
  if (cp.airway) rows.push(findingRow('Airway', cp.airway));
  if (cp.breathing) rows.push(findingRow('Breathing', cp.breathing));
  if (cp.circulation) rows.push(findingRow('Circulation', cp.circulation));
  if (cp.skin) {
    const skin = [cp.skin.color, cp.skin.temperature, cp.skin.moisture].filter(Boolean).join(' · ');
    rows.push(findingRow('Skin', skin));
  }
  if (cp.pupils) rows.push(findingRow('Pupils', cp.pupils));
  if (cp.motorFunction) rows.push(findingRow('Motor', cp.motorFunction));
  if (cp.patientSpeech) rows.push(findingRow('Speech', `<span class="finding-speech">"${escHtml(cp.patientSpeech)}"</span>`, true));
  if (cp.otherFindings && cp.otherFindings.length) {
    const items = cp.otherFindings.map(f => `<li>${escHtml(f)}</li>`).join('');
    rows.push(findingRow('Other', `<ul class="findings-notes">${items}</ul>`, true));
  }
  if (!rows.length && !cp.avpu && !cp.gcs) return '';
  const locBlock = (cp.avpu || cp.gcs) ? `
    <div class="loc-block">
      ${cp.avpu ? renderAvpu(cp.avpu) : ''}
      ${cp.gcs ? renderGcs(cp.gcs) : ''}
    </div>` : '';
  return `<div class="card">
    <div class="card-title">Clinical Findings</div>
    <div class="card-content">
      ${locBlock}
      ${rows.join('')}
    </div>
  </div>`;
}

function findingRow(label, value, isHtml) {
  const body = isHtml ? value : escHtml(value);
  return `<div class="finding-row"><div class="finding-label">${escHtml(label)}</div><div class="finding-value">${body}</div></div>`;
}

function renderActions(actions) {
  if (!actions || !actions.length) return '';
  const items = actions.map(a => {
    const priorityClass = a.priority === 'critical' ? 'p-critical' : (a.priority === 'important' ? 'p-important' : 'p-supp');
    const priority = a.priority ? `<span class="action-priority ${priorityClass}">${escHtml(a.priority)}</span>` : '';
    const rationale = a.rationale ? `<div class="action-rationale">${escHtml(a.rationale)}</div>` : '';
    const ref = a.protocolReference ? `<div class="action-ref">↳ ${escHtml(a.protocolReference)}</div>` : '';
    return `<div class="action-row">
      <div class="action-box"></div>
      <div class="action-body">
        <div class="action-head">${priority}<div class="action-text">${escHtml(a.action)}</div></div>
        ${rationale}
        ${ref}
      </div>
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="card-title">Expected Actions</div>
    <div class="card-content" style="padding:0 16px 12px">${items}</div>
  </div>`;
}

function renderPhase(phase, isBranch) {
  const cp = phase.clinicalPresentation;
  const ms = phase.monitorState;
  const cls = isBranch ? ' phase-card-branch' : '';
  const branchTag = isBranch ? `<div class="branch-tag">Improper Care Branch</div>` : '';
  const trigger = phase.triggerCondition ? `<div class="phase-trigger">Trigger: ${escHtml(phase.triggerCondition)}</div>` : '';
  return `<section class="phase-section">
    <div class="card phase-card${cls}">
      <div class="card-content">
        ${branchTag}
        <div class="phase-title">${escHtml(phase.name)}</div>
        ${trigger}
        <div class="phase-desc">${escHtml(phase.description || '')}</div>
      </div>
    </div>
    ${renderVitals(ms)}
    ${renderFindings(cp)}
    ${renderActions(phase.expectedActions)}
  </section>`;
}

function renderSample(patient) {
  const h = patient.history || {};
  const cell = (letter, name, text) => {
    if (!text || (Array.isArray(text) && !text.length)) return '';
    const body = Array.isArray(text) ? text.join(', ') : text;
    return `<div class="sample-cell"><div class="sample-name"><span class="sample-letter">${letter}</span> ${escHtml(name)}</div><div class="sample-text">${escHtml(body)}</div></div>`;
  };
  return `<div class="card">
    <div class="card-title">SAMPLE History</div>
    <div class="card-content" style="padding:0">
      <div class="sample-grid">
        ${cell('S', 'Signs & Symptoms', h.hpi)}
        ${cell('A', 'Allergies', h.allergies)}
        ${cell('M', 'Medications', h.medications)}
        ${cell('P', 'Past Medical', h.pastMedical)}
        ${cell('L', 'Last Intake', h.lastOralIntake)}
        ${cell('E', 'Events', h.events)}
      </div>
    </div>
  </div>`;
}

function renderScene(s) {
  const sc = s.scene || {};
  const row = (label, value) => value ? `<div class="scene-row"><div class="scene-label">${escHtml(label)}</div><div class="scene-value">${escHtml(value)}</div></div>` : '';
  const cues = sc.visualCues && sc.visualCues.length
    ? `<div class="card"><div class="card-title">Visual Cues on Arrival</div><div class="card-content"><ul class="cue-list">${sc.visualCues.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul></div></div>`
    : '';
  return `<div class="card"><div class="card-title">Scene</div><div class="card-content">
    ${row('Dispatch', sc.dispatch)}
    ${row('Location', sc.location)}
    ${row('Time', sc.time)}
    ${row('Safety', sc.safety)}
    ${row('Bystanders', sc.bystanders)}
  </div></div>${cues}`;
}

function renderPatient(p) {
  const chips = [
    `<span class="patient-chip"><strong>${escHtml(p.name)}</strong></span>`,
    `<span class="patient-chip">${p.age} ${escHtml(p.ageUnit || 'y/o')} ${escHtml(p.sex)}</span>`,
    p.weight ? `<span class="patient-chip">${kgToLbs(p.weight)} lbs (${p.weight} kg)</span>` : '',
    p.height ? `<span class="patient-chip">${cmToFtIn(p.height)}</span>` : '',
    `<span class="patient-chip">CC: ${escHtml(p.chiefComplaint)}</span>`,
  ].filter(Boolean).join('');
  return `<div class="card"><div class="card-title">Patient</div><div class="card-content"><div class="patient-chips">${chips}</div></div></div>`;
}

function cssBlock() {
  return `
:root{--bg:#fff;--card:#fff;--card-border:#d6d3d1;--text:#1c1917;--text-secondary:#44403c;--text-muted:#78716c;--green:#166534;--red:#b91c1c;--red-light:#fef2f2;--red-border:#fecaca;--orange:#c2410c;--yellow:#a16207;--blue:#1e40af;--radius:8px;--radius-sm:6px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;background:#f5f5f4;color:var(--text);line-height:1.5;padding:24px;font-size:12pt}
.sheet{max-width:800px;margin:0 auto;background:#fff;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,.08);border-radius:10px}
.scenario-name{font-size:11pt;color:var(--text-secondary)}
.card{background:var(--card);border:1px solid var(--card-border);border-radius:var(--radius);margin-bottom:14px;overflow:hidden;break-inside:avoid}
.card-title{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);padding:10px 14px 6px;border-bottom:1px solid #f5f5f4}
.card-content{padding:10px 14px 12px}
.scene-row{padding:6px 0;border-bottom:1px solid #f5f5f4;display:grid;grid-template-columns:110px 1fr;gap:10px}
.scene-row:last-child{border-bottom:none}
.scene-label{font-family:'DM Mono',ui-monospace,monospace;font-size:8pt;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.scene-value{font-size:11pt;color:var(--text-secondary)}
.cue-list{list-style:none;margin:0}
.cue-list li{font-size:11pt;color:var(--text-secondary);padding:3px 0 3px 14px;position:relative}
.cue-list li::before{content:'→';position:absolute;left:0;color:var(--text-muted);font-size:10pt}
.sample-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e7e5e4}
.sample-cell{background:#fff;padding:9px 12px}
.sample-cell:nth-child(1),.sample-cell:nth-child(6){grid-column:1/-1}
.sample-letter{font-family:'DM Mono',ui-monospace,monospace;font-size:11pt;font-weight:700;color:var(--green);margin-right:4px}
.sample-name{font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:3px}
.sample-text{font-size:10.5pt;color:var(--text-secondary);line-height:1.45}
.patient-chips{display:flex;gap:8px;flex-wrap:wrap}
.patient-chip{font-size:10pt;padding:4px 10px;background:#f5f5f4;border-radius:6px;color:var(--text-secondary)}
.patient-chip strong{color:var(--text);font-weight:700}
.phase-section{break-before:auto;page-break-before:auto;margin-top:12px}
.phase-section .phase-card{break-after:avoid;page-break-after:avoid}
.phase-card{border-left:4px solid var(--text)}
.phase-card-branch{border-left-color:var(--red)}
.branch-tag{display:inline-block;font-family:'DM Mono',ui-monospace,monospace;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--red);background:var(--red-light);padding:2px 8px;border-radius:4px;margin-bottom:6px}
.phase-title{font-size:16pt;font-weight:700;margin-bottom:4px}
.phase-trigger{font-family:'DM Mono',ui-monospace,monospace;font-size:9pt;color:var(--yellow);margin-bottom:6px}
.phase-desc{font-size:11pt;color:var(--text-secondary);line-height:1.5}
.ecg-label{font-family:'DM Mono',ui-monospace,monospace;font-size:10pt;color:var(--text-secondary);padding:8px 12px;background:#fafaf9;border-bottom:1px solid #f0efec}
.vitals-grid{display:flex;flex-wrap:wrap;gap:4px 18px;padding:8px 14px}
.vital-cell{background:transparent;padding:0;text-align:left;display:flex;align-items:baseline;gap:4px}
.vital-cell.full-width{grid-column:auto}
.vital-name{font-family:'DM Mono',ui-monospace,monospace;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.vital-val{font-family:'DM Mono',ui-monospace,monospace;font-size:11pt;font-weight:700;color:var(--text);line-height:1.1}
.vital-unit{font-family:'DM Mono',ui-monospace,monospace;font-size:8pt;color:var(--text-muted)}
.loc-block{margin-bottom:10px}
.avpu-bar{display:flex;border:1px solid var(--card-border);border-radius:6px;overflow:hidden;margin-bottom:10px}
.avpu-seg{flex:1;text-align:center;padding:6px 4px;font-family:'DM Mono',ui-monospace,monospace;font-size:10pt;font-weight:700;color:var(--text-muted);background:#fafaf9}
.avpu-seg.sel-a{background:#ecfccb;color:var(--green)}
.avpu-seg.sel-v{background:#fef3c7;color:var(--yellow)}
.avpu-seg.sel-p{background:#ffedd5;color:var(--orange)}
.avpu-seg.sel-u{background:var(--red-light);color:var(--red)}
.gcs-detail{display:flex;flex-wrap:wrap;gap:6px 16px;padding:8px 14px;border:1px solid var(--card-border);border-radius:6px;margin-bottom:10px;align-items:baseline}
.gcs-item{display:flex;align-items:baseline;gap:4px;padding:0;border:none}
.gcs-item:last-of-type{border-bottom:none}
.gcs-part{order:1;font-family:'DM Mono',ui-monospace,monospace;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.gcs-score{order:2;font-family:'DM Mono',ui-monospace,monospace;font-size:11pt;font-weight:700;color:var(--text)}
.gcs-desc{order:3;font-size:9.5pt;color:var(--text-muted);font-style:italic}
.gcs-desc::before{content:'('}
.gcs-desc::after{content:')'}
.gcs-total-row{display:flex;align-items:baseline;gap:4px;order:-1;padding:0;margin:0;border:none;font-family:'DM Mono',ui-monospace,monospace;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.gcs-total-row .gcs-total{font-family:'DM Mono',ui-monospace,monospace;font-size:12pt;font-weight:700;color:var(--text)}
.finding-row{padding:6px 0;border-bottom:1px solid #f5f5f4;display:grid;grid-template-columns:100px 1fr;gap:10px}
.finding-row:last-child{border-bottom:none}
.finding-label{font-family:'DM Mono',ui-monospace,monospace;font-size:8pt;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.finding-value{font-size:10.5pt;color:var(--text-secondary)}
.finding-speech{font-style:italic;color:var(--text-muted)}
.findings-notes{list-style:none;margin:0}
.findings-notes li{font-size:10pt;color:var(--text-secondary);padding:2px 0 2px 12px;position:relative}
.findings-notes li::before{content:'·';position:absolute;left:2px;font-weight:700;color:var(--text-muted)}
.action-row{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f5f5f4;break-inside:avoid}
.action-row:last-child{border-bottom:none}
.action-box{width:14px;height:14px;border:1.5px solid var(--text-muted);border-radius:3px;flex-shrink:0;margin-top:3px}
.action-body{flex:1;min-width:0}
.action-head{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px}
.action-priority{display:inline-block;font-family:'DM Mono',ui-monospace,monospace;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 6px;border-radius:3px;flex-shrink:0;margin-top:2px}
.p-critical{background:var(--red-light);color:var(--red)}
.p-important{background:#fff7ed;color:var(--orange)}
.p-supp{background:#f5f5f4;color:var(--text-muted)}
.action-text{font-size:11pt;font-weight:600;color:var(--text);line-height:1.35}
.action-rationale,.action-ref{display:none}
.action-head{margin-bottom:0}
.action-row{padding:6px 0}
@media print{
  body{background:#fff;padding:0;font-size:10pt}
  .sheet{box-shadow:none;max-width:none;padding:0.4in;border-radius:0}
  .card{break-inside:avoid;margin-bottom:8px}
  .card-title{padding:6px 10px 3px}
  .card-content{padding:6px 10px 8px}
}
`;
}

function exportPrint(scenario) {
  const defaultPhases = scenario.phases.filter(p => p.isDefault === true || p.isDefault === undefined);
  const branchPhases = scenario.phases.filter(p => p.isDefault === false);

  const phasesHtml = [
    ...defaultPhases.map(p => renderPhase(p, false)),
    ...branchPhases.map(p => renderPhase(p, true)),
  ].join('');

  const scenarioCard = `<div class="card"><div class="card-title">Scenario</div><div class="card-content"><div class="scenario-name">${escHtml(scenario.meta.name)}</div></div></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(scenario.meta.name)} — Printable</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${cssBlock()}</style>
</head>
<body>
<div class="sheet">
  ${scenarioCard}
  ${renderPatient(scenario.patient)}
  ${renderScene(scenario)}
  ${renderSample(scenario.patient)}
  ${phasesHtml}
</div>
</body>
</html>`;
}

// Main
const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node export-print.js <unified.json> <output.html>');
  process.exit(1);
}

const scenario = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf-8'));
const result = exportPrint(scenario);
fs.writeFileSync(path.resolve(outputPath), result);
console.log(`Print HTML written to: ${outputPath}`);
