// Variation 4 — "Command": three-column pro layout, with view toggle (Scenario / Debrief)
// Aesthetic: dense / mission-control. Phase tree on left, content middle, checklist right.

const V4_CSS = `
.v4 { font-family: 'Inter Tight', system-ui, sans-serif; color: var(--ink); background: #f4f4f1; height: 100%; display: flex; flex-direction: column; }

.v4 .v4-top { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; background: #0f1115; color: #d4d8e0; font-size: 12px; font-family: 'JetBrains Mono', monospace; }
.v4 .v4-top .l { display: flex; align-items: center; gap: 16px; }
.v4 .v4-top .tag { background: #2a2f3a; padding: 2px 8px; border-radius: 3px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.v4 .v4-top .name { color: #fff; }
.v4 .v4-top .r { display: flex; gap: 10px; color: #8a92a3; align-items: center; }
.v4 .v4-top .r b { color: #d4d8e0; }
.v4 .v4-top .kbd { font-size: 10px; padding: 1px 5px; border: 1px solid #2a2f3a; border-radius: 3px; color: #8a92a3; }
.v4 .timer-display { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 600; color: #d4d8e0; padding: 3px 12px; background: #1a1d24; border-radius: 4px; min-width: 78px; text-align: center; letter-spacing: 0.04em; }
.v4 .timer-display.running { color: #6ad7a8; }
.v4 .timer-display.elapsed { color: #ff8a7a; }
.v4 .timer-btn { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; padding: 5px 11px; background: transparent; border: 1px solid #2a2f3a; color: #d4d8e0; border-radius: 4px; cursor: pointer; transition: all 0.12s; }
.v4 .timer-btn:hover { background: #1a1d24; border-color: #3a4050; }
.v4 .timer-btn.start { background: #2a3f2a; border-color: #3a5a3a; color: #6ad7a8; }
.v4 .timer-btn.start:hover { background: #3a5a3a; }
.v4 .timer-btn.pause { background: #3f3a2a; border-color: #5a4a2a; color: #f0a050; }
.v4 .timer-btn.reset { color: #8a92a3; }

.v4 .v4-body { flex: 1; display: grid; grid-template-columns: 240px 1fr 360px; min-height: 0; }
.v4 .v4-body.no-right { grid-template-columns: 240px 1fr; }

.v4 .tree { background: var(--paper); border-right: 1px solid var(--line); padding: 14px 0; overflow-y: auto; display: flex; flex-direction: column; }

.v4 .viewtabs { display: flex; gap: 4px; padding: 0 14px 12px; }
.v4 .viewtab { flex: 1; padding: 8px 10px; font-size: 11px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; background: var(--bg); color: var(--ink-3); border: 1px solid var(--line); border-radius: 4px; cursor: pointer; transition: all 0.12s; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 600; }
.v4 .viewtab:hover { color: var(--ink); border-color: var(--ink-3); }
.v4 .viewtab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
.v4 .viewtab .vt-glyph { font-size: 9px; opacity: 0.7; }

.v4 .tree-h { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-4); padding: 0 18px 8px; }
.v4 .tnode { display: block; width: 100%; text-align: left; background: transparent; border: none; padding: 4px 18px; font-family: inherit; cursor: pointer; position: relative; color: var(--ink-2); font-size: 13px; }
.v4 .tnode .row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 4px; }
.v4 .tnode:hover .row { background: var(--bg); }
.v4 .tnode.active .row { background: var(--ink); color: #fff; }
.v4 .tnode .glyph { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-4); width: 14px; flex-shrink: 0; }
.v4 .tnode.active .glyph { color: rgba(255,255,255,0.6); }
.v4 .tnode .nm { font-weight: 500; line-height: 1.25; }
.v4 .tnode.improper .glyph { color: var(--improper); }
.v4 .tnode.improper.active .row { background: var(--improper); }
.v4 .tline { padding: 0 18px; }
.v4 .tline .h { border-top: 1px dashed var(--line-2); margin: 12px 0; }
.v4 .tnode .check-mini { width: 12px; height: 12px; border-radius: 3px; background: color-mix(in oklch, var(--proper) 25%, transparent); border: 1px solid var(--proper); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--proper); font-weight: 700; margin-left: auto; }
.v4 .tnode .check-mini.empty { background: transparent; border-color: var(--line-2); }
.v4 .tnode.active .check-mini.empty { border-color: rgba(255,255,255,0.4); }

.v4 .tree-pt { padding: 4px 26px 16px; font-size: 12px; color: var(--ink-2); }
.v4 .tree-pt .nm { font-weight: 600; color: var(--ink); }
.v4 .tree-pt .pt-rows { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.v4 .tree-pt .pt-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.v4 .tree-pt .pt-k { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-4); flex-shrink: 0; }
.v4 .tree-pt .pt-v { font-size: 11.5px; color: var(--ink-2); text-align: right; }

/* SAMPLE history card (initial phase only) */
.v4 .p4.sample .sample-rows { display: flex; flex-direction: column; }
.v4 .p4.sample .sample-row { display: grid; grid-template-columns: 28px 116px 1fr; gap: 14px; padding: 11px 0; border-top: 1px solid var(--line); align-items: baseline; }
.v4 .p4.sample .sample-row:first-child { border-top: none; padding-top: 4px; }
.v4 .sample-k { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: var(--accent); width: 22px; height: 22px; background: var(--tint); border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; }
.v4 .sample-l { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); padding-top: 4px; align-self: center; }
.v4 .sample-v { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
.v4 .sample-v.muted { color: var(--ink-4); }
.v4 .sample-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
.v4 .sample-list li { padding-left: 14px; position: relative; }
.v4 .sample-list li::before { content: '·'; position: absolute; left: 5px; top: 0; color: var(--ink-4); font-weight: 700; }

.v4 .center { padding: 18px 24px 32px; overflow-y: auto; min-width: 0; }
.v4 .c-titlebar { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 18px; }
.v4 .c-titlebar h2 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.v4 .c-titlebar .crumb { font-size: 10px; color: var(--ink-4); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; }
.v4 .c-titlebar .imp { color: var(--improper); }
.v4 .c-titlebar .grp { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--ink-3); font-family: 'JetBrains Mono', monospace; }
.v4 .c-titlebar .nav-btn { width: 26px; height: 26px; border: 1px solid var(--line); background: var(--paper); border-radius: 4px; cursor: pointer; font-size: 12px; color: var(--ink-2); padding: 0; }
.v4 .c-titlebar .nav-btn:hover { background: var(--bg); border-color: var(--ink-3); }

.v4 .vitals4 { background: #0a0c0f; color: #d4d8e0; border-radius: 6px; padding: 14px 18px; margin-bottom: 14px; }
.v4 .vitals4 .vt { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #1a1d24; margin-bottom: 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
.v4 .vitals4 .vt .rh { color: #f0a050; letter-spacing: 0.04em; }
.v4 .vitals4 .vt .clock { color: #5b6271; }
.v4 .vitals4 .vrow { display: grid; grid-template-columns: repeat(8, 1fr); gap: 14px; font-family: 'JetBrains Mono', monospace; }
.v4 .vitals4 .vc-k { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #5b6271; }
.v4 .vitals4 .vc-v { font-size: 18px; font-weight: 600; line-height: 1.1; margin-top: 2px; }
.v4 .vitals4 .vc.hr .vc-v { color: #6ad7a8; font-size: 22px; }
.v4 .vitals4 .vc.bp .vc-v { color: #ff8a7a; font-size: 16px; }
.v4 .vitals4 .vc.spo2 .vc-v { color: #6db5ff; font-size: 22px; }

.v4 .panels4 { display: grid; grid-template-columns: 1fr; gap: 14px; }
.v4 .p4 { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 14px 18px; }
.v4 .p4-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.v4 .p4-h .lab { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
.v4 .p4-h .acc { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-4); }
.v4 .p4 .syn { font-size: 13.5px; line-height: 1.55; color: var(--ink-2); }
.v4 .p4 .pq { margin-top: 12px; padding-left: 12px; border-left: 2px solid var(--ink); font-size: 13px; font-style: italic; color: var(--ink-2); }

/* Dispatch card — radio callout, initial contact only */
.v4 .p4.dispatch-card { border-left: 3px solid var(--accent); }
.v4 .p4.dispatch-card .lab { color: var(--accent); }
.v4 .dispatch-text { font-size: 13.5px; line-height: 1.6; color: var(--ink); font-style: italic; padding: 4px 0 2px; }

.v4 .trigger { background: var(--paper); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 6px; padding: 12px 16px 14px; margin-bottom: 14px; }
.v4 .trigger.improper { border-left-color: var(--improper); }
.v4 .trigger.proper { border-left-color: var(--proper); }
.v4 .trigger .tg-tag { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-4); font-family: 'JetBrains Mono', monospace; margin-bottom: 6px; display: block; }
.v4 .trigger.improper .tg-tag { color: var(--improper); }
.v4 .trigger.proper .tg-tag { color: var(--proper); }
.v4 .trigger .tg-cause { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
.v4 .trigger .tg-detail { font-size: 12.5px; color: var(--ink-3); line-height: 1.5; }

/* Cleaner exam layout — labeled rows, clear hierarchy, no run-on text */
.v4 .exam-clean { display: flex; flex-direction: column; }
.v4 .exam-row { display: grid; grid-template-columns: 96px 1fr; gap: 0; padding: 10px 0; border-top: 1px solid var(--line); align-items: baseline; }
.v4 .exam-row:first-child { border-top: none; padding-top: 4px; }
.v4 .exam-row .ex-k { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); font-family: 'JetBrains Mono', monospace; padding-top: 2px; }
.v4 .exam-row .ex-v { font-size: 13px; color: var(--ink-2); line-height: 1.5; }
.v4 .exam-row .ex-mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink); background: var(--tint); padding: 4px 8px; border-radius: 3px; display: inline-block; }

.v4 .branchpanel { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 6px 18px; margin-top: 14px; }
.v4 .branchpanel .p4-h { padding: 8px 0 4px; }
.v4 .br4 { display: flex; align-items: center; padding: 11px 0; border-top: 1px solid var(--line); cursor: pointer; gap: 10px; }
.v4 .br4:first-of-type { border-top: none; }
.v4 .br4:hover { background: var(--bg); margin: 0 -10px; padding-left: 10px; padding-right: 10px; border-radius: 4px; }
.v4 .br4:hover + .br4 { border-top-color: transparent; }
.v4 .br4-pip { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.v4 .br4.proper .br4-pip { background: var(--proper); }
.v4 .br4.improper .br4-pip { background: var(--improper); }
.v4 .br4-if { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-4); flex-shrink: 0; }
.v4 .br4-cond { font-size: 13.5px; color: var(--ink); font-weight: 500; flex: 1; min-width: 0; }
.v4 .br4-mid { color: var(--ink-4); font-family: 'JetBrains Mono', monospace; font-size: 12px; flex-shrink: 0; }
.v4 .br4-dest { font-size: 12.5px; color: var(--ink-3); flex-shrink: 0; }
.v4 .br4.proper .br4-dest { color: var(--proper); }
.v4 .br4.improper .br4-dest { color: var(--improper); }

.v4 .right { background: var(--paper); border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
.v4 .right-h { padding: 14px 20px; border-bottom: 1px solid var(--line); }
.v4 .right-h .row { display: flex; justify-content: space-between; align-items: baseline; }
.v4 .right-h .lab { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); }
.v4 .right-h .pct { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-4); }
.v4 .right-h .progbar { height: 3px; background: var(--line); border-radius: 2px; margin-top: 8px; overflow: hidden; }
.v4 .right-h .progbar .fill { height: 100%; background: var(--ink); transition: width 0.2s; }
.v4 .right-h .legend { display: flex; gap: 12px; margin-top: 10px; font-size: 10px; color: var(--ink-3); }
.v4 .right-h .legend .lg { display: flex; align-items: center; gap: 5px; }
.v4 .right-h .legend .pip { width: 6px; height: 6px; border-radius: 50%; }
.v4 .right-h .legend .pip.critical { background: var(--critical); }
.v4 .right-h .legend .pip.important { background: var(--important); }
.v4 .right-h .legend .pip.supplemental { background: var(--supplemental); }

.v4 .right-list { flex: 1; overflow-y: auto; padding: 6px 0 20px; }
.v4 .a4 { display: flex; align-items: flex-start; gap: 10px; padding: 10px 20px 10px 14px; cursor: pointer; border-left: 3px solid transparent; }
.v4 .a4:hover { background: var(--bg); }
.v4 .a4.critical { border-left-color: var(--critical); }
.v4 .a4.important { border-left-color: var(--important); }
.v4 .a4.supplemental { border-left-color: var(--supplemental); }
.v4 .a4 .c4 { flex-shrink: 0; width: 16px; height: 16px; border: 1.5px solid var(--line-2); border-radius: 3px; margin-top: 1px; display: flex; align-items: center; justify-content: center; }
.v4 .a4.done .c4 { background: var(--ink); border-color: var(--ink); }
.v4 .a4.done .c4::after { content: '✓'; color: white; font-size: 10px; font-weight: 700; }
.v4 .a4-text { font-size: 12.5px; line-height: 1.45; color: var(--ink-2); flex: 1; }
.v4 .a4.done .a4-text { color: var(--ink-4); text-decoration: line-through; }
.v4 .a4 .kbd-sm { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--ink-4); background: var(--bg); padding: 1px 5px; border-radius: 3px; border: 1px solid var(--line); flex-shrink: 0; margin-top: 1px; }

/* Debrief view */
.v4 .debrief-head { padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 22px; }
.v4 .debrief-head .crumb { font-size: 10px; color: var(--ink-4); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; }
.v4 .debrief-head h2 { font-size: 22px; font-weight: 600; margin: 4px 0 0; letter-spacing: -0.01em; }
.v4 .debrief-head .sub { font-size: 13px; color: var(--ink-3); margin-top: 4px; }

.v4 .deb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.v4 .deb-panel { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 16px 18px; }
.v4 .deb-panel.full { grid-column: 1 / -1; }
.v4 .deb-panel.pitfalls { border-left: 3px solid var(--improper); }
.v4 .deb-panel.objectives { border-left: 3px solid var(--proper); }
.v4 .deb-panel.questions { border-left: 3px solid var(--accent); }
.v4 .deb-panel.takeaways { border-left: 3px solid var(--important); }
.v4 .deb-panel-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.v4 .deb-panel-h .lab { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-2); }
.v4 .deb-panel-h .ct { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-4); }
.v4 .deb-list { display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; list-style: none; }
.v4 .deb-list li { padding: 8px 0 8px 26px; border-top: 1px solid var(--line); font-size: 13px; line-height: 1.5; color: var(--ink-2); position: relative; }
.v4 .deb-list li:first-child { border-top: none; }
.v4 .deb-list li::before { position: absolute; left: 0; top: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-4); font-weight: 600; counter-increment: deb-counter; content: counter(deb-counter, decimal-leading-zero); }
.v4 .deb-list { counter-reset: deb-counter; }
.v4 .deb-panel.pitfalls .deb-list li::before { color: var(--improper); }
.v4 .deb-panel.objectives .deb-list li::before { color: var(--proper); content: '✓'; font-size: 13px; top: 7px; }
.v4 .deb-panel.takeaways .deb-list li::before { color: var(--important); content: '◆'; font-size: 9px; top: 11px; }

/* Recap stack — one card per surfaced phase */
.v4 .recap-stack { display: flex; flex-direction: column; gap: 14px; }
.v4 .deb-panel.recap.recap-initial { border-left: 3px solid var(--ink); }
.v4 .deb-panel.recap.recap-primary { border-left: 3px solid var(--proper); }
.v4 .deb-panel.recap.recap-improper { border-left: 3px solid var(--improper); }
.v4 .deb-panel.recap .deb-panel-h .lab { font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.005em; text-transform: none; }
.v4 .deb-panel.recap .deb-panel-h .ct { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-3); }
.v4 .recap-group { margin-top: 14px; }
.v4 .recap-group:first-of-type { margin-top: 0; }
.v4 .recap-group-h { display: flex; align-items: baseline; justify-content: space-between; padding: 0 0 4px; margin-bottom: 2px; }
.v4 .recap-group-tag { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.v4 .recap-group.did .recap-group-tag { color: var(--proper); }
.v4 .recap-group.missed .recap-group-tag { color: var(--improper); }
.v4 .recap-group-ct { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-4); }
.v4 .recap-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.v4 .recap-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-2); border-top: 1px solid var(--line); }
.v4 .recap-item:first-child { border-top: none; }
.v4 .recap-mark { width: 14px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; margin-top: 5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 12px; line-height: 1; }
.v4 .recap-item.done .recap-mark { color: var(--proper); }
.v4 .recap-item:not(.done) .recap-mark::before { content: ''; width: 6px; height: 6px; border-radius: 50%; display: block; }
.v4 .recap-item.critical:not(.done) .recap-mark::before { background: var(--critical); }
.v4 .recap-item.important:not(.done) .recap-mark::before { background: var(--important); }
.v4 .recap-item.supplemental:not(.done) .recap-mark::before { background: var(--supplemental); }
.v4 .recap-item:not(.done) .recap-text { color: var(--ink-3); }
.v4 .recap-body { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.v4 .recap-short { font-size: 13px; font-weight: 500; color: var(--ink); line-height: 1.4; }
.v4 .recap-item:not(.done) .recap-short { color: var(--ink-2); }
.v4 .recap-sub { font-size: 11.5px; color: var(--ink-3); line-height: 1.5; display: flex; flex-direction: column; gap: 2px; padding-top: 2px; }
.v4 .recap-verbose { color: var(--ink-3); }
.v4 .recap-item:not(.done) .recap-verbose { color: var(--ink-4); }
.v4 .recap-prot { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-4); }
`;

