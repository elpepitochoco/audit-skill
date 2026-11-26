# Special cases

Read the section that matches the request.

## Criteria conflicts

- Before resolving a conflict, identify the cases where each rule applies. Apply compatible rules together, including a general limit and a stricter limit for a subset. A conflict exists only when applicable rules for the same case cannot both be satisfied.
- Resolve with this order: explicit user request → supplied reference → built-in grid. Record every conflict as an **Informational** finding that cites both criteria and the one applied.
- If the conflict remains between criteria at the highest applicable rank, leave the conclusion for that check open and state what must be clarified. A lower-ranked criterion does not decide it in the meantime; gaps the conflict does not cover (personal data in the same log line, for example) stay separate findings.

## Supplied criteria only

Every finding cites one supplied criterion and shows how the target violates it, or, as **To verify**, what evidence is missing to decide. Missing tests or documentation for a criterion are not violations of it. Write them and other observations in Coverage and limitations, not as findings.

## Deeper audit

Trace the callers visible in the target, including aliases and wrappers. Record their preconditions and any dynamic or external entry points that could not be traced. Run the safe checks available, such as probes with in-memory inputs, and state the additional coverage.

## Target not found

If the named target is neither in the repository nor in the conversation, write the report without new findings (open findings from the baseline stay listed as **Not reverified**), state in Scope and Coverage and limitations that the target was not found and nothing was assessed, and ask for its location in chat.

## Folder outside Git

Use the local target folder as the report root. Record "outside Git" in **Branch / commit**, explain in **Local changes** that Git state is unavailable, and continue with the supplied files.

## Sampled or partial data

Record the population size if known, how many records were checked and how they were chosen, and limit conclusions to those records. When a stated coverage disagrees with the delivered rows, record both counts and use record IDs to check for repetition.

## A check that stops early

If a check stops before evaluating the criterion, record the setup failure and the missing evidence. Leave the criterion unverified unless independent evidence settles it.
