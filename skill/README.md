# Scenario Generator Skill (backup)

This directory is a **backup copy** of the Claude Code skill that generates paramedic scenarios. The live copy that Claude Code actually loads lives at:

```
~/.claude/skills/scenario-generator/
```

(On Windows: `C:\Users\<you>\.claude\skills\scenario-generator\`)

## Why a backup?

Skills in `~/.claude/` are not under version control by default. Keeping a copy in this repo means:

- The scripts, SKILL.md, protocol markdown files, and schema reference are all versioned alongside the scenarios they produce.
- If `~/.claude/` is ever wiped (new machine, accidental delete, reinstall), the skill can be restored by copying this directory back.

## Restore

To restore the skill from this backup:

```bash
cp -r skill/ ~/.claude/skills/scenario-generator/
```

Then restart Claude Code.

## What each subdirectory does

- `SKILL.md` — entry point Claude reads to know the workflow.
- `scripts/` — Node.js scripts that run after Claude writes `unified.json`:
  - `validate.js` — checks scenario JSON against rules.
  - `export-realiti.js` — converts to REALITi patient monitor format.
  - `export-html.js` — generates the interactive HTML (tabs, timer, checkboxes).
  - `export-print.js` — generates the print-optimized HTML.
- `assets/scenario-template.html` — CSS/HTML template used by `export-html.js`.
- `references/schema.md` — full unified scenario JSON schema reference.
- `references/protocols/MATC/` — the MATC EMS protocol markdown files Claude reads when selecting protocols for a scenario.

## Keeping this backup in sync

After editing the live skill at `~/.claude/skills/scenario-generator/`, re-copy it here and commit:

```bash
cp -r ~/.claude/skills/scenario-generator/* skill/
git add skill/
git commit -m "sync skill backup"
```
