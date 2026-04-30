#!/usr/bin/env node
// export-html.js — Convert a unified scenario JSON into the interactive scenario viewer HTML.
//
// Reads:
//   - <unified.json>                                             input scenario data
//   - <skill>/assets/scenario-bundle.html                        viewer chassis (React + fonts + Babel; embedded as base64-gzip assets)
//   - <skill>/assets/scenario-viewer.jsx                         viewer React component (gets gzipped + spliced into the bundle)
//
// Writes:
//   - <output.html>                                              fully self-contained HTML the student opens in a browser
//
// Usage: node export-html.js <unified.json> <output.html>

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
const BUNDLE_PATH = path.join(ASSETS_DIR, 'scenario-bundle.html');
const VIEWER_PATH = path.join(ASSETS_DIR, 'scenario-viewer.jsx');

// UUIDs of the two assets we replace inside the bundle's manifest.
// The bundle was originally produced with a sample scenario + the React component;
// we swap both with our own scenario data and our own (modified) component.
const SCENARIO_DATA_UUID = '4e5e718d-5c51-446c-81bf-989a8c33e968';
const VIEWER_COMPONENT_UUID = '58069184-75c2-4f88-bb85-045c82ba7358';

// ---------- helpers ----------

function durationStr(seconds) {
  if (!seconds) return '';
  const m = Math.round(seconds / 60);
  return m + ' min';
}

function formatWeight(p) {
  if (p.weight == null) return '';
  const lbs = p.weightLbs != null ? p.weightLbs : Math.round(p.weight * 2.20462 * 10) / 10;
  return `${lbs} lbs · ${p.weight} kg`;
}

function formatTemp(m) {
  if (m == null || m.temp == null) return '—';
  const f = m.tempF != null ? m.tempF : Math.round((m.temp * 9 / 5 + 32) * 10) / 10;
  return `${f}°F`;
}

function splitTitle(name) {
  for (const sep of [' — ', ' – ', ' - ', ': ']) {
    const i = name.indexOf(sep);
    if (i > 0) return { name: name.slice(0, i).trim(), subtitle: name.slice(i + sep.length).trim() };
  }
  return { name, subtitle: '' };
}

function shortName(name) {
  let s = name.replace(/^branch\s*[:\-—]\s*/i, '');
  for (const sep of [' — ', ' – ', ' - ']) {
    const i = s.indexOf(sep);
    if (i > 0) { s = s.slice(0, i); break; }
  }
  s = s.replace(/\s*\(.*?\)\s*$/, '').trim();
  if (s.length > 28) {
    const cut = s.slice(0, 28);
    const lastSpace = cut.lastIndexOf(' ');
    s = (lastSpace > 12 ? cut.slice(0, lastSpace) : cut) + '…';
  }
  return s;
}

function combineSkin(skinObj) {
  if (!skinObj) return '';
  return [skinObj.color, skinObj.temperature, skinObj.moisture].filter(Boolean).join(', ');
}

function combineNeuro(cp) {
  const parts = [];
  if (cp.avpu) parts.push(`AVPU: ${cp.avpu}`);
  if (cp.gcs) {
    const total = (cp.gcs.eye || 0) + (cp.gcs.verbal || 0) + (cp.gcs.motor || 0);
    parts.push(`GCS ${total}`);
  }
  if (cp.pupils) parts.push(cp.pupils);
  if (cp.motorFunction) parts.push(cp.motorFunction);
  return parts.join(' · ');
}

function extractPain(otherFindings) {
  if (!otherFindings) return '—';
  for (const f of otherFindings) {
    const m = String(f).match(/(\d{1,2})\s*\/\s*10/);
    if (m) return parseInt(m[1], 10);
  }
  return '—';
}

function extractEcg(otherFindings) {
  if (!otherFindings) return '';
  for (const f of otherFindings) {
    if (/12[\s-]*lead|ST\s*[↑↓]|elevation|depression|reciprocal/i.test(f)) return String(f);
  }
  return '';
}

function bpStr(monitor) {
  if (monitor.bpSys === 0 && monitor.bpDia === 0) return '0/0';
  return `${monitor.bpSys}/${monitor.bpDia}`;
}

function mapKind(phase) { return phase.isDefault === false ? 'improper' : 'primary'; }

function mapBranches(transitions, allPhases) {
  if (!transitions) return [];
  return transitions.map(t => {
    const target = allPhases.find(p => p.id === t.targetPhaseId);
    const kind = target && target.isDefault === false ? 'improper' : 'proper';
    const label = target ? shortName(target.name) : t.targetPhaseId;
    const criterion = t.if || '';
    return { phaseId: t.targetPhaseId, label, criterion, kind };
  });
}

function sexShort(s) {
  if (!s) return '';
  const x = String(s).toLowerCase();
  if (x.startsWith('m')) return 'M';
  if (x.startsWith('f')) return 'F';
  return s;
}

function sexLong(s) {
  if (!s) return '';
  const x = String(s).toLowerCase();
  if (x.startsWith('m')) return 'Male';
  if (x.startsWith('f')) return 'Female';
  return s;
}

function ageWithUnit(age, unit) {
  if (!unit || unit === 'years') return `${age} yrs`;
  const u = { months: 'mo', weeks: 'wk', days: 'd' }[unit] || unit;
  return `${age} ${u}`;
}

