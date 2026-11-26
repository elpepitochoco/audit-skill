# Changelog

## 2.2.0

- Lighter rules: a first audit loads 17.9 KB instead of 27.5 KB. Rare cases (criteria conflicts, supplied criteria only, deeper audit, missing target, folder outside Git, sampled data, early-stopping checks) moved to `references/special-cases.md`, read on demand; `tracking.md` is read only when earlier reports exist; publication rules condensed.
- The installed skill folder is not part of the audited target.
- Benchmark: `acceptance/usage.js` sums token usage per run; first comparison with and without the skill in `acceptance/RESULTS.md`.

## 2.1.0

- Reports from 1.x stay usable as a baseline again: 2.0.0 only added coverage counts, so the history is kept.
- The publisher keeps a draft that lies inside the audited target, even when that target is in the temp folder.
- Without hard links, the publisher reserves the name with a lock and renames the complete file into place, so readers never see a partial report.
- Benchmark: the case 1 scorer matches whole words, and `AUDIT_SKILL=none` runs a case without the skill for comparison.

## 2.0.0

- Coverage and limitations starts with two count bullets: **Files** (in scope, read in full, sampled, not read) and **Sub-categories**, or **Criteria** in supplied criteria only mode (assessed, not applicable, not assessed). The checker requires them.
- Reports from 1.x were no longer used as a baseline (reverted in 2.1.0).

## 1.0.0

First public version: built-in grid, report format, tracking across runs, optional Node.js scripts for checking and publishing reports.
