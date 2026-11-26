'use strict';

const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { score } = require('./score-case1.js');

function rows(t, text) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-score-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'report.md');
  writeFileSync(file, text);
  return Object.fromEntries(score(file).map((r) => [r.ref, r.ok]));
}

const finding = (id, priority, status, title) => `### ${id} · ${priority} · Security / Secrets and sensitive data · Confirmed · ${status}\n\n**${title}**\n`;

test('a Fixed finding does not count as the active defect, and D9 needs the amount-validation subject', (t) => {
  const r = rows(t, [
    finding('GEN-01', 'Critical', 'Fixed', 'Production API key committed in the repository'),
    finding('GEN-02', 'Low', 'Planned later', 'Add tests for the CSV export'),
  ].join('\n'));
  assert.equal(r.D3, false);
  assert.equal(r.D9, false);
});

test('an active key finding and the amount-validation deferral are credited', (t) => {
  const r = rows(t, [
    finding('GEN-01', 'Critical', 'New', 'Production API key committed in the repository'),
    finding('GEN-02', 'Medium', 'Planned later', 'Invoice amounts are not validated'),
  ].join('\n'));
  assert.equal(r.D3, true);
  assert.equal(r.D9, true);
});

// The run archive is kept out of the published repository.
const archive = join(__dirname, 'runs');
test('archived case 1 reports still score 11 of 11', { skip: !existsSync(archive) && 'run archive not published' }, () => {
  for (const tool of ['claude-code/case1/2026-11-23_17-20-22-general.md', 'codex/case1/2026-11-23_17-21-53-general.md']) {
    const all = score(join(__dirname, 'runs', '2026-11-23-regression-2', tool));
    assert.deepEqual(all.filter((r) => !r.ok).map((r) => r.ref), [], tool);
  }
});

test('keywords match whole words only', (t) => {
  const report = [
    finding('SEC-01', 'Low', 'New', 'The image uses node:latest'),
    finding('SEC-02', 'Low', 'New', 'The login page exposes a monkey parameter'),
    finding('SEC-03', 'Low', 'New', 'The worker restarts after a crash'),
  ].join('\n');
  const result = rows(t, report);
  assert.equal(result.D6, false);
  assert.equal(result.D4, false);
  assert.equal(result.D8, false);
});