// ---------- transform unified -> viewer scenario shape ----------

function buildViewerScenario(u) {
  const titleParts = splitTitle(u.meta.name);
  const history = (u.patient && u.patient.history) || {};
  return {
    meta: {
      name: titleParts.name,
      subtitle: titleParts.subtitle,
      difficulty: (u.meta.difficulty || '').charAt(0).toUpperCase() + (u.meta.difficulty || '').slice(1),
      category: u.meta.category,
      duration: durationStr(u.meta.totalTimeSeconds),
      tags: u.meta.tags || []
    },
    patient: {
      name: u.patient.name,
      age: ageWithUnit(u.patient.age, u.patient.ageUnit),
      sex: sexShort(u.patient.sex),
      sexLong: sexLong(u.patient.sex),
      weight: formatWeight(u.patient),
      height: u.patient.height ? `${u.patient.height} cm` : '',
      chiefComplaint: u.patient.chiefComplaint,
      hpi: history.hpi || '',
      allergies: Array.isArray(history.allergies) ? history.allergies.join(', ') : (history.allergies || ''),
      pmh: history.pastMedical || [],
      meds: history.medications || [],
      lastOral: history.lastOralIntake || '',
      events: history.events || ''
    },
    scene: {
      dispatch: u.scene.dispatch,
      location: u.scene.location,
      time: u.scene.time,
      safety: u.scene.safety,
      cues: u.scene.visualCues || []
    },
    phases: u.phases.map(p => {
      const cp = p.clinicalPresentation || {};
      const m = p.monitorState || {};
      return {
        id: p.id,
        name: p.name,
        shortName: shortName(p.name),
        kind: mapKind(p),
        // The entry phase has no triggerCondition by schema rule; the viewer hides
        // the "Triggered by" callout when this is empty.
        trigger: p.triggerCondition || '',
        triggerDetail: '',
        synopsis: p.description,
        patientSays: cp.patientSpeech || '',
        vitals: {
          rhythm: m.ecgRhythm || '—',
          hr: m.hr ?? '—',
          bp: bpStr(m),
          rr: m.respRate ?? '—',
          spo2: m.spo2 ?? '—',
          etco2: m.etco2 ?? '—',
          temp: formatTemp(m),
          glucose: m.glucose ?? '—',
          pain: extractPain(cp.otherFindings)
        },
        exam: {
          airway: cp.airway || '',
          breathing: cp.breathing || '',
          circulation: cp.circulation || '',
          skin: combineSkin(cp.skin),
          neuro: combineNeuro(cp)
        },
        ecg: extractEcg(cp.otherFindings),
        actions: (p.expectedActions || []).map(a => ({
          id: a.id,
          priority: a.priority,
          text: a.action,
          short: a.shortAction || a.action,
          protocol: a.protocolReference || ''
        })),
        branches: mapBranches(p.transitions, u.phases)
      };
    })
  };
}

// ---------- splice into bundle ----------

function spliceBundle(viewerScenario) {
  const bundle = fs.readFileSync(BUNDLE_PATH, 'utf8');
  const manifestMatch = bundle.match(/(<script type="__bundler\/manifest">)([\s\S]*?)(<\/script>)/);
  if (!manifestMatch) throw new Error('Bundle manifest not found in ' + BUNDLE_PATH);

  const manifest = JSON.parse(manifestMatch[2]);
  if (!manifest[SCENARIO_DATA_UUID]) {
    throw new Error('SCENARIO data asset UUID not present in manifest: ' + SCENARIO_DATA_UUID);
  }
  if (!manifest[VIEWER_COMPONENT_UUID]) {
    throw new Error('Viewer component asset UUID not present in manifest: ' + VIEWER_COMPONENT_UUID);
  }

  // Replace scenario data
  const scenarioJs = '// scenario data\nwindow.SCENARIO = ' + JSON.stringify(viewerScenario, null, 2) + ';\n';
  manifest[SCENARIO_DATA_UUID] = {
    ...manifest[SCENARIO_DATA_UUID],
    data: zlib.gzipSync(Buffer.from(scenarioJs, 'utf8')).toString('base64'),
    compressed: true
  };

  // Replace viewer component with current source
  const viewerJs = fs.readFileSync(VIEWER_PATH);
  manifest[VIEWER_COMPONENT_UUID] = {
    ...manifest[VIEWER_COMPONENT_UUID],
    data: zlib.gzipSync(viewerJs).toString('base64'),
    compressed: true
  };

  const newManifestStr = JSON.stringify(manifest);
  return bundle.slice(0, manifestMatch.index) +
    manifestMatch[1] + newManifestStr + manifestMatch[3] +
    bundle.slice(manifestMatch.index + manifestMatch[0].length);
}

// ---------- main ----------

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node export-html.js <unified.json> <output.html>');
  process.exit(1);
}

const unified = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const viewerScenario = buildViewerScenario(unified);
const html = spliceBundle(viewerScenario);

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), html);
console.log(`Interactive HTML written to: ${outputPath}`);
console.log(`Phases: ${viewerScenario.phases.length} · primary: ${viewerScenario.phases.filter(p=>p.kind==='primary').length} · improper: ${viewerScenario.phases.filter(p=>p.kind==='improper').length}`);
