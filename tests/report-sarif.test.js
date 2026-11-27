'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { toSarif } = require('../.agents/skills/audit/scripts/report-sarif.cjs');

const report = `# Audit: general

- **Checks and references** Pre-scan. Skill version 2.5.0.

## Summary

| Critical | High | Medium | Low | Informational |
| --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 1 | 0 |

## Findings

### GEN-01 · Critical · Security / Secrets and sensitive data · Confirmed · New

**A production key is committed**

- **Observed** [src/config.js:2](../src/config.js#L2) holds \`pk_prod_…\`.

\`\`\`markdown
### FAKE-01 · High · Quality / Code quality · Confirmed · New
\`\`\`

### GEN-02 · Low · Quality / Code quality · Confirmed · Still present

**Duplicated helper**

- **Carried** \`src/util.js\` unchanged since \`abc1234\`; full entry in [first](2026-11-20_10-00-00-general.md).

### GEN-03 · High · Security / Identity and access rights · Confirmed · Fixed

**Deletion had no check**

## Planned later

### GEN-04 · Medium · Security / Input validation · Confirmed · Planned later

**Amounts are not validated**

- **Observed** No check in \`src/billing.js:14\`.

## Coverage and limitations
`;

test('converts active and planned findings to SARIF results with locations', () => {
  const sarif = toSarif(report);
  assert.equal(sarif.version, '2.1.0');
  const [run] = sarif.runs;
  assert.equal(run.tool.driver.version, '2.5.0');
  const ids = run.results.map((r) => r.partialFingerprints.auditFindingId);
  assert.deepEqual(ids, ['GEN-01', 'GEN-02', 'GEN-04'], 'Fixed and fenced examples are left out');
  const [key, carried, planned] = run.results;
  assert.equal(key.level, 'error');
  assert.equal(key.ruleId, 'security-secrets-and-sensitive-data');
  assert.equal(key.message.text, 'GEN-01: A production key is committed');
  assert.deepEqual(key.locations[0].physicalLocation, { artifactLocation: { uri: 'src/config.js', uriBaseId: '%SRCROOT%' }, region: { startLine: 2 } });
  assert.equal(carried.level, 'note');
  assert.equal(carried.locations[0].physicalLocation.artifactLocation.uri, 'src/util.js');
  assert.equal(planned.suppressions[0].kind, 'external');
  assert.equal(planned.locations[0].physicalLocation.region.startLine, 14);
  assert.deepEqual(run.tool.driver.rules.map((r) => r.id).sort(), ['quality-code-quality', 'security-input-validation', 'security-secrets-and-sensitive-data']);
});

test('converts the published example report', () => {
  const text = readFileSync(join(__dirname, '..', 'examples', '2026-11-26_10-00-00-publications.md'), 'utf8');
  const [run] = toSarif(text).runs;
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].level, 'warning');
  assert.deepEqual(run.results[0].locations, []);
});
