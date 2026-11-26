'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { score } = require('./score-public.js');

function run(t, bench, text) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-public-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'report.md');
  writeFileSync(file, text);
  const rows = score(bench, file);
  return Object.assign(Object.fromEntries(rows.map((r) => [r.ref, r.ok])), { unmatched: rows.unmatched });
}

const finding = (id, priority, status, title, observed = '') =>
  `### ${id} · ${priority} · Security / Input validation · Confirmed · ${status}\n\n**${title}**\n\n- **Observed** ${observed}\n`;

test('only active findings count, and the match may come from the bullets', (t) => {
  const r = run(t, 'nodegoat', [
    finding('SEC-01', 'Critical', 'New', 'Server-side code execution', '`app/routes/contributions.js:32` passes `req.body.preTax` to `eval`.'),
    finding('SEC-02', 'High', 'Fixed', 'Open redirect on /learn'),
    '## Coverage and limitations\n\nOpen redirect checked.',
  ].join('\n'));
  assert.equal(r['A1-eval'], true);
  assert.equal(r['A10-redirect'], false);
});

test('a finding that matches nothing is listed for manual review', (t) => {
  const r = run(t, 'nplus', finding('PERF-01', 'Low', 'New', 'Asset pipeline not precompiled'));
  assert.deepEqual(r.unmatched, ['PERF-01 Low']);
});

test('benchmark: a finding on a safe servlet is a false alarm, an Informational one is not', (t) => {
  const r = run(t, 'benchmark', [
    finding('SEC-01', 'High', 'New', 'Command injection', '`BenchmarkTest00006.java:50`'),
    finding('SEC-02', 'High', 'New', 'SQL injection', '`BenchmarkTest00052.java:40`'),
    finding('SEC-03', 'Informational', 'New', 'Weak random', '`BenchmarkTest00010.java:30`'),
  ].join('\n'));
  assert.equal(r.BenchmarkTest00006, true);
  assert.equal(r.BenchmarkTest00052, false);
  assert.equal(r.BenchmarkTest00010, true);
  assert.equal(r.BenchmarkTest00001, false);
});

test('leaky: a short file name counts only as a quoted path', (t) => {
  const r = run(t, 'leaky', [
    finding('SEC-01', 'High', 'New', 'IRC password in `config`', 'The cloud config holds a key; `.ssh/id_rsa` is a private key.'),
  ].join('\n'));
  assert.equal(r.config, true);
  assert.equal(r['.ssh/id_rsa'], true);
  assert.equal(r.hub, false);
});

test('an unknown bench is an error', (t) => {
  assert.throws(() => run(t, 'nope', ''), /unknown bench/);
});
