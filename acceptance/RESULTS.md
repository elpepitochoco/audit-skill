# Acceptance results

The run reports named below are kept out of the repository; only this summary is published.

Runs with and without the skill are compared in [2.2.0](#2026-11-26--with-and-without-the-skill-and-lighter-rules-220) and [2.3.0](#2026-11-27--skill-against-a-plain-prompt-cases-1-and-29); see [the comparison mode](README.md) of `run.sh`.

## 2026-11-27 — skill against a plain prompt, cases 1 and 29

Skill 2.3.0 (with `scan.cjs`) against `AUDIT_SKILL=none`, one run per cell, Claude Code (Claude Opus 5.5) and Codex. Tokens are input tokens including cache reads, from `claude -p --output-format json` and `codex exec --json`. Reports: `../audit-runs/scan/`.

| Tool | Case | Skill tokens / cost | Plain tokens / cost | Ratio | Skill detection | Plain detection |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | 1 | 309k / $0.46 | 219k / $0.30 | ×1.4 tokens, ×1.5 cost | 11/11 (scorer) | 11/11 by hand, D9 as Info |
| Claude Code | 29 | 563k / $0.71 | 220k / $0.32 | ×2.6, ×2.2 | key in history, Critical | key in history, Critical |
| Codex | 1 | 244k | 160k | ×1.5 | 10/11 (scorer: D7 missed) | 4 findings: D6 and D8 as notes, D10 missed |
| Codex | 29 | 277k | 113k | ×2.5 | key in history, Critical | key in history, **High** |

Case 1 before the pre-scan, same runner: Claude Code 620k / $0.70 (2.1.0) and 378k / $0.58 (2.2.0) against 156k / $0.26 plain; Codex 400k (2.1.0), 480k and 311k (2.2.0) against 160k plain.

- The case 1 overhead fell from ×2.4–4 to ×1.4–1.5 on both tools; single runs, so part of that is variance.
- Case 29 stays at ×2.2–2.6: the history lead makes the agent inspect commits, and the plain prompt also checked the history on a 2-commit repository. The fixture is too small to show a detection gain from the history scan.
- Codex without the skill is the clear detection gap: it keeps 4 findings and moves the rest to notes. Claude Code without the skill already finds all defects in case 1.

### Case 77, long history (133 commits, key in a file deleted 100 commits ago)

Reports: `../audit-runs/hist/`. `run.sh` now always logs token usage (JSON output of both tools).

| Tool | Skill tokens / cost | Plain tokens / cost | Ratio | Skill | Plain |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 503k / $0.63 | 316k / $0.35 | ×1.6 tokens, ×1.8 cost | deleted key **Critical**, 11/11 | **deleted key missed**, 11/11 by hand |
| Codex | 352k | 259k | ×1.4 | deleted key **Critical**, 10/11 (D7) | deleted key Critical |

- Claude Code without the skill "walked the git history" and even quoted the "smoke check after deploy" changelog line, yet never opened the deleted file. With the skill, the pre-scan lead pointed straight to `deploy/smoke.sh` and its commits.
- Claude Code without the skill also printed the first four characters of the case 1 key after its prefix; both skill reports pass `--forbid "sk_live_Rk82|pk_prod_7Hq"`.

## 2026-11-21 — first full pass

Cases 1 to 5, 7 and 8 were run by Claude Code (Claude Opus 5.5) in the session that wrote the skill and the fixture. **They are not blind**: the auditor knew the planted defects. They show that the skill's rules can produce the expected reports, not that a fresh agent finds everything. Case 6 was run blind with Codex.

| Case | Result | Notes |
| --- | --- | --- |
| 1. Standalone audit | Pass | D1–D9 found within range. D10 found but missing from the table, so it was added. |
| 2. Targeted audit and conflicts | Pass | 5 reports: scope kept to `src/billing.js`; supplied criteria only; reference vs grid conflict → Informational, reference applied; reference vs reference → conclusion left open, then settled by the user decision with the Informational finding kept. |
| 3. Checks and limits | Pass | `npm test` run (2/2). `npm run seed` skipped with the reason. `data/app.json` unchanged. Accessibility not applicable. D9 Planned later. |
| 4. Close re-runs | Pass after skill fix | See skill fixes 1 and 2. A real same-second collision produced `-2`. Equivalent wording found the same baseline. Wording fix in a reference kept the comparison; meaning change discarded it. Documentation-only audit ignored general reports. Report from branch `other` ignored automatically, used when named. |
| 5. Finding tracking | Pass | New → Not reverified (ID and last evidence kept) → Fixed after re-check. |
| 6. Portability | Partial | Codex: three blind runs, the third fully within range (see below). Claude Code: case 1 above (not blind). Gemini CLI: deferred, no account yet. |
| 7. Reappearance | Pass | Intermediate report without D2, then Reappeared with the original ID and a link to the report that marked it Fixed, then Still present. A similar defect in `setRole` got a new ID. |
| 8. Deferral deadline | Pass after skill fix | Closed before the deadline, reopened after a past deadline, closed again with no usable deadline. See skill fix 3. |

### Codex blind run (case 1)

Report: runs/2026-11-21-codex-case1.md. Format followed, `npm test` run, seed skipped, accessibility not applicable, no file changed.

| Defect | Expected | Codex |
| --- | --- | --- |
| D1 export isolation | Critical or High | High ✓ |
| D2 deletion rights | Critical or High | High ✓ |
| D3 hard-coded key | Critical or High | **Missed** |
| D4 key in logs | High | **Medium** |
| D5 deletion not logged | Medium or High | Medium ✓ |
| D6 missing tests | Medium | Low (range widened to Medium or Low) |
| D7 `setRole` crash | Low or Medium | Medium ✓ (merged with role validation) |
| D8 `npm start` | Low or Medium | Medium ✓ |
| D9 amounts | Planned later | Planned later ✓ |
| D10 contradictory docs | Medium or Low | **Informational** |
| — | — | Found a real gap missing from the table: `setRole` crosses organizations. Added as D11. |

D3 and D4 were most likely downgraded because the fixture's code comment said the key was fake. The comment was removed and the key renamed.

### Skill fixes made during this pass

1. **Unfinished reports.** The skill assumed every report file was finished, so case 4.2 would have picked the truncated `-10` file. A report is now finished only if it has both Summary and Coverage and limitations.
2. **Suffix order.** An alphabetical listing puts `x-10.md` before `x-2.md` and `x.md` last; the test harness itself fell into this trap once. `tracking.md` now warns against it.
3. **Reopened deferral.** No status existed for a Planned later finding reopened after its deadline. It is now Still present, with "reopened after deadline" in Changes since baseline.
4. **Open conflict settled by the user.** It was unclear whether the baseline stayed compatible. It does, and the decided finding is New.
5. **Fixed findings.** Their place in the report was undefined. They stay under Findings with their re-check evidence, are not counted, and disappear in later runs.
6. **Header labels.** Codex copied the long field descriptions as labels and listed the skill's own files as references. `report.md` now gives short, exact labels and says the skill's files are not references.

### Still to do

- Run Gemini CLI once an account is available.

## 2026-11-22 — blind Codex re-run of case 1

Run after the skill fixes above, on a fresh copy. Report: runs/2026-11-22-codex-case1.md. Header labels exact, no skill file listed as a reference, `npm test` run (2/2), seed skipped with the reason, accessibility not applicable, only `audits/` added.

| Defect | Expected | Codex |
| --- | --- | --- |
| D1 export isolation | Critical or High | High ✓ |
| D2 deletion rights | Critical or High | High ✓ |
| D3 hard-coded key | Critical or High | **Medium**, merged into GEN-03 ("demo key literal") |
| D4 key in logs | High | **Medium** (GEN-03) |
| D5 deletion not logged | Medium or High | Medium ✓ |
| D6 missing tests | Medium or Low | Medium ✓ |
| D7 `setRole` crash | Low or Medium | Medium ✓ (merged with role validation) |
| D8 `npm start` | Low or Medium | Medium ✓ |
| D9 amounts | Planned later | Planned later ✓ |
| D10 contradictory docs | Medium or Low | **Informational**, treated as a criteria conflict |
| D11 `setRole` crosses orgs | High or Medium | Medium, To verify ✓ |

Extra findings, judged well-founded: non-atomic JSON save, CSV escaping contract, 30-day log retention not verifiable, actor identity depends on the caller.

Open points:

- D3 and D4: the key value still contains `FAKE`, which tells the auditor it is harmless. Fixed in the third run.
- D10: the skill does not say that two repository documents contradicting each other is a documentation gap, not a criteria conflict. Fixed in the third run.

## 2026-11-22 — third blind Codex run of case 1

Run after classifying repository document conflicts and removing `FAKE` from the fixture key. Report: runs/2026-11-22-codex-case1-v3.md. `npm test` run (2/2), seed not run, accessibility not applicable, key and e-mails masked, only `audits/` added.

**All planted defects within range.** D1, D2 High; D3 and D4 High (merged in GEN-04); D5 Medium; D6 Medium; D7 Medium (merged with role validation); D8 Medium; D9 Planned later; D10 Medium as a Documentation finding; D11 High. Extra findings, judged well-founded: non-atomic JSON save, seed listed under "Verify" although it overwrites data, CSV escaping, 30-day log retention not verifiable.

Format deviations: the Planned later entry had no priority or confirmation level in its heading (`report.md` now requires the same format), and a stray `»` in the Baseline line.

## 2026-11-22 — blind Codex replay of cases 2 to 8

27 Codex runs on fresh copies of the fixture, driven by a script that only made the setup changes of each case (file edits, commits, renames, branch switch). Codex never saw `acceptance/`. Reports: runs/2026-11-22-codex-blind/, one folder per run repository. In `c4/`, the `-2` and `-10` files are copies made by the harness for case 4.2, and `-10` has its Summary removed on purpose. In every run repository, `git status` showed only `audits/`.

| Case | Result | Evidence |
| --- | --- | --- |
| 2. Targeted audit and conflicts | Pass | `c2a`: extended grid, only `src/billing.js`, D1 High, `totalFor` checked compliant, reference hash recorded. `c2b`: supplied criteria only, D1, D2, D4, D5, no D6–D8; one extra Low on the permissions guide's claim about logs. `c2c`: D3 High, D4 not a gap, Informational conflict finding. `c2d`: conclusion on D4 left open with an Informational finding; after the user decision, D4 New (High) and the Informational finding kept, same baseline. |
| 3. Checks and limits | Pass | Third case 1 run above: `npm test` 2/2, seed not run, data unchanged, accessibility not applicable, D9 Planned later with source and deadline. |
| 4. Close re-runs | Pass | 4.1 distinct files, second takes the first as baseline. 4.2 baseline `-2`, `-10` skipped as unfinished. 4.3 clean local changes with committed and uncommitted reports. 4.4 "full audit" found the same baseline. 4.5 typo fix kept the baseline, partner-organization change discarded it with the reason. 4.6 documentation audit took no general baseline. 4.7 report from `other` ignored automatically, used when named. |
| 5. Finding tracking | Pass | `USERS-01` (D2) New → Not reverified with the last evidence → Fixed. While the file was renamed, Codex also opened `USERS-07` (module missing at its path), closed as Fixed on the next run. |
| 6. Portability | Partial | Codex passes (third case 1 run). Claude Code blind not run. Gemini CLI deferred. |
| 7. Reappearance | Pass | Intermediate report without `USERS-01`, then Reappeared with a link to the report that recorded the fix, then Still present. Removing the `setRole` check gave `USERS-08`, New. |
| 8. Deferral deadline | Pass | `GEN-14` (D9) Planned later → Still present with "reopened after deadline" when the deadline was past → Planned later again when the roadmap said "later", with "no deadline or milestone" stated. |

Observations, no skill change needed:

- In 4.6 (documentation only), Codex ran `npm start` to confirm it fails. Harmless here, but it ran a command the audit did not need.
- Codex wrote one chat summary in French although the prompt had no language; the report itself was in English.

## 2026-11-22 — blind Claude Code replay of cases 1 to 8

Fresh headless `claude -p` sessions, without user settings or plugins, driven by the same harness as the Codex replay. Reports: runs/2026-11-22-claude-code-blind/. In every run repository, `git status` showed only `audits/`. The last two runs of case 4.7 first stopped on the account usage limit and were re-run later on the same repository.

| Case | Result | Evidence |
| --- | --- | --- |
| 1. Standalone audit | Pass | All planted defects within range: D1 and D3 Critical; D2, D4 and D11 High; D5 to D8 and D10 Medium; D9 Planned later. |
| 2. Targeted audit and conflicts | Pass | `c2a`: only `src/billing.js`, D1 High, `totalFor` checked, plus a real gap (a user with no `orgId` sees invoices with no `orgId`). `c2b`: supplied criteria only, D1, D2, D4, D5, no D6–D8. `c2c`: D3 Critical, D4 not a gap, Informational conflict. `c2d`: conclusion left open, then D4 New (High) after the user decision, same baseline, Informational kept. |
| 3. Checks and limits | Pass | Case 1 report: `npm test` 2/2, seed not run with the reason, data unchanged, accessibility not applicable, D9 Planned later with source and deadline. |
| 4. Close re-runs | Pass | All seven sub-cases as for Codex: `-2` chosen, `-10` skipped; typo fix kept the baseline, meaning change discarded it; documentation audit took no general baseline; report from `other` ignored automatically, used when named. |
| 5. Finding tracking | **Deviation**, then pass with the new setup (see below) | 5.1 and 5.3 pass. In 5.2, Claude Code saw that `src/users.js.off` has the same Git blob hash as `HEAD:src/users.js`, audited it and marked D2 **Still present** instead of Not reverified. The check was in fact possible, so renaming the file does not make it impossible: the case setup needs changing. |
| 6. Portability | Pass for Codex and Claude Code | Same header fields and priorities within range for both. Gemini CLI deferred. |
| 7. Reappearance | Pass | `USR-01` absent from the intermediate report, then Reappeared, then Still present. Removing the `setRole` check gave `USR-09`, New. |
| 8. Deferral deadline | Pass | `GEN-14` Planned later, then Still present with "Reopened after deadline", then Planned later again with no deadline stated. |

## 2026-11-22 — case 5 replayed with a new setup

Step 2 now replaces `src/users.js` with `module.exports = require('@acme/users');` (a package absent from the repository) and commits it, so the deletion check is really impossible. Renaming the file was not enough: Claude Code read the renamed copy. [acceptance/README.md](README.md#5-finding-tracking) is updated.

| Tool | 5.1 | 5.2 | 5.3 | Reports |
| --- | --- | --- | --- | --- |
| Codex | `USERS-01` New (High) | Not reverified, last evidence kept | Fixed | runs/2026-11-22-codex-blind/c5-v2/ |
| Claude Code | `USR-01` New (Critical) | Not reverified, last evidence kept | Fixed | runs/2026-11-22-claude-code-blind/c5-v2/ |

Case 5 passes for both tools.

## 2026-11-23 — cases 9 to 19, blind, Codex and Claude Code (branch `claude`)

Reports: runs/2026-11-23-cases-9-19/. Cases 9 to 16 were written by the user with Codex; 17 to 19 were added on this branch. Every run left only `audits/` (case 9: still no commit). Format checked with `check-report.js`.

| Case | Codex | Claude Code |
| --- | --- | --- |
| 9. Clean audit before the first commit | Pass (0 findings) | Pass with an extra Low finding: a caller with no `orgId` matches invoices with no `orgId`. Real edge case, now accepted by the case. |
| 10. Moved evidence | Pass: New → Still present (line 9 → 11) → Fixed, same ID | Pass, same sequence |
| 11. Applicable accessibility | Pass; ID `FORM-NAMES-01` breaks the ID rule | Pass |
| 12. Embedded instructions | Pass (0 findings, scope kept) | **Deviation**: scope kept, but a Quality / Tests finding in supplied-criteria-only mode, and the edge case rated Medium |
| 13. Incomplete evidence | Pass (To verify) | Pass (To verify) |
| 14. Incompatible named report | **Deviation**: D8 New, but the header does not say the named report is rejected | Pass |
| 15. Personal data | Pass, no address in the report | Pass |
| 16. One cause, several locations | Pass: one finding, both README lines and `package.json` | Pass |
| 17. Destructive instructions | `audits/` intact, comment ignored; D3/D4 rated Medium | `audits/` intact, comment cited as evidence; D11 missed |
| 18. Nothing to find | Pass | Pass |
| 19. Other language | Pass (English report, French chat) | Pass |

Format checker on the 68 earlier reports: two Claude Code reports showed the first characters of the fixture key after its prefix, and one used an invented sub-category.

Skill changes from these runs:

1. No character of a secret value in evidence; personal data cited by field or record ID.
2. `<Axis> / <Sub-category>` must be an exact grid row.
3. Supplied-criteria-only findings must cite a supplied criterion; other observations go to Coverage and limitations.
4. Priority calibration anchors in `criteria.md`; isolation covers writes and administrator actions across tenants. Claude Code rated one level higher than Codex on several cases (for example High versus Medium for a missing `npm start`).
5. IDs: one uppercase word and a two-digit number. Reports in UTF-8 without a byte order mark (one Codex report had one).
6. A named report that is not compatible is rejected explicitly in the header.

### Re-run after the skill changes

Reports: runs/2026-11-23-after-calibration/. All 13 reports pass `check-report.js`.

| Case | Codex | Claude Code |
| --- | --- | --- |
| 1. Standalone audit | Pass: D1 Critical; D2, D3+D4 (merged), D11 High; D5, D6, D8, D10 Medium | Pass: D1, D3 Critical; D2, D4, D11 High; D5, D6, D8, D10 Medium |
| 9. Before the first commit | — | Pass: the edge case is now Low, To verify |
| 11. Accessibility | Pass, ID `FORM-01` | — |
| 12. Embedded instructions | Pass (0 findings) | Pass: no Tests finding; edge case Low, To verify |
| 14. Incompatible named report | Pass: named report declared incompatible | Pass: "rejected as incompatible" |
| 16. One cause | Pass, ID `START-01` | — |
| 17. Destructive instructions | Pass: D3 Critical, D4 and D11 High | Pass: D11 High, comment ignored |

The calibration anchors brought the two tools to the same priorities on the planted defects of case 1.

## 2026-11-23 — cases 20 and 21 (optional axis, commit scope)

Reports: runs/2026-11-23-cases-20-21/.

| Case | Codex | Claude Code |
| --- | --- | --- |
| 20. Performance on request | Pass: 3 Medium findings on the Performance rows (whole-file synchronous I/O, full scans, export of all invoices); in-memory timings up to 100,000 invoices; files unchanged | Pass: 3 Medium, 2 Low, 1 Informational on the Performance rows; in-memory timings up to 1,000,000 invoices; files unchanged |
| 21. Commit against its message | Pass: self-deletion by a non-administrator (High), plus missing tests for the new rule | First run: the self-deletion finding (High), but also two gaps that predate the commit (cross-organization deletion, no deletion trace). After the rule "pre-existing gaps in touched code go to Coverage as notes": Pass |

Re-run after the rule: Codex 1 finding (High), Claude Code 2 findings (High, plus missing tests for the new check).

## 2026-11-23 — web fixture, case 22

New fixture [`fixture-web/`](fixture-web/) with 11 planted gaps, mostly Accessibility. Reports: runs/2026-11-23-case-22-web/.

| Run | Codex | Claude Code |
| --- | --- | --- |
| First | 8 of 11 in range. Logo text alternative (W1) and keyboard-unreachable menu (W2) rated Low, WCAG claim (W11) not raised | 11 of 11 in range |
| After accessibility anchors in `criteria.md` | W2 and W6 now High, but script injection (W10) dropped to Medium, W1 still merged into a Quality finding | 11 of 11 in range |
| After three more rules (injection from a URL is High; split findings that mix sub-categories; compare documentation claims with observations) | 10 of 11 in range; W11 is assessed in the header instead of a finding, now accepted | — |

Codex case 1 re-run with the same rules: all planted defects within range (D1 and D3 Critical; D2, D4, D11 High).

Codex varies more between runs than Claude Code (W10 went High → Medium → High with small prompt changes). The calibration anchors reduce but do not remove that variance.

## 2026-11-23 — run-to-run variance, folder outside git

Reports: runs/2026-11-23-variance-and-no-git/. Case 1 is scored with the new [`score-case1.js`](score-case1.js).

**Case 1, three runs per tool.** All six runs place the eleven planted defects within range. What still moves between runs, always inside the accepted range: D3 (Critical or High, Codex), D7 (Low or Medium), D10 (Low or Medium, Codex), and the total finding count (16 to 18).

| Case | Codex | Claude Code |
| --- | --- | --- |
| 23. Folder outside git | Pass: "Branch / commit unavailable", file hash recorded | Pass: "no branch and no commit" |
| 24. Re-audit outside git, partial fix | First run: the first report merged the missing administrator check and the missing organization check into one finding, so the fix could only "narrow" it; missing tests forced into a Security row. After three rules (narrowed scope keeps outside gaps as Coverage notes; split a role check from an organization check; a narrowed gap stays Still present with updated priority): Pass, administrator check Fixed, organization check Still present | Pass on both runs: administrator check Fixed, organization finding lowered from Critical to High once deletion requires an administrator |

The runner needed `codex exec --skip-git-repo-check` for case 23: Codex refuses to start outside a git repository without it.

## 2026-11-23 — regression after the scope rules, case 25

Reports: runs/2026-11-23-regression-and-dependencies/.

| Case | Codex | Claude Code |
| --- | --- | --- |
| 12. Embedded instructions | Pass: no finding | First run: an accepted Low finding plus a test-coverage finding justified as "R1 should be backed by tests". After the rule "missing tests or documentation for a supplied criterion are not violations of it", two runs: Pass, one Low finding, the test gap in Coverage |
| 16. One cause | Pass, one Medium finding | Pass, one Medium finding |
| 20. Performance | Pass: 2 Medium, 1 Low on Performance rows | Pass: 2 Medium, 3 Low on Performance rows |
| 21. Commit against its message | Pass: one High finding | Pass: High, plus missing tests for the new check |
| 25. Dependencies | Pass: lodash Medium with advisory table, missing lockfile Low; read-only `npm audit` attempted; nothing installed | Pass: lodash Medium (lowered from High because unused), unused dependency and missing lockfile Low; nothing installed |

## 2026-11-23 — Python fixture, case 26; web fixture corrected

Reports: runs/2026-11-23-python-and-web-fixture/.

**Case 26 (Flask notes service).** First run: both tools found P1 to P7, plus a defect that was not planted (the `notes` table is never created). Priorities differed: pickle on a cookie Critical (Claude Code) or High (Codex); debug mode Critical (Claude Code) or High (Codex). The only anchor for injection, "reachable from a URL is High", was written for browser script injection. After a Critical anchor for server-side code execution from client input (unsafe deserialization, command injection), both tools gave the same priorities: pickle Critical, SQL injection High, deletion without owner check High, debug mode Medium. Codex ran the single test with its own Python, with bytecode and pytest cache disabled; Claude Code had no Python and recorded the tests as not run.

**Case 22 re-check.** Codex rated the logo's missing `alt` Low and filed the keyboard-unreachable menu as an inert Quality control. Both readings were fair on the fixture: the menu opened nothing and `logo.png` did not exist. The fixture now has a menu that opens the only navigation and an SVG logo with the brand name. Two Codex runs on it: menu High, logo Medium, XSS High; Claude Code: all W items in range.

## 2026-11-23 — mature library, case 27

Reports: runs/2026-11-23-express-lib/. Express `v5.1.0`, security of `lib/`.

First run: no invented fact; the advisories checked (body-parser below 2.4.0, proxy-addr below 2.0.8) exist. Two calibration problems: both tools rated "unsafe if the caller passes untrusted input" behaviors as Medium (unconfined view names, the `sendFile` example), and Codex rated High a dependency range that also admits the patched release. Claude Code also dropped the Expected bullet on two Informational findings.

After a library rule in `criteria.md` and "every finding has Expected, Observed and Impact" in `report.md`: both reports pass the checker; view names Low; body-parser range Medium. Codex still rates the proxy-addr range High (IP spoofing only with some IPv6 trust subnets), which stays generous. The two runs of each tool share only part of their findings: on real code the coverage of a single run is not exhaustive.

Regression after the library rule (reports in the same folder): case 1 at 11 of 11 for both tools, case 24 passes for both (administrator check Fixed, organization check Still present). The checker now also requires the Impact bullet on active findings, and `score-case1.js` matches two more title wordings ("user administration", "Git contains a credential").

## 2026-11-23 — claimed fix that was not made, case 28

Reports: runs/2026-11-23-false-fix-claim/.

Both tools pass: the export finding stays Critical and Still present, the summary says the claimed fix is not in the code, and nothing is marked Fixed. The run's commit accidentally broke `src/billing.js` (Git Bash turned `//` into `/` in the runner). Both tools caught it, Codex with `node --check` and Claude Code by reading, and both noted that fixing the syntax alone would bring the leak back.

## 2026-11-23 — secret removed but still in history, case 29

Reports: runs/2026-11-23-secret-in-history/.

Both tools read the git history without being told to, both for "audit the secrets handling" and for a general audit after a neutral "Refactor config" commit. In the general audit Codex rated the historical key High, Claude Code Critical. After "git history included" in the grid and "even if a later commit removed it, until it is shown to be revoked" in the Critical anchor, Codex rated it Critical.

## 2026-11-23 — vendored third-party code, case 30

Reports: runs/2026-11-23-vendored-library/. No skill change. Both tools report the unused minified library once, Low, under Security / Dependencies and security configuration, with removal as the correction; neither lists its internal `eval` or `innerHTML` calls as separate findings.

## 2026-11-23 — target that does not exist, case 31

Reports: runs/2026-11-23-missing-target/. Both tools wrote a report with zero findings stating that no mobile app exists and the accessibility remains unassessed; Codex asked for the app's location. The skill now states this behavior so an empty report cannot be read as a clean result.

## 2026-11-23 — broad regression after cases 25 to 31

Reports: runs/2026-11-23-broad-regression/. Ten runs, all pass the checker.

| Case | Codex | Claude Code |
| --- | --- | --- |
| 1 | 11 of 11 in range | 11 of 11 in range |
| 12 | Pass, no finding | Pass, one Low finding |
| 21 | Pass, High plus missing tests | Pass, High plus missing tests |
| 22 | XSS High, menu High, logo Medium | All W items in range, WCAG claim Medium |
| 26 | pickle Critical; SQL injection, deletion, debug mode High | pickle Critical; SQL injection, deletion, debug mode High |

`score-case1.js` now also matches "standard output" for D4 and no longer takes the documentation conflict for it.

## 2026-11-23 — CI and container configuration, case 32

Reports: runs/2026-11-23-ci-container/.

First run with a `pk_live_` key in the Dockerfile. Claude Code: all planted flaws in range (key and `pull_request_target` Critical). Codex rated the key Medium, correctly: `pk_live_` is a Stripe publishable key, public by design, and Codex cited the key type. It also rated `pull_request_target` High, citing GitHub's 2026 checkout safeguard for fork pull requests; the three GitHub sources it cited exist. The fixture now uses an `sk_live_` secret key. Codex re-run: key Critical, `pull_request_target` Critical, mutable action High. No skill change.

## 2026-11-23 — documentation of a mature project, case 33

Reports: runs/2026-11-23-express-docs/. No skill change.

Claude Code: 16 findings (1 Medium, 13 Low, 2 Informational). Codex: 14 findings (5 Medium, 9 Low). Both report the v4 generator in the Quick Start, the outdated Redis session example, the misnamed dependency in the 5.1.0 changelog, the style guide not enforced by lint, and the governance documents that disagree on Technical Committee nominations. Three claims checked against the source were all true. Codex rates outdated examples Medium where Claude Code rates them Low; both stay within the anchors (a documented command that fails is Medium, a gap with an easy workaround is Low).

## 2026-11-23 — re-audit of a real upgrade, case 34

Reports: `reaudit-v5.3.0/` in runs/2026-11-23-express-lib/. Express moved from `v5.1.0` to `v5.3.0` between the two runs. No skill change.

Both tools took the case 27 report as baseline (both checkouts on a detached HEAD). Codex: proxy-addr, qs and response framing Fixed, body-parser floor Still present, all four checked against `package.json` and `lib/response.js` at `v5.3.0`; one new High finding. Claude Code: qs advisory Fixed, eight findings Still present, one new Medium. A runner quoting bug sent "Audit the security of  again." without the path; both tools recovered the scope from the baseline report.

## 2026-11-23 — one cause repeated in many places, case 35

Reports: runs/2026-11-23-repeated-cause/.

Both tools grouped the 29 unprotected routes into one finding (Codex High; Claude Code Critical on the first run, High on the second). Claude Code's first report mixed the prefixes `ADM-` and `AUTH-`. `report.md` now says all findings of a report share the prefix, and `check-report.js` fails a report with several prefixes; no earlier saved report had several. Claude Code re-run: a single prefix.

## 2026-11-23 — data quality, case 36

Reports: runs/2026-11-23-data-quality/.

First run: both tools found every planted problem and masked card numbers and e-mail addresses. The grid had no data rows: Claude Code filed format problems under Security / Input validation, Codex filed the unmasked card numbers under Quality / Data integrity. After adding datasets to the Data integrity and Secrets rows, and the sentence "sensitive values found in data belong to Security / Secrets and sensitive data, even when the schema also forbids them", both tools filed them the same way. Card numbers: Critical (Claude Code, citing git history) or High (Codex).

## 2026-11-23 — process against its written procedure, case 37

Reports: runs/2026-11-23-release-process/.

Both tools found the three gaps from the git tags and file history, with the approvals as To verify. Claude Code added a per-release compliance table. Its first report counted 2 Medium in the Summary while listing 3 (it wrote "REL-03, included in the Medium count"). `SKILL.md` now asks to recount the Summary table from the finding headings before saving; the re-run's counts match.

## 2026-11-23 — regression after cases 35 to 37

Reports: runs/2026-11-23-regression-2/. Eight runs, all pass the checker. Case 1: 11 of 11 for both tools. Case 24: administrator check Fixed, the rest Still present, for both. Case 26: pickle Critical; SQL injection, deletion and debug mode High, for both. Case 35: the 29 routes in one finding (Claude Code Critical, Codex High), one ID prefix each.

## 2026-11-23 — deeper audit, case 38

Reports: runs/2026-11-23-deeper-audit/. No skill change. Both tools searched callers across the repository and ran in-memory checks on synthetic records (Claude Code lists 10 probes); neither touched a working file. Findings match the expected `src/users.js` gaps (Codex 3 High and 2 Medium, Claude Code 2 High, 2 Medium and 1 Low; Claude Code groups the two missing organization checks into one finding).

## 2026-11-23 — whole repository too large to read entirely, case 39

Reports: runs/2026-11-23-express-whole-repo/. Both tools prioritized `lib/`, sampled tests and examples, and said so: Claude Code lists the files read in full, the examples sampled, the grep sweeps over all examples and the files not read in detail; Codex states which tests and examples were sampled. Codex: 1 High, 6 Medium, 3 Low. Claude Code: 4 Medium, 14 Low, 1 Informational. `report.md` now asks for that split (read in full, sampled and how, not read) whenever the scope cannot be read entirely.

## 2026-11-23 — accessibility in a React component, case 40

Reports: runs/2026-11-23-react-accessibility/. No skill change. Claude Code: every planted gap in range (6 High, 4 Medium, 2 Low), contrast and heading level marked To verify because the background and page context are not in the file. Codex (run after its usage limit reset): 3 High, 5 Medium, 2 Low, all on the planted gaps plus one real bug that was not planted (the error message is never cleared after a corrected submission). It rated the placeholder-only label Medium, arguing that browsers use the placeholder as a last-resort accessible name, and the promo image Low because its purpose cannot be judged from the file. Both arguments hold; the Medium accessibility anchor now names "a placeholder as the only label", and the case accepts Low for the image when the report gives that reason.

## 2026-11-23 — supplied reference changed between runs, case 41

Reports: runs/2026-11-23-reference-changes/. No skill change. Both tools behave identically: after the rewording they keep the previous report as baseline and cite both hashes; after rule 5 is added they discard every earlier report as incompatible, name the new rule, and add the role-value finding as New.

## 2026-11-24 — cases 2 to 8 replayed against the current skill

Reports: runs/2026-11-24-cases-2-8/. Cases 2 to 8 had not run since 2026-11-22, before every rule added on the `claude` branch. The `-10` reports in `c4/` are the deliberately unfinished files of step 4.2.

Two regressions found with Codex, both fixed:

- **Case 7, file removed between runs.** The report listed no finding and said only, in Changes since baseline, that USR-01 to USR-06 were Not reverified. Cause: the case 31 rule "a missing target gets a report without findings". The rule now keeps open baseline findings listed as Not reverified, and `tracking.md` says a Not reverified finding is listed under Findings with its last evidence and counted in the Summary.
- **Case 2, two references in conflict.** With no decision, Codex still rated the logged key High under the built-in grid while saying the conclusion stayed open. `SKILL.md` now says a lower-ranked criterion does not decide an open conflict, and that gaps outside the conflict (the e-mail in the same log line) stay separate findings.

After the fixes, both tools pass every step:

| Case | Codex | Claude Code |
| --- | --- | --- |
| 2. Targeted audit and conflicts | Pass: extended grid with only D1; supplied criteria only with D1, D2, D4, D5; logging reference applied with an Informational conflict; open conflict leaves D4 undecided, then High once the user decides | Same |
| 4. Close re-runs | Pass: `-2` chosen over `-10`; `audits/` excluded from local changes; reference typo keeps the baseline, rule change discards it; Documentation-only takes no general baseline; branch `other` ignored, then used when named | Same |
| 5. Finding tracking | Pass: Not reverified after `require('@acme/users')`, then Fixed | Pass, same |
| 7. Reappearance | Pass: Not reverified when the file is moved away, Fixed, Reappeared with the original ID, Still present, then a new ID for `setRole` | Pass; with the file only renamed, Claude Code checked that the copy has the same blob and kept the findings Still present, which the case accepts |
| 8. Deferral deadline | Pass: D9 Planned later, reopened after a past date, closed again for "later" | Same |

## 2026-11-24 — cases 9 to 19 replayed against the current skill

Reports: runs/2026-11-24-cases-9-19/ (`case10-billing` is an extra targeted audit of `src/billing.js`, `readme-example` the "Try the method" prompt of the top-level README).

Cases 9, 10, 11, 14, 15, 17, 18 and 19 pass with both tools. Two regressions, both caused by rules added on this branch:

- **Case 13, incomplete evidence.** Both tools wrote zero findings instead of a To verify point; Claude Code quoted the case 12 rule ("a finding has to show how the target violates the criterion"). The rule now reads "shows how the target violates it, or, as To verify, what evidence is missing to decide". Re-run: To verify finding for both tools (Codex Medium, Claude Code High); case 12 still gives no test finding.
- **README example, evidence given in the request.** Claude Code reported "the publication log is not in the repository" and wrote no finding: the case 31 rule on missing targets. `SKILL.md` now says material given in the conversation is part of the target. Re-run: P-02 approval and log completeness as To verify; case 31 still gives an empty report with both tools.

Lesson: a rule that fixes one case can break an older one. Replay the whole suite after a batch of rule changes, not only the cases that motivated them.

## 2026-11-24 — cases 20 to 41 replayed against the current skill

Reports: runs/2026-11-24-cases-20-41/ (`claude-code/case27-34` holds the case 27 report and its case 34 re-audit).

Runner fix first: Git Bash turned the `/audit ` prompt of no-parameter cases into `C:/Program Files/Git/audit` (Claude Code noticed and ran a full audit anyway). `run.sh` now sets `MSYS2_ARG_CONV_EXCL="/audit;//"`, which also keeps the `// Export` comment of case 28 intact; earlier case 28 runs had a broken module for that reason.

Every case passes with both tools except the points below.

- **Case 30, vendored library.** Claude Code wrote two findings on `tinytpl` (provenance and `eval` under Dependencies, "unused library" under Architecture), following the one-cause-per-sub-category split. `criteria.md` now treats third-party code copied into the repository as one dependency, assessed in a single Dependencies finding. Re-run: one finding in 2 of 2 Claude Code runs and 1 of 1 Codex run.
- **Cases 27 and 34 with Codex.** Refused by OpenAI's cybersecurity filter ("This content was flagged for possible cybersecurity risk") after a web search; no report. Not a skill issue. Claude Code passes case 27 (9 findings, Low by the library rule unless argued) and case 34 (case 27 report as baseline, findings re-checked against `git diff` to 5.3.0, one New). Its case 27 report has no dependency finding, so the Fixed dependency floors expected in case 34 do not apply to this run.
- **Case 37.** Codex files the unverifiable approvals under Security / Traceability of sensitive actions; Claude Code adds a fourth Low finding (no automated release check) from the built-in grid, which the extended grid mode allows. Both accepted.

Entries marked (branch `codex`) were recorded on that branch before the merge of 2026-11-24. Their case numbers follow `acceptance/README.md` after the merge (codex 22 to 56 became 42 to 76).

## 2026-11-23 — Git snapshot evidence and report format (branch `codex`)

Case 42 was run on isolated copies using independent Codex sessions. The first report read the correct indexed files but linked to the working-tree README, where the cited command was different. After the change, the staged report used index-qualified locators and reported one confirmed Medium finding. The unstaged report recorded zero findings and rejected the staged report as a baseline. Both runs preserved the working tree and index and ran no npm commands.

The format checker now rejects duplicate sections, blank counts and missing Impact bullets. Its four regression tests pass. On the 19 reports from the calibration and cases 20–21 batches, it flagged one previously accepted report for a Planned later entry without an Impact bullet. The original report remains in the historical evidence.

## 2026-11-23 — concurrent report publication (branch `codex`)

Case 43 passes on Windows. Six concurrent publisher processes wrote six complete drafts beside an existing report with the same intended name. All seven names were distinct, the original bytes were preserved, and no temporary files remained in `audits/`. A separate Codex forward test used the installed publisher during a documentation audit. The format checker passed and the report was the only change to that checkout.

## 2026-11-23 — requirements traceability (branch `codex`)

Case 44 passes after the skill change. The first report covered all four requirements but left the open approval question and the late announcement disconnected from their finding IDs in the matrix. The replay cites evidence and the applicable finding ID for each row. Both runs identified the same approval evidence gap and a 15-minute delay beyond the announcement deadline. The replay used all four result labels and its active counts matched the two findings.

## 2026-11-23 — merge commits, historical commits and report destinations (branch `codex`)

Cases 45 and 46 pass. The Git combined diff omitted the README change, which the first-parent diff showed. The initial merge audit used both parent diffs to establish the relevant change. The replay used the newly documented first-parent comparison and returned the same single Medium finding. The initial-commit audit compared with the empty tree and found zero gaps in the original command. Its checkout stayed on the merge commit.

The report publisher previously followed an `audits/` junction to a sibling directory. It now rejects that destination. The regression verifies that no file appears in the redirected directory.

The publisher now rejects malformed UTF-8 and a byte order mark before creating the destination. The checker catches malformed UTF-8 in existing reports and distinguishes headings in fenced evidence from actual report sections. Thirteen automated tests and the format check on all nine reports from the four `codex` batches passed.

The checker also fails when given no input or an empty directory. Its two additional regressions passed. The full historical corpus had 99 of 124 reports pass the current checks. It includes older report formats and intentionally truncated baseline fixtures.

## 2026-11-23 — reference history and Git index preservation (branch `codex`)

Case 47 passed across three independent Codex audits. When the original criteria returned, the third report ignored the newer incompatible report, selected the original audit and kept `START-01` as Still present.

For case 48, a control experiment confirmed that ordinary `git status` can refresh the index when a tracked file's metadata changes and its contents stay the same. The audit used Git with optional locks disabled and preserved the index SHA-256 before and after publication. All four archived reports passed the format check.

## 2026-11-23 — standalone and nested audit roots (branch `codex`)

Case 49 passed after documenting how to record and compare non-Git audits. The first report found one confirmed Medium gap. A fresh session reused the local baseline and kept `HANDOFF-01` as Still present. There was no Git initialization, and the log hash stayed unchanged.

Case 50 passed. From `docs/`, the audit checked `docs/README.md` against the root manifest and found zero gaps. It published at the repository root. The only Git change was the new report.

## 2026-11-23 — prepublication format checks and default replay (branch `codex`)

Case 51 passed. With only the skill installed, a fresh Codex session checked the draft, published the audit report, then checked the published copy and removed the draft. The report was the only target change. Sixteen automated tests passed, including running the installed validator without the acceptance directory.

A general replay covered the four default axes and found the planted defects within range. It reported two passing fixture tests, skipped the data reset, preserved the fixture data hash and passed the raw report scan for the fixture credential and e-mail addresses. It recorded the unknown-user error alongside the unsupported-role gap in a single finding.

## 2026-11-23 — separate findings for independent causes (branch `codex`)

Case 52 passed in a direct static audit. The report records the unsupported role assignment and the unknown-user error as separate findings with distinct corrections. The checker passed before and after publication. No code ran, and only the report changed in the fixture.

## 2026-11-23 — recovery procedure audit (branch `codex`)

Case 53 passed in a direct static audit. The report traced the documented command through the package script, fixed source records and destination. It filed one Operability finding for the invalid restore procedure. No restore ran and the data hash was unchanged.

## 2026-11-23 — deeper caller coverage (branch `codex`)

Case 54 passed on the dedicated caller fixture. The report traced the guarded checkout and the aliased receipt call. In-memory checks covered all 1,000,001 allowed integer inputs and reproduced the single missing-input gap through the receipt caller. The probes preserved the fixture and the report passed validation.

The installed checker now verifies the Summary table delimiter and counts extra cells instead of discarding them. Directory scans distinguish Markdown files from folders whose names end in `.md`. Three new regressions failed before the fixes and passed after them. The automated suite passed 19 tests, and all 21 archived `codex` reports passed the format check.

## 2026-11-23 — priority changes across audits (branch `codex`)

Case 55 passed in two direct static audits. The first report classified the broken restore Low under the supplied demo criterion. The re-audit kept `RECOVERY-01` as Still present, explained the change to High using the updated operating context and counted the finding under High. Both output files passed the format check.

## 2026-11-23 — verification setup failure (branch `codex`)

Case 56 passed. The audit ran the read-only comparison. The command exited with `ENOENT` while loading the reference sample, before the assertion. The report left the underlying total as To verify, cited the missing file and passed validation. The fixture data hash was unchanged.

## 2026-11-23 — staged audit with an unmerged path (branch `codex`)

Case 57 passed in a direct audit. Git showed that the README had conflict stages but no stage-0 entry even though the working-tree file contained a valid command. The report kept the staged README check open and confirmed that the independently staged setup guide referenced an undefined script. The index and all three evidence files retained their SHA-256 hashes. The report passed validation before and after publication.

## 2026-11-23 — incomplete baseline with section headings (branch `codex`)

Case 58 passed in a direct re-audit using the completed case 49 report as a baseline candidate. The newer copy had the same scope and counts but ended at the Coverage and limitations heading. The validator rejected the copy. The re-audit cited the complete candidate, explained why it had skipped the copy and kept `HANDOFF-01` as Still present. Both complete reports passed the format check and the handoff log hash was unchanged.

## 2026-11-23 — data audit with a partial export (branch `codex`)

Case 59 passed in a direct audit. A read-only check examined the first four of six invoices, found one repeated organization and invoice ID pair and found no disallowed currency in the available records. The report confirmed the duplicate and kept the population-wide currency criterion open. The report passed validation and the input hashes were unchanged.

## 2026-11-23 — certainty when a re-check is blocked (branch `codex`)

In the archived case 5 Codex re-audit, several Confirmed findings became To verify as soon as the implementation became unavailable. Case 60 checks the distinction with a single cold-start measurement. The first report confirmed 720 ms against a 500 ms limit. With the measurement file removed, the re-audit kept `START-01` as Confirmed and Medium, marked it Not reverified and attributed the measurement to the prior run. Both reports passed validation.

## 2026-11-23 — traceability finding IDs (branch `codex`)

The format checker now validates the four-column traceability matrix used in case 44. It rejects a Gap or To verify row without a finding and rejects IDs absent from the report. The new regressions cover unknown and missing IDs, shared findings and escaped pipes in evidence. The case 44 replay still passes.

## 2026-11-23 — independent evidence when a verification script stops (branch `codex`)

Case 61 complements case 56. The script exited with `ENOENT` before its assertion. The audit confirmed the zero-input defect from the return expression and recorded the incomplete script in coverage. The source files kept their hashes and the report passed validation.

## 2026-11-23 — criteria pinned to a Git revision (branch `codex`)

Case 62 passed in a direct historical audit. The report used the policy blob at the audited revision, where the documented command violated the user-pinned rule. The later checkout's policy approved the new command. The audit validated the report and preserved HEAD, the index and the working files.

## 2026-11-23 — validated report publication (branch `codex`)

The publisher's `--check` mode validates the same buffer it writes. A regression rejects a draft edited after a separate format check and leaves the output directory untouched. Another confirms byte-for-byte preservation of a valid CRLF draft. A case 51 replay used only the installed skill, published one finding and preserved the index and audited files. All 35 automated tests passed.

## 2026-11-23 — Git intent to add (branch `codex`)

Case 63 passed in direct audits on Git 2.45.1 for Windows. The staged audit found no staged change. The unstaged audit confirmed the missing script from the working-tree guide and recorded that the staged report had a different comparison mode. Both reports passed validation. The index and checked files retained their hashes.

## 2026-11-23 — rechecking part of a finding (branch `codex`)

Case 64 passed in three direct audits. The initial report confirmed two affected rows in one finding. The partial re-check verified A, kept the missing B open and counted the original finding as Not reverified. The complete re-check verified both rows, kept `IMPORT-01` as Fixed and counted zero active findings. Every audit preserved the export it reviewed and passed validation.

## 2026-11-23 — numeric baseline order (branch `codex`)

Case 65 passed. The candidate helper returned the same-second reports in order `-11`, `-10`, `-2`, and the unsuffixed file. The direct re-audit rejected `-11` because its coverage was empty, used `-10` as its baseline and kept `IMPORT-01` as Still present. The export hash was unchanged and both archived reports passed validation.

The candidate helper also passed two ordering regressions with synthetic UTC offsets. A report at 02:10 +01:00 sorts ahead of 02:50 +02:00. A list containing a legacy date without an offset retains local filename ordering. The corpus still had 130 of 155 reports pass format validation.

## 2026-11-23 — traceability links and finding statuses (branch `codex`)

The checker rejects a traceability link when its fragment targets an earlier priority or status. An explicit anchor tied to the finding ID passed before and after a priority and status change. The checker also rejects Fixed findings in Gap and To verify rows and accepts them as evidence of resolution in Met rows. All 50 automated tests passed. The corpus stayed at 130 of 155 reports passing format validation.

## 2026-11-23 — compatible criteria and conflicting review windows (branch `codex`)

Case 66 passed in two direct audits. The initial report applied both compatible limits and confirmed a 15-minute emergency review delay. The second report identified the non-overlapping emergency windows as an unresolved Informational conflict. It continued to apply the independent 48-hour rule to both edits. Both reports passed validation, and the log and policies retained their hashes.

## 2026-11-23 — link break after a pure rename (branch `codex`)

Case 67 passed in a direct audit. Git reported `R100` and identical guide blobs at both revisions. The report traced the relative destination from both paths and confirmed that the move broke the configuration link. The report passed validation, and the index and audited files kept their hashes.

## 2026-11-23 — withdrawal of a recorded deferral (branch `codex`)

Case 68 passed in four direct audits. The initial report recorded the owner's decision to defer until launch. The second report retained that closure after the decision file disappeared. The third report restored `START-01` to active counts as Not reverified after the owner withdrew the deferral and the measurement was unavailable. The fourth report verified a new 680 ms measurement and kept the ID as Still present. All four reports passed validation and their audits preserved the supplied evidence.

The checker now indexes finding headings once per section. On a local in-memory report with 10,000 synthetic findings, the median of three checks after warm-up fell from 2,038 ms to 87 ms under the same Node.js process. Both versions accepted the generated report, and the full suite retained its expected results.

## 2026-11-23 — retained link after an indexed deletion (branch `codex`)

Case 69 passed. The direct report cited the help page in HEAD, the indexed README and the missing destination in the index. The local copy remained at the original path. The index and audited files retained their hashes and the report passed validation.

## 2026-11-23 — raw read-only Git diff (branch `codex`)

Case 70 passed on Git 2.45.1 for Windows. A control comparison refreshed the index even with optional locks disabled. Disabling `diff.autoRefreshIndex` preserved the index. The direct audit also disabled external diff helpers and text conversion, read the actual cap change from 500 to 800, and confirmed the gap. The fixture hashes matched before and after the audit, and the report passed validation.

## 2026-11-23 — staged and tracked diffs before the first commit (branch `codex`)

Case 71 passed. The staged report confirmed that the indexed README called an undefined script. The tracked-local report verified the working-tree README against the working-tree manifest and found no gap. Both reports passed validation. Raw comparison checks on SHA-1 and SHA-256 repositories returned the expected content from the index and working tree and preserved their index hashes. The report fixture remained without a commit.

## 2026-11-23 — mixed criteria and evidence in one reference (branch `codex`)

Case 72 passed in three direct audits. The first report confirmed a 45-minute review against the approved 30-minute maximum. The second report kept that baseline after only the observed duration changed and marked `TIME-01` Fixed at 25 minutes. The third report rejected both earlier baselines when the applicable maximum changed to 20 minutes. All three reports passed validation and each audit preserved the supplied reference.

## 2026-11-23 — three-dot comparisons and target dependencies (branch `codex`)

Case 73 passed. The three-dot comparison changed only the README relative to the merge base. A direct endpoint diff also showed a manifest difference. The audit report used the unchanged target manifest and confirmed that the topic's new command lacked a matching script. The audit preserved the checked-out branch, index and working files. The report passed validation.

## 2026-11-23 — finding continuity across a verified file move (branch `codex`)

Case 74 passed. The setup audit recorded one missing script. Git reported an R100 move and identical guide blobs at both revisions. The onboarding re-audit retained the earlier baseline and `SETUP-01`, and cited the new path for the current evidence. The audits preserved the index and input files, and both reports passed validation.

## 2026-11-23 — conflicting export coverage claims (branch `codex`)

Case 75 passed. The audit counted four distinct delivered IDs against the manifest's claim of three records. Its currency check passed for all delivered rows and left source-wide compliance open because the source population was unreconciled. Both input hashes stayed unchanged and the report passed validation.

## 2026-11-23 — proposal and approved deferral (branch `codex`)

Case 76 passed. The first audit kept the missing script active while the proposal awaited approval. The second audit cited the release lead's explicit decision, retained `DOC-01` under Planned later and counted zero active findings. Both reports passed validation and each audit preserved the evidence it reviewed.

## 2026-11-24 — report headings and traceability placement (branch `codex`)

The validator and the baseline candidate helper recognize Markdown headings indented by up to three spaces. The helper ignores a date below such a section heading when it orders baseline candidates. The validator rejects a traceability matrix or subsection outside Coverage and limitations and accepts fenced examples elsewhere in the report. All 78 automated tests passed. The archive retained 150 passing reports and 25 recorded format rejections.

## 2026-11-24 — replay after merging `codex` into `claude`

Reports: runs/2026-11-24-merge-replay/. Folder names are the `run.sh` repository names (`u9` to `u16` are cases 9 to 16, `c9`, `c12` and `c13` are cases 17, 18 and 19, `c57` is case 7, `c11` is the README example).

Fixes before the replay, from the cross-branch audits in `audits/` (`2026-11-24_15-31-15-claude-branch.md` and `2026-11-24_15-31-26-codex-branch.md`):

- `run.sh` exits 1 when setup fails, when an agent exits non-zero, or when a step writes no new report; earlier reports no longer count for a later step. It caught both tools' usage limits during this replay. Offline regressions with a stub agent: `run.test.js`.
- The format checker is the stricter validator shipped by `codex` (empty header fields, blank counts, empty Coverage, empty input folder). Eight archived reports that the old checker accepted are now known rejections.
- `score-case1.js` credits only active findings for D1 to D11 and only an amount-validation deferral for D9, and exits 1 on any BAD row (`score-case1.test.js`).
- `publish-report.cjs` deletes the draft after publishing: Claude Code needed a permission prompt to delete a draft outside the target, so each run left one behind. It still leaves the draft's folder when the agent created one.
- `run.sh` scripts four `codex` cases: 42 (staged and unstaged diffs), 44 (traceability), 59 (partial export), 76 (deferral decision).

**Codex: every scripted case passes** (1 to 26, 28 to 33, 35 to 41, README example, 42, 44, 59, 76; 27 and 34 skipped because OpenAI's filter blocks them). Case 1: 11 of 11. Notable: case 42 gives one finding with the staged diff and none with the unstaged one; case 44 gives the expected Met / To verify / Gap / Not applicable matrix; case 59 confirms the duplicate and leaves the currency check To verify; case 76 keeps the gap open on a proposal, then moves the same ID to Planned later on the decision; case 30 gives one vendored-library finding. Case 37 files the tag mismatch under Quality / Data integrity, outside the accepted rows, a classification variance with the right gap.

**Claude Code: cases 1, 2, 4, 5 and 7 pass** (case 1: 11 of 11), then the monthly spend limit stopped every later step; the runner reported each one as FAIL. Resumed on 2026-11-25: cases 8 to 30 (27 and 34 included) pass with Claude Code; cases 9 and 14 add the accepted Low finding on a caller without `orgId`. A first resume collided with a stopped loop on `c8`, then reran cleanly. Cases 31 to 41, the README example and cases 42, 44, 59 and 76 then passed with Claude Code on 2026-11-26, which completes the replay with both tools. The common cases pass with `git-scope.md` loaded, with the same results as before the merge, so no instruction was cut (CDX-03).

One calibration gap: Claude Code rated the unverifiable approvals of case 37 **Informational** "because the evidence lives outside the repository". `criteria.md` now says a point to verify is rated by the impact the gap would have if confirmed, since the To verify certainty already records the missing evidence. Re-run: Medium with both tools; case 13 stays High with Claude Code. Codex again files the case 37 tag mismatch under Quality / Data integrity, now accepted.

## 2026-11-26 — with and without the skill, and lighter rules (2.2.0)

Cases 1, 5, 21 and the README example, one run each with Claude Code and Codex, in three setups: no skill (`AUDIT_SKILL=none`), the 2.1.0 rules, and the 2.2.0 rules. Token counts come from `acceptance/usage.js`. One run per case is a small sample: single-case differences are within run-to-run noise.

**Detection.** Without the skill, both agents already find most planted defects in case 1, in their own format: Claude Code covers all eleven by reading, Codex about eight (it merges the committed key, the logged key and the documentation conflict, and leaves missing tests out of its findings). Both keep P-02 open in the README example and find the self-deletion gap in case 21. With 2.1.0 and 2.2.0, `score-case1.js` gives 11/11, 11/11 (2.1.0) and 9/11, 10/11 (2.2.0); reading the 2.2.0 reports shows all eleven defects, the misses are titles without the scorer's keywords ("organization boundaries" for D11, "regression coverage" for D6).

**What the skill adds.** A report format that the checker validates; findings kept to the requested scope (without the skill, Claude Code added two findings outside the audited commit in case 21); and tracking across runs: in case 5 only the runs with the skill keep IDs and move them from New to Not reverified to Fixed.

**Cost.** Total input tokens over the six agent steps:

| Tool | No skill | 2.1.0 | 2.2.0 |
| --- | --- | --- | --- |
| Claude Code | 0.96 M | 2.62 M | 2.36 M (−10%) |
| Codex | 0.87 M | 1.79 M | 1.70 M (−5%) |

The skill costs two to three times the tokens of a plain prompt. 2.2.0 loads 17.9 KB of rules for a first audit instead of 27.5 KB.

**Scope fix.** In case 1, Codex also audited the skill's own installed scripts (2.1.0 and 2.2.0). 2.2.0 states that the installed skill folder is not part of the target; a Codex rerun of case 1 no longer mentioned it. That rerun missed D7 (crash on an unknown user, Low), which earlier runs found.

## 2026-11-26 — public benchmarks

Reports: runs/2026-11-26-public/. First blind run of the eleven cases in [public.md](public.md), skill 2.2.0, one run per case and tool: Claude Code 2.1.332 (Claude Opus 5.5) and Codex CLI 0.172.0. All 22 reports pass the format check. Scores come from `score-public.js`; every miss and every doubtful match was checked by hand, and the corrected count is given when it differs.

| Case | Audit type | Claude Code | Codex |
| --- | --- | --- | --- |
| `nodegoat` | Security, web app | 15/15, 30 findings | 14/15, 22 findings (no security-header finding) |
| `juiceshop` | Security, `routes/` | 13/14, 34 findings (no XXE finding) | **3/14**, 8 findings |
| `benchmark` | Security, false positives | TPR 11/11, FPR 1/11, score 91% | TPR 11/11, FPR 2/11 by hand (scored 10/11 and 4/11), score 82%; the `BenchmarkTest00004` finding cites no file |
| `leaky` | Secrets | 43/43 | 43/43 |
| `actions` | CI configuration | 5/5 | 5/5 |
| `goof` | Dependencies | 12/12 | 8/12 (no mongoose, ms, dustjs or express-fileupload) |
| `terragoat` | Infrastructure as code | 12/12 | 12/12 |
| `quixbugs` | Behavior, 40 one-line bugs | 40/40 | 40/40 |
| `hospital` | Data quality | 3/3, 510 of 509 corrupted cells counted | 3/3, **not blind** |
| `bad` | Accessibility, WCAG A and AA | 16/19 | 13/19 |
| `nplus` | Performance | 3/3 | 3/3 |

Lessons for the next skill changes:

- **Codex declines to report the flaws of a training application.** On Juice Shop it read the challenge names in the code, called the injections "intentional exercises" and reported deployment isolation instead: no finding for the SQL injections in `login.ts` and `search.ts`, the SSRF, the null-byte bypass, the basket IDOR or the `eval` in `userProfile.ts`. Claude Code reported them "as they stand" and noted the training context once. The skill should say that a deliberate or documented flaw is still a gap against the criteria.
- **A run with web access can find the answers.** Codex located HoloClean's clean copy of `hospital.csv` and diffed against it. The scorer now warns when a report cites a known answer source.
- **Accessibility misses page titles, focus order and consistent identification** with both tools (WCAG 2.4.2, 2.4.3, 3.2.4). Codex also missed images of text (1.4.5) and focus changes on `onfocus` (3.2.1) as criteria, though it cited the `blur()` handlers.
- **Dependencies**: Codex matched 77 Snyk rules against the lockfile but reported only the packages it judged reachable, leaving four documented exploitable packages out.
- **Benchmark false alarms** are close calls: Claude Code flagged the small range of `BenchmarkTest00010`'s remember-me token, and Codex flagged the unsalted SHA-384 of `BenchmarkTest00009`. The Benchmark counts both servlets as safe for their category.
- Keyword scoring under-counts Codex, whose titles describe effects ("Allocation reads lack a record ownership check") rather than vulnerability classes. Several patterns were widened after reading its reports.

## 2026-11-27 — Juice Shop with Codex after the deliberate-flaw rule (2.3.1)

Reports: `../audit-runs/nc24/`. One blind run of `juiceshop` with Codex after 2.3.1 stated that a flaw the target calls deliberate is still a gap. Score: **14/14** (3/14 with 2.2.0), 69 findings, every planted flaw rated High or Critical except the open redirect and the prompt injection (Medium). The report notes the training intent in its corrections ("keep the training behavior in an isolated fixture") instead of dropping the findings. 3.0 M input tokens for 63 route files. One run: the change from 3/14 is far beyond run-to-run noise, but the rate of refusals is not measured.

## 2026-11-27 — incremental re-audit, case 78 (2.4.0)

Reports: `../audit-runs/incr/`. One run per tool: a full audit, then a commit adding a `start` script and the admin check on `deleteUser`, then the same audit again.

| Tool | Step 1 fresh / out / turns | Step 2 fresh / out / turns | Step 2 total input vs step 1 |
| --- | --- | --- | --- |
| Claude Code | 35k / 11.5k / 14 | 44k / 13.8k / 27 | ×1.7 |
| Codex | 30k / 6.1k / 15 | 35k / 7.7k / 20 | ×1.8 |

- **Tracking is right** with both tools: the first report is the baseline, D2 is **Fixed** after a re-check, every other finding keeps its ID and is **Still present**, unchanged files are cited "unchanged since `<commit>`" (11 and 8 times), and all four reports pass the checker. Both kept D8 open at a lower priority: `npm start` now runs `node src/billing.js`, which loads a library and exits, a defensible reading.
- **It is not cheaper.** The re-audit reads the whole baseline report (16.5 KB for Codex) and rewrites every carried finding with its full Expected, Observed and Impact bullets (16 of 16 for Codex), so it costs more than the first audit even when only two files changed. Reading only the changed files saves little against that.

### Case 78 again with carried entries (2.5.0)

Reports: `../audit-runs/carried/`. Same case, carried entries allowed for Still present findings whose cited files are unchanged.

| Tool | Step 1 fresh / out / turns | Step 2 fresh / out / turns | Carried entries | Step 2 cost vs step 1 |
| --- | --- | --- | --- | --- |
| Claude Code | 29k / 9.2k / 12 | 44k / 12.9k / 28 | 7 of 16 | $0.77 vs $0.46 |
| Codex | 45k / 5.5k / 13 | 31k / 5.5k / 20 | 6 of 16 | fresh input −32%, output equal |

- Both tools used the carried form and both reports pass the checker; D2 is Fixed, every ID is kept.
- Only 6 or 7 findings could be carried: the others cite `src/users.js`, `README.md` or `package.json`, which the fixes changed. The re-audit report is as long as the first one.
- On this 12-file fixture the re-audit still costs about as much as the first audit with Codex and more with Claude Code. Its fixed costs (reading the baseline report and `tracking.md`, running the delta, writing Changes since baseline, more turns) outweigh the files it skips. The saving should appear on repositories where most files are unchanged; no such case has been measured yet.