function ExamRow({ k, v, mono }) {
  return (
    <div className="exam-row">
      <div className="ex-k">{k}</div>
      <div className="ex-v">{mono ? <span className="ex-mono">{v}</span> : v}</div>
    </div>
  );
}

function CleanExam({ phase }) {
  // Parse vitals-related fragments out of breathing/circulation copy and surface as labeled rows.
  // Keep the structure simple and predictable.
  return (
    <div className="exam-clean">
      <ExamRow k="Airway" v={phase.exam.airway} />
      <ExamRow k="Breathing" v={phase.exam.breathing} />
      <ExamRow k="Circulation" v={phase.exam.circulation} />
      <ExamRow k="Skin" v={phase.exam.skin} />
      <ExamRow k="Neuro" v={phase.exam.neuro} />
      {phase.ecg && <ExamRow k="ECG" v={phase.ecg} mono />}
    </div>
  );
}

function computeRecap(scenario, done) {
  // Initial phase always; later phases appear once any action in them is checked.
  // Each surfaced phase shows ALL its actions, with the checked ones marked done.
  const initialPhase = scenario.phases.find(p => p.kind === 'primary') || scenario.phases[0];
  return scenario.phases
    .filter(p => p.id === initialPhase.id || (done[p.id] && Object.values(done[p.id]).some(Boolean)))
    .map(p => {
      const phaseDone = done[p.id] || {};
      return {
        phase: p,
        items: p.actions.map(a => ({ ...a, done: !!phaseDone[a.id] })),
        isInitial: p.id === initialPhase.id
      };
    });
}

