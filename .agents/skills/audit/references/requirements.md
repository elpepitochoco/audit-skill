# Requirements traceability

For a traceability matrix or a requirement-by-requirement review, inventory the requirements in scope before assessing them. Preserve the source IDs. When a requirement has no ID, use its source section or numbered rule so the reader can locate it.

Add one **Requirements traceability** subsection under **Coverage and limitations**. Use a single table with one row per in-scope requirement. Put all related finding IDs in that requirement's row.

```markdown
### Requirements traceability

| Requirement and source | Result | Observed or missing evidence | Finding |
| --- | --- | --- | --- |
```

For **Finding**, use the ID from the finding heading or link to the finding with that ID as the link text. For a stable link such as `[DOC-01](#finding-doc-01)`, put `<a name="finding-doc-01"></a>` above the finding heading with one blank line between them. This keeps the link valid when the finding's priority or status changes. Separate multiple IDs with commas. Escape literal table pipes in evidence as `\|`.

Leave a blank line between the last row and any follow-up prose.

| Result | Use when |
| --- | --- |
| Met | Sufficient evidence establishes compliance for the examined scope. |
| Gap | The evidence confirms a departure from the requirement. |
| To verify | The evidence is incomplete or does not establish whether the requirement applies or was met. State what would resolve the question. |
| Not applicable | The evidence establishes that the requirement's triggering condition is absent. Cite the evidence for that condition. |

Link each gap or open point to its finding. Use a **Fixed** finding to document verified resolution for a **Met** requirement. Several requirements can share a finding when they expose the same cause. Use the finding's status and priority in **Findings** or **Planned later**. The Summary continues to count active findings once each.

A **Gap** row needs at least one finding backed by current confirmed evidence. A **To verify** row needs a finding with an incomplete check, including an earlier confirmed finding marked **Not reverified**.
