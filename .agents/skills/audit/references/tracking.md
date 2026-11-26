# Tracking across runs

## Choose the baseline report

1. Consider finished reports in the target's real `audits/` directory. In Git, consider the current branch by default. Outside Git, consider previous non-Git reports from that same target folder. The user can name another report explicitly. A named report still has to be finished and compatible. If it fails either check, state the reason in the header and write the report without comparison. Check that **Summary** contains counts and **Coverage and limitations** records the work done or the limits encountered. Headings in examples do not count. Skip incomplete files and mention them in the header.
2. Keep only **compatible** candidates: same resolved scope (axes, sub-categories, areas and Git comparison mode when relevant) and same applied criteria. Different wordings that resolve to the same scope are equivalent. For example, staged and unstaged diffs are different scopes even when they touch the same lines and the criterion is identical.
3. If a reference changed (compare its hash), compare the applicable rules with the prior report or snapshot. Keep the candidate when the checks are unchanged, including a wording fix or a change confined to evidence. When one file contains both a rule and its observations, record the applied limit or condition separately from the observed values so a re-audit can compare them. Discard the candidate when the change alters an applicable check or when equivalence cannot be established, and record why in the header.
4. Take the most recent compatible candidate. Compare explicit UTC offsets when available, particularly during a repeated local hour. For equal timestamps and the same filename stem, order suffixes numerically, the unsuffixed file first (`x.md` < `x-2.md` < `x-10.md`). When the scope slug is known and the scripts can run, `node <skill-dir>/scripts/list-baseline-candidates.cjs <target-root> <scope-slug>` orders matching filenames by reported instant if every match has a usable offset. Otherwise it orders by local filename timestamps. Verify completion and compatibility from each report's contents. Include equivalent scopes written under other slugs. A slug ending in digits is distinct from a collision suffix when the report's resolved scope establishes that distinction.
5. If none is compatible, say so in the header and write the report without comparison.

A moved file can remain the same audit target when Git history or another authoritative record establishes the move and the affected behavior and checks are equivalent. Record the path mapping in the baseline explanation. A shared filename or identical content alone does not establish continuity between two targets.

A user decision that settles a conflict left open in the baseline keeps the baseline compatible: the checks are the same, only the open conclusion is now decided. Report the decided finding as **New**.

Look further back than the baseline in the compatible history only to find earlier IDs (for **Reappeared** and for numbering).

## Match findings

Match by problem and logical location (function, section, rule), not by line number, so moved lines are not new findings. For a verified file move, carry over the matching finding ID and cite the new path as current evidence.

When new evidence changes the priority of the same finding, keep its ID and apply the usual re-check status. Record the previous and current priorities and the evidence for the change in **Changes since baseline**. Count the finding under its current priority.

For **Not reverified**, keep the last evidence-backed certainty and priority unless new evidence changes them. Cite the earlier observation as historical evidence, then identify the current re-check that could not be completed. A blocked re-check alone does not turn a previously confirmed finding into **To verify**.

For a finding covering several affected cases, mark it **Still present** if current evidence shows the same gap in any covered case. Mark it **Not reverified** if the checked cases pass but the remaining affected cases or the shared cause are still unverified. Mark it **Fixed** once evidence covers the affected cases or establishes that a shared correction resolves them all.

## Statuses

| Status | When |
| --- | --- |
| **New** | Gap with no match in the compatible history. Also when a match cannot be established. |
| **Still present** | Gap matched to an open finding of the baseline, re-checked and still there. Also when a change only narrowed it: update the evidence and priority, and say what changed in Changes since baseline. |
| **Fixed** | Only after redoing the relevant check and confirming the gap is gone. |
| **Not reverified** | Open finding whose check is unavailable, incomplete or out of scope this run, including when its target has disappeared. List it under Findings with its ID and last available evidence, and count it in the Summary. |
| **Reappeared** | Gap matching a finding whose last known status in the compatible history is Fixed. Reuse the original ID and cite the report that recorded the fix. On the next run, if still there, it becomes Still present. |
| **Planned later** | Closed by an explicit decision (see below). |

## Planned later

- Apply a deferral only when the user or an in-scope source records an explicit decision for the same gap. A proposal, TODO or tentative milestone leaves a confirmed gap active. If an explicit decision later defers an active finding, carry its ID into **Planned later** and cite the new decision.
- Keep Planned later closures in the tracking on every run.
- When the explicit date or milestone is reached and a new check confirms the gap, reopen the finding with its ID and current evidence. Give it the status **Still present** and write "reopened after deadline" in Changes since baseline.
- If that check cannot be completed, keep the closure and state that the point remains to be re-checked.
- When an explicit current decision withdraws the deferral, cite it and keep the finding ID. Use **Still present** if the current check confirms the gap, **Not reverified** if the check is incomplete, or **Fixed** if the check verifies resolution. Count an unresolved finding as active.
- Keep the closure when the earlier record disappears without an explicit withdrawal and the deadline or milestone has not been reached. Cite the last recorded decision and distinguish it from current evidence. A deferral with neither a usable deadline nor a milestone stays in effect until an explicit decision supersedes it.
