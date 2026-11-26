# Built-in criteria

Apply each sub-category according to the repository and the evidence available. Mark a sub-category **not applicable** with the reason (for example, Accessibility for an API with no user interface).

## Grid

| Axis | Sub-category | Example checks |
| --- | --- | --- |
| Security | Identity and access rights | Authentication and enforcement of rights on sensitive operations. |
| Security | Data and environment isolation | Boundaries between users, organizations, projects or environments in reads, writes, exports and caches, including administrator actions on another tenant's records. |
| Security | Secrets and sensitive data | Storage (git history included), exposure and logging of sensitive data, in code and in datasets. |
| Security | Input validation | Checks at entry points and their consistency with business rules. |
| Security | Dependencies and security configuration | Dependencies and security settings, from the available evidence. |
| Security | Traceability of sensitive actions | Rights changes, exports and sensitive deletions leave a usable trace without exposing secrets. |
| Quality | Code quality | Readability, duplication, complexity, ease of change. |
| Quality | Architecture | Responsibilities between modules, boundaries, dependencies. |
| Quality | Behavior and error handling | Expected behavior, edge cases, failure handling. |
| Quality | Data integrity | Business invariants under writes, partial failures, retries and concurrency. For datasets: uniqueness, completeness, validity and consistency against the documented schema. |
| Quality | Tests and CI | Scenarios covered, assertions, checks run by CI. |
| Quality | Typing and lint | Configuration; run existing checks when they are safe to run. |
| Documentation | Installation and startup | Someone can prepare the environment and start the project from the instructions. |
| Documentation | Usage and configuration | Common uses and useful settings are explained. |
| Documentation | Contribution and maintenance | Change, verification and maintenance procedures are usable. |
| Documentation | Consistency with the code | Documented commands, paths, examples, behaviors and stated targets (standards, guarantees) match reality. |
| Documentation | Contracts and compatibility | APIs, data formats and breaking changes are documented where their users look. |
| Accessibility | Keyboard and focus | Navigation, tab order, visible focus. |
| Accessibility | Structure and labels | Headings, landmarks, accessible names of controls. |
| Accessibility | Forms and error messages | Fields, instructions and errors are associated. |
| Accessibility | Contrast and readability | Contrast and readability of examined elements. |
| Accessibility | Dynamic interfaces | Modals, notifications and live updates work with keyboard and screen reader, when this can be checked. |

Sensitive values found in data (card numbers, credentials, unmasked personal data) belong to **Security / Secrets and sensitive data**, even when the documented schema also forbids them.

Third-party code copied into the repository (vendored, minified or generated) is one dependency: assess its version, provenance and use in a single **Security / Dependencies and security configuration** finding whose correction is to update or remove it. Its internals and its being unused are evidence for that finding, not separate findings.

### Optional axes

Audit these only when the user asks. They then use the same finding format.

| Axis | Sub-category | Example checks |
| --- | --- | --- |
| Performance | Response time and resource use | Work per request, repeated I/O, memory growth, from code and safe measurements. |
| Performance | Scalability | Behavior as data or users grow: full scans, unbounded loads, contention. |
| Operability | Logging and monitoring | Errors and key events are observable without exposing secrets. |
| Operability | Deployment and configuration | Environments, settings and releases are reproducible and documented. |
| Operability | Backup and recovery | Trace the documented recovery command to its backup input, write destination and restored data. Confirm what can be recovered and distinguish static review from a restore trial. |

## Priority scale

Rank by impact, extent and urgency. Use these exact labels.

| Priority | Use when |
| --- | --- |
| **Critical** | Major consequence that justifies immediate action. |
| **High** | Significant impact that justifies priority treatment. |
| **Medium** | Real, contained impact that justifies a planned fix. |
| **Low** | Limited impact or low-urgency improvement. |
| **Informational** | Useful observation that needs no urgent fix. Also used for every criteria conflict. |

Calibration, to keep ratings stable across runs and tools. Adjust one level when the evidence shows a narrower or wider exposure, and say why.

- **Critical**: any user can read or change other tenants' data; a usable production credential is committed, even if a later commit removed it, until it is shown to be revoked; client input can run code on the server (unsafe deserialization, command injection).
- **High**: a sensitive operation lacks its authorization check; script injection in the browser or SQL injection is reachable from a URL or user input; a credential reaches logs; an administrator can act across tenants.
- **Medium**: personal data reaches logs; a sensitive action leaves no trace; sensitive paths have no tests; a documented command fails; a write can corrupt data on failure.
- **Low**: documentation gaps with an easy workaround, missing lint or type checks, maintainability issues.
- Accessibility: **High** when a control, form or dialog cannot be used with a keyboard or a screen reader (unreachable control, unlabeled field, modal without focus handling); **Medium** when use is degraded (a placeholder as the only label, informative image without text alternative, contrast below the WCAG AA ratio, invisible focus, unannounced status); **Low** for structure issues that leave content usable (heading jumps, missing page language).
- Libraries and frameworks: rate by the effect on callers who use the API as documented. Behavior that is unsafe only when a caller passes untrusted input where the documentation says not to is **Low**; raise it when the documentation gives no warning or an official example does it. A dependency range that admits vulnerable versions but also patched ones is one level below a pinned vulnerable version.
- A placeholder-looking secret is still rated as real unless the repository proves it is inert.
- Rate a point to verify by the impact the gap would have if confirmed. The **To verify** certainty already records the missing evidence: do not lower it to Informational for that reason.
