# Report

## File

- Write a **new** report in `audits/` at the target root on every run, even when nothing is found. `audits/` must be a real directory; a symbolic link or junction there is a publication blocker.
- Name: `YYYY-MM-DD_HH-mm-ss-<scope>.md` in local time, for example `2026-11-21_14-32-08-general.md`. `<scope>` is a short kebab-case slug of the resolved scope (`general` for a full audit).
- Publish only the complete report. When `scripts/` is installed and Node.js 18.14 or later is available, write the draft in the system temp folder and run `node <skill-dir>/scripts/publish-report.cjs --check [--forbid <regex>]... <draft-file> <target-root>/audits/<intended-filename>.md`. It fills a Summary counts row written as `| auto | auto | auto | auto | auto |` from the active findings, refuses a draft with an unfilled `<fill: …>` placeholder from `report-skeleton.cjs`, checks the format, picks a free name, prints the published path and removes the draft. Fix any reported error and retry; use the printed path in chat.
- Otherwise write UTF-8 without a byte order mark and never overwrite a report: on collision use `-2`, `-3`, … before `.md`, with a no-overwrite file operation.

## Required content, in this order

Use these section headings verbatim: Summary, Findings, Planned later, Changes since baseline, Coverage and limitations. Omit "Planned later" and "Changes since baseline" when empty.

1. **Header fields**, as a bullet list with these exact bold labels, in this order. Put each value on the same line or indent its details beneath the label.
   - **Date** local date and time matching the filename, followed by a numeric UTC offset, for example `2026-11-21 14:32:08 +01:00`
   - **Branch / commit** branch (if any) and audited commit, "no commit yet", or "outside Git"
   - **Local changes** changes of the target found before writing (excluding `audits/` unless in scope)
   - **Scope** axes, sub-categories, repository areas
   - **Criteria mode** Start with built-in grid, extended grid, or supplied criteria only. Use punctuation to separate any qualifying detail from the mode.
   - **Checks and references** checks applied, and references the user supplied (path + content hash for local files). The skill's own files are not references; give the skill version from the `SKILL.md` metadata instead.
   - **Baseline** baseline report and why it was chosen, or why none applies
2. **Summary** with the count of active findings per priority:

   | Critical | High | Medium | Low | Informational |
   | --- | --- | --- | --- | --- |

3. **Findings**. Order active findings by priority, then by impact. Fixed entries may follow the active findings.
4. **Planned later** closures.
5. **Changes since baseline** (see [tracking.md](tracking.md)), when a comparison exists. Explain the re-check for findings marked Still present, Fixed, Not reverified or Reappeared.
6. **Coverage and limitations**: start with two count bullets, then checks run with results, samples, checks not run with the reason, sub-categories not applicable. When the scope is too large to read entirely, say what was read in full, what was sampled and how, and what was not read.
   - **Files** `<n> in scope: <n> read in full, <n> sampled, <n> not read`. For material that is not files (records, log entries, pages), count those items and name the unit.
   - **Sub-categories** `<n> assessed, <n> not applicable, <n> not assessed`, counted over the grid rows in scope. In **supplied criteria only** mode, use **Criteria** instead and count the supplied criteria.

## Finding format

```markdown
### <ID> · <Priority> · <Axis> / <Sub-category> · <Confirmed | To verify> · <Status>

**<One-line title>**

- **Expected** criterion and its source.
- **Observed** what you saw, with a precise locator: [path:line](../path#Lline), section, screen, or check output.
- **Impact** consequence if unchanged.
- **Correction** proposed fix, when justified.
```

- IDs are stable across runs: one short uppercase word for the scope and a two-digit number (`GEN-01`, `USR-03`). A new finding takes the next unused number in the compatible history; never reuse an ID for a different problem.
- Use one prefix for all new IDs. Reuse the established prefix from compatible history. If older reports used several prefixes, preserve every carried ID and choose one prefix from the carried findings, or from compatible history if this report carries none.
- Every active finding, Informational included, has the Expected, Observed and Impact bullets. Put the criterion, observation and impact on the corresponding bullet or indent their detail under that bullet.
- For a point to verify, say what evidence would settle it.
- Qualify evidence from a different Git snapshot with its revision or index locator. Use a link only when it opens the cited version. See [Git scope](git-scope.md).
- One finding covers one cause in one sub-category. Split a finding that mixes gaps from different sub-categories (for example a missing file and a missing text alternative, or a missing role check and a missing organization check on the same function). Group observations when the same correction resolves them. Give independent gaps separate findings when they need different corrections, even when they appear in the same function or share an evidence location.
- `<Axis> / <Sub-category>` is one row of the grid in [criteria.md](criteria.md), spelled exactly as there. In **supplied criteria only** mode, write `Criteria / <criterion ID or short name>` instead, in the supplied criterion's own wording. Never merge or invent sub-categories; pick the closest row.
- Mask secrets and personal data in the evidence. Show no character of a secret value: a public type prefix (`sk_live_`, `ghp_`) and the length are enough. For personal data, name the field or record ID, not the value.
- Close a gap as **Planned later** only when the user or an in-scope source records an explicit decision for that gap. A proposal, TODO or tentative milestone leaves it active.
- Entries under Planned later use the same heading and evidence format, including Impact. Add a `- **Decision**` bullet and cite its source there or in a separate `- **Source**` bullet. Include the deadline or milestone if given.
- A finding marked **Fixed** in this run stays under Findings with its re-check evidence, and is not counted in the Summary table. In later runs it is no longer listed.