function DebriefView({ scenario, recap }) {
  return (
    <main className="center">
      <div className="debrief-head">
        <div className="crumb">DEBRIEF · POST-SCENARIO REVIEW</div>
        <h2>Debrief — {scenario.meta.name}</h2>
        <div className="sub">Initial Contact is always shown. A new card appears for any later phase once you check off something on its tab.</div>
      </div>

      <div className="recap-stack">
        {recap.map(r => {
          const did = r.items.filter(i => i.done);
          const missed = r.items.filter(i => !i.done);
          const total = r.items.length;
          const kindCls = r.phase.kind === 'improper' ? 'improper' : (r.isInitial ? 'initial' : 'primary');
          return (
            <div
              key={r.phase.id}
              id={`recap-${r.phase.id}`}
              className={`deb-panel recap full recap-${kindCls}`}
            >
              <div className="deb-panel-h">
                <span className="lab">{r.phase.shortName || r.phase.name}</span>
                <span className="ct">{did.length} / {total}</span>
              </div>
              {did.length > 0 && (
                <div className="recap-group did">
                  <div className="recap-group-h"><span className="recap-group-tag">✓ Did</span><span className="recap-group-ct">{did.length}</span></div>
                  <ul className="recap-list">
                    {did.map(a => (
                      <li key={a.id} className={`recap-item ${a.priority} done`}>
                        <span className="recap-mark">✓</span>
                        <div className="recap-body">
                          <div className="recap-short">{a.short || a.text}</div>
                          {(a.text && a.text !== a.short) || a.protocol ? (
                            <div className="recap-sub">
                              {a.text && a.text !== a.short && <span className="recap-verbose">{a.text}</span>}
                              {a.protocol && <span className="recap-prot">{a.protocol}</span>}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {missed.length > 0 && (
                <div className="recap-group missed">
                  <div className="recap-group-h"><span className="recap-group-tag">○ Missed</span><span className="recap-group-ct">{missed.length}</span></div>
                  <ul className="recap-list">
                    {missed.map(a => (
                      <li key={a.id} className={`recap-item ${a.priority}`}>
                        <span className="recap-mark"></span>
                        <div className="recap-body">
                          <div className="recap-short">{a.short || a.text}</div>
                          {(a.text && a.text !== a.short) || a.protocol ? (
                            <div className="recap-sub">
                              {a.text && a.text !== a.short && <span className="recap-verbose">{a.text}</span>}
                              {a.protocol && <span className="recap-prot">{a.protocol}</span>}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

const TIMER_START = 25 * 60; // 25 minutes in seconds

function formatTime(s) {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const ss = abs % 60;
  return `${sign}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function V4({ scenario }) {
  const [view, setView] = React.useState('scenario'); // 'scenario' | 'debrief'
  const [phaseId, setPhaseId] = React.useState(scenario.phases[0].id);
  const [done, setDone] = React.useState({});
  const [timerSeconds, setTimerSeconds] = React.useState(TIMER_START);
  const [timerRunning, setTimerRunning] = React.useState(false);

  React.useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerSeconds(s => s - 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const resetAll = () => {
    setDone({});
    setTimerSeconds(TIMER_START);
    setTimerRunning(false);
  };
  const phase = scenario.phases.find(p => p.id === phaseId);
  const phaseDoneIds = done[phaseId] || {};
  const toggle = (id) => setDone(d => ({ ...d, [phaseId]: { ...(d[phaseId] || {}), [id]: !(d[phaseId] || {})[id] } }));

  const total = phase.actions.length;
  const ct = phase.actions.filter(a => phaseDoneIds[a.id]).length;
  const pctNum = total === 0 ? 0 : Math.round((ct / total) * 100);

  const properPhases = scenario.phases.filter(p => p.kind === 'primary');
  const improperPhases = scenario.phases.filter(p => p.kind === 'improper');

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (view !== 'scenario') return;
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= phase.actions.length) {
        toggle(phase.actions[n - 1].id);
      } else if (e.key === 'ArrowRight') {
        const idx = scenario.phases.findIndex(p => p.id === phaseId);
        if (idx < scenario.phases.length - 1) setPhaseId(scenario.phases[idx + 1].id);
      } else if (e.key === 'ArrowLeft') {
        const idx = scenario.phases.findIndex(p => p.id === phaseId);
        if (idx > 0) setPhaseId(scenario.phases[idx - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, phaseId, view]);

  const phaseProgress = (p) => {
    const pd = done[p.id] || {};
    return p.actions.length === 0 ? 0 : Object.values(pd).filter(Boolean).length / p.actions.length;
  };

  const properIdx = properPhases.findIndex(p => p.id === phaseId);
  const phaseIdx = scenario.phases.findIndex(p => p.id === phaseId);
  const recap = view === 'debrief' ? computeRecap(scenario, done) : [];
  const initialPhase = scenario.phases.find(p => p.kind === 'primary') || scenario.phases[0];
  const onInitialPhase = phase.id === initialPhase.id;

  return (
    <div className="v4">
      <style>{V4_CSS}</style>

      <div className="v4-top">
        <div className="l">
          <span className="tag">SCN-001</span>
          <span className="name">{scenario.meta.name}</span>
        </div>
        <div className="r">
          <span className={`timer-display ${timerRunning ? 'running' : ''} ${timerSeconds <= 0 ? 'elapsed' : ''}`}>
            {formatTime(timerSeconds)}
          </span>
          <button className={`timer-btn ${timerRunning ? 'pause' : 'start'}`} onClick={() => setTimerRunning(r => !r)}>
            {timerRunning ? '❚❚ Pause' : '▶ Start'}
          </button>
          <button className="timer-btn reset" onClick={resetAll}>↻ Reset</button>
        </div>
      </div>

      <div className={`v4-body ${view === 'debrief' ? 'no-right' : ''}`}>
        <aside className="tree">
          <div className="viewtabs">
            <button className={`viewtab ${view === 'scenario' ? 'active' : ''}`} onClick={() => setView('scenario')}>
              <span className="vt-glyph">▦</span> Scenario
            </button>
            <button className={`viewtab ${view === 'debrief' ? 'active' : ''}`} onClick={() => setView('debrief')}>
              <span className="vt-glyph">★</span> Debrief
            </button>
          </div>

          {view === 'scenario' && <>
            <div className="tree-h">Decision tree</div>
            {properPhases.map((p, i) => (
              <button key={p.id} className={`tnode ${p.id === phaseId ? 'active' : ''}`} onClick={() => setPhaseId(p.id)}>
                <div className="row">
                  <span className="glyph">{String(i+1).padStart(2,'0')}</span>
                  <span className="nm">{p.shortName}</span>
                  <span className={`check-mini ${phaseProgress(p) === 1 ? '' : 'empty'}`}>{phaseProgress(p) === 1 ? '✓' : ''}</span>
                </div>
              </button>
            ))}
            <div className="tline"><div className="h"></div></div>
            <div className="tree-h">If improper care…</div>
            {improperPhases.map(p => (
              <button key={p.id} className={`tnode improper ${p.id === phaseId ? 'active' : ''}`} onClick={() => setPhaseId(p.id)}>
                <div className="row">
                  <span className="glyph">◆</span>
                  <span className="nm">{p.shortName}</span>
                </div>
              </button>
            ))}
          </>}

          {view === 'debrief' && <>
            <div className="tree-h">Sections</div>
            {recap.map(r => (
              <a key={r.phase.id} href={`#recap-${r.phase.id}`} className="tnode" style={{textDecoration:'none'}}>
                <div className="row">
                  <span className="glyph">◆</span>
                  <span className="nm">{r.phase.shortName || r.phase.name}</span>
                </div>
              </a>
            ))}
          </>}

          <div style={{marginTop:'auto', paddingTop: 12}}>
            <div className="tline"><div className="h"></div></div>
            <div className="tree-h">Patient</div>
            <div className="tree-pt">
              <div className="nm">{scenario.patient.name}</div>
              <div className="pt-rows">
                <div className="pt-row"><span className="pt-k">Age</span><span className="pt-v">{scenario.patient.age}</span></div>
                <div className="pt-row"><span className="pt-k">Sex</span><span className="pt-v">{scenario.patient.sexLong || scenario.patient.sex}</span></div>
                <div className="pt-row"><span className="pt-k">Weight</span><span className="pt-v">{scenario.patient.weight}</span></div>
              </div>
            </div>
          </div>
        </aside>

        {view === 'scenario' ? (
          <main className="center">
            <div className="c-titlebar">
              <div>
                <div className="crumb">
                  {phase.kind === 'improper' ? <span className="imp">◆ IMPROPER BRANCH</span> : `PHASE ${String(properIdx+1).padStart(2,'0')} · PRIMARY TRACK`}
                </div>
                <h2>{phase.name}</h2>
              </div>
              <div className="grp">
                <button className="nav-btn" onClick={() => phaseIdx > 0 && setPhaseId(scenario.phases[phaseIdx-1].id)}>‹</button>
                <span>{phaseIdx + 1} / {scenario.phases.length}</span>
                <button className="nav-btn" onClick={() => phaseIdx < scenario.phases.length-1 && setPhaseId(scenario.phases[phaseIdx+1].id)}>›</button>
              </div>
            </div>

            {phase.trigger && (
              <div className={`trigger ${phase.kind === 'improper' ? 'improper' : 'proper'}`}>
                <span className="tg-tag">{phase.kind === 'improper' ? '◆ Triggered by · improper action' : '→ Triggered by · proper action'}</span>
                <div className="tg-cause">{phase.trigger}</div>
                {phase.triggerDetail && <div className="tg-detail">{phase.triggerDetail}</div>}
              </div>
            )}

            <div className="panels4" style={{marginBottom: 14}}>
              <div className="p4">
                <div className="p4-h"><span className="lab">Synopsis</span><span className="acc">PHASE.SYN</span></div>
                <div className="syn">{phase.synopsis}</div>
                <div className="pq">"{phase.patientSays}"</div>
              </div>
            </div>

            {onInitialPhase && scenario.scene && scenario.scene.dispatch && (
              <div className="panels4" style={{marginBottom: 14}}>
                <div className="p4 dispatch-card">
                  <div className="p4-h">
                    <span className="lab">▾ Dispatch</span>
                    <span className="acc">RADIO{scenario.scene.time ? ' · ' + scenario.scene.time.split(/[,.]/)[0] : ''}</span>
                  </div>
                  <div className="dispatch-text">"{scenario.scene.dispatch}"</div>
                </div>
              </div>
            )}

            <div className="vitals4">
              <div className="vt">
                <span className="rh">◆ {phase.vitals.rhythm.toUpperCase()}</span>
                <span className="clock">PHASE VITALS · LIVE</span>
              </div>
              <div className="vrow">
                <div className="vc hr"><div className="vc-k">HR</div><div className="vc-v">{phase.vitals.hr}</div></div>
                <div className="vc bp"><div className="vc-k">BP</div><div className="vc-v">{phase.vitals.bp}</div></div>
                <div className="vc spo2"><div className="vc-k">SpO₂</div><div className="vc-v">{phase.vitals.spo2}</div></div>
                <div className="vc"><div className="vc-k">RR</div><div className="vc-v">{phase.vitals.rr}</div></div>
                <div className="vc"><div className="vc-k">EtCO₂</div><div className="vc-v">{phase.vitals.etco2}</div></div>
                <div className="vc"><div className="vc-k">Temp</div><div className="vc-v" style={{fontSize:14}}>{phase.vitals.temp}</div></div>
                <div className="vc"><div className="vc-k">BGL</div><div className="vc-v">{phase.vitals.glucose}</div></div>
                <div className="vc"><div className="vc-k">Pain</div><div className="vc-v">{phase.vitals.pain}</div></div>
              </div>
            </div>

            <div className="panels4">
              <div className="p4">
                <div className="p4-h"><span className="lab">Examination</span><span className="acc">EXAM.{phase.id.toUpperCase()}</span></div>
                <CleanExam phase={phase} />
              </div>
            </div>

            {onInitialPhase && (
              <div className="panels4" style={{marginTop: 14}}>
                <div className="p4 sample">
                  <div className="p4-h"><span className="lab">SAMPLE history</span><span className="acc">INITIAL CONTACT · S A M P L E</span></div>
                  <div className="sample-rows">
                    <div className="sample-row">
                      <span className="sample-k">S</span>
                      <span className="sample-l">Signs / Sx</span>
                      <div className="sample-v">{scenario.patient.chiefComplaint || <span className="muted">—</span>}</div>
                    </div>
                    <div className="sample-row">
                      <span className="sample-k">A</span>
                      <span className="sample-l">Allergies</span>
                      <div className="sample-v">{scenario.patient.allergies || <span className="muted">NKDA</span>}</div>
                    </div>
                    <div className="sample-row">
                      <span className="sample-k">M</span>
                      <span className="sample-l">Medications</span>
                      <div className="sample-v">
                        {scenario.patient.meds && scenario.patient.meds.length ? (
                          <ul className="sample-list">{scenario.patient.meds.map((m, i) => <li key={i}>{m}</li>)}</ul>
                        ) : <span className="muted">None reported</span>}
                      </div>
                    </div>
                    <div className="sample-row">
                      <span className="sample-k">P</span>
                      <span className="sample-l">Past Medical</span>
                      <div className="sample-v">
                        {scenario.patient.pmh && scenario.patient.pmh.length ? (
                          <ul className="sample-list">{scenario.patient.pmh.map((p, i) => <li key={i}>{p}</li>)}</ul>
                        ) : <span className="muted">None reported</span>}
                      </div>
                    </div>
                    <div className="sample-row">
                      <span className="sample-k">L</span>
                      <span className="sample-l">Last Oral</span>
                      <div className="sample-v">{scenario.patient.lastOral || <span className="muted">—</span>}</div>
                    </div>
                    <div className="sample-row">
                      <span className="sample-k">E</span>
                      <span className="sample-l">Events</span>
                      <div className="sample-v">{scenario.patient.events || <span className="muted">—</span>}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase.branches.length > 0 && (
              <div className="branchpanel">
                <div className="p4-h"><span className="lab">Branches · what happens next</span><span className="acc">→ NEXT</span></div>
                {phase.branches.map(b => (
                  <div key={b.phaseId} className={`br4 ${b.kind}`} onClick={() => setPhaseId(b.phaseId)}>
                    <span className="br4-pip"></span>
                    <span className="br4-if">If</span>
                    <span className="br4-cond">{b.criterion || b.label}</span>
                    <span className="br4-mid">→</span>
                    <span className="br4-dest">{b.label}</span>
                  </div>
                ))}
              </div>
            )}
          </main>
        ) : (
          <DebriefView scenario={scenario} recap={recap} />
        )}

        {view === 'scenario' && (
          <aside className="right">
            <div className="right-h">
              <div className="row">
                <span className="lab">Expected interventions</span>
                <span className="pct">{ct}/{total} · {pctNum}%</span>
              </div>
              <div className="progbar"><div className="fill" style={{width: `${pctNum}%`}}></div></div>
              <div className="legend">
                <span className="lg"><span className="pip critical"></span>Critical</span>
                <span className="lg"><span className="pip important"></span>Important</span>
                <span className="lg"><span className="pip supplemental"></span>Supplemental</span>
              </div>
            </div>
            <div className="right-list">
              {phase.actions.map((a, i) => (
                <div key={a.id} className={`a4 ${a.priority} ${phaseDoneIds[a.id] ? 'done' : ''}`} onClick={() => toggle(a.id)}>
                  <div className="c4"></div>
                  <div className="a4-text">{a.short || a.text}</div>
                  {i < 9 && <span className="kbd-sm">{i+1}</span>}
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

window.V4 = V4;
