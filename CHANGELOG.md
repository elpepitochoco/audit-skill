# Changelog

## 2.7.0

- Rotation computed by `baseline-delta.cjs`: it follows the chain of reports through their **Baseline** links, collects the files named in **Rotation** bullets or cited by findings, and lists up to 15 unchanged unread text files, riskiest first (tests, examples and docs last). It takes the in-scope path prefixes after the report. The checker requires a **Rotation** bullet to name its files in backticks.
- Re-audit: a finding left **To verify** is always re-checked; file names are read with `-z`, so tabs, quotes or line breaks in a name no longer split it; the installed skill folder is not listed as a change.
- The checker verifies, for a report in `audits/`, that a carried entry's linked report exists and holds the same finding ID.
- Pre-scan: a file whose parent folder links outside the target is not read; every secret on a line is reported and masked, not only the first per pattern; history reading stops after 512 MB of patches and says at which commit; only test files are kept in memory; a truncated section names the files holding the remaining leads.
- `report-skeleton.cjs` treats only "not a git repository" as outside Git and stops on any other Git failure.

## 2.6.0

- Incremental re-audit rotation: each re-audit also reads in full up to 15 in-scope files no earlier report read, riskiest first, and names them under a **Rotation** bullet in Coverage, so a partial first audit does not leave a permanent blind spot.
- Incremental re-audit: a failing `git diff` or `git ls-files` requires a full audit instead of reading as no change; findings on dependencies or secrets are always re-checked, and their checks run on the whole scope; a carried entry whose full-entry report is missing is re-checked; a branch name that looks like a hash is no longer read as the baseline commit.
- The checker requires a carried entry to name, in backticks, the commit its files are unchanged since.
- `report-skeleton.cjs` stops when `git status` or `git rev-parse` fails instead of recording no local changes.
- `publish-report.cjs` fills the `auto` counts row only inside Summary.
- SARIF: the location comes from the Observed bullet first, link encoding is kept, and a finding with no cited file points to its heading in the report, since GitHub code scanning rejects results with no location.
- Tests pass on CI runners with no Git identity and with `/` path separators.

## 2.5.0

- Carried entries: in an incremental re-audit, a Still present finding whose cited files are unchanged is written as one `- **Carried**` bullet linking the report that holds its full entry, instead of repeating Expected, Observed and Impact. `baseline-delta.cjs` follows the chain to that report. The checker accepts the bullet only on Still present findings and still counts them; earlier reports stay valid.
- Pre-scan detectors: CI workflows (`pull_request_target` with a checkout, no `permissions`, `write-all`, actions not pinned to a commit SHA, untrusted event fields expanded), container files (`latest` or missing tag, final stage as root, secrets set by `ENV` or `ARG`), committed `.env` files, and HTML pages with no title or language.
- SARIF: `scripts/report-sarif.cjs` converts a report to SARIF 2.1.0 for CI and GitHub code scanning; Planned later closures are suppressed results.

## 2.4.0

- Incremental re-audit: `scripts/baseline-delta.cjs` compares the target with the commit the baseline audited and marks each open finding re-check or cited files unchanged. With unchanged criteria, a re-audit examines only the changed files and the findings they touch; the baseline is chosen before examining.
- Report skeleton: `scripts/report-skeleton.cjs` writes a draft with the Date and UTC offset, branch and commit, local changes, skill version and section headings. `publish-report.cjs` fills a Summary row written as `auto` and refuses unfilled placeholders.
- The pre-scan runs for repository, folder and secrets, dependencies or documentation scopes, not for a commit or a named check; a history lead is confirmed with one `git show`.
- Benchmark: both modes get the same request (a case with no parameters asks for a whole-repository audit); `usage.js` reports cached, fresh and output tokens and turns; case 78 replays a re-audit after two fixes.

## 2.3.1

- Pre-scan: never reads through a symbolic link, lists a file it cannot read under Not scanned instead of stopping, reports a malformed Markdown link instead of crashing, masks secrets in every section, says when `git log` failed, reads the patches of the newest 5,000 commits only and says so, and uses Git options available since 2.15.
- If the pre-scan fails, the agent makes its checks by reading and records the failure. A flaw the target calls deliberate is still reported.
- Benchmark: `usage.js` lists steps without usage data and marks the total incomplete.

## 2.3.0

- Pre-scan: `scripts/scan.cjs` lists leads before the examination — secrets in the tree and in the Git history (masked), documented commands and Markdown links with no target, unpinned dependencies and missing lockfiles, vendored or minified files, source files no test names — and the file count for Coverage. Read-only, no dependency; the agent confirms each lead in the source.
- Benchmark: eleven public cases with published answers (OWASP NodeGoat, Juice Shop and Benchmark, leaky-repo, GitHub Actions Goat, nodejs-goof, TerraGoat, QuixBugs, the Raha hospital dataset, the W3C Before and After Demonstration, n-plus) cover every audit axis except Operability logging and recovery. `run.sh` fetches each at a pinned commit and removes its answer key; `score-public.js` scores the report. Results in `acceptance/RESULTS.md`.
- Benchmark: `acceptance/usage.js` sums token usage per run. Case 77 hides a live key in a file deleted 100 commits back.

## 2.2.0

- Lighter rules: a first audit loads 17.9 KB instead of 27.5 KB. Rare cases (criteria conflicts, supplied criteria only, deeper audit, missing target, folder outside Git, sampled data, early-stopping checks) moved to `references/special-cases.md`, read on demand; `tracking.md` is read only when earlier reports exist; publication rules condensed. Checked on four benchmark cases with Claude Code and Codex: same findings, fewer tokens.
- The installed skill folder is not part of the audited target.

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
