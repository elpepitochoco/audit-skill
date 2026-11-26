'use strict';

// Offline regression for run.sh: a stub agent replaces Claude Code, so no model is called.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { delimiter, join } = require('node:path');
const test = require('node:test');

const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0;

function replay(t, stubBody, kase = 'readme') {
  const dir = mkdtempSync(join(tmpdir(), 'audit-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const stub = join(dir, 'claude');
  writeFileSync(stub, `#!/bin/sh\n${stubBody}\n`);
  chmodSync(stub, 0o755);
  const result = spawnSync('sh', [join(__dirname, 'run.sh'), 'cc', kase], {
    encoding: 'utf8',
    env: { ...process.env, AUDIT_RUNS: join(dir, 'runs'), PATH: `${dir}${delimiter}${process.env.PATH}` },
  });
  const log = readFileSync(join(dir, 'runs', 'cc', 'logs', 'c11.txt'), 'utf8');
  return { result, log };
}

const writeReport = 'mkdir -p audits && echo report > audits/2026-11-24_10-00-00-publications.md';

test('a failing agent that writes no report fails the replay', { skip: !hasSh }, (t) => {
  const { result, log } = replay(t, 'exit 17');
  assert.equal(result.status, 1);
  assert.match(log, /FAIL exit=17 new: $/m);
});

test('an agent that exits 0 without a new report fails the replay', { skip: !hasSh }, (t) => {
  const { result, log } = replay(t, 'exit 0');
  assert.equal(result.status, 1);
  assert.match(log, /FAIL exit=0 new: $/m);
});

test('an agent that writes one new report passes', { skip: !hasSh }, (t) => {
  const { result, log } = replay(t, writeReport);
  assert.equal(result.status, 0, result.stderr);
  assert.match(log, /^ok exit=0 new: 2026-11-24_10-00-00-publications\.md $/m);
});

test('AUDIT_SKILL=none runs the case without the skill and without its invocation', { skip: !hasSh }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const stub = join(dir, 'claude');
  writeFileSync(stub, `#!/bin/sh\nprintf '%s' "$2" > ../prompt.txt\n[ -e .claude ] && echo installed > ../skill.txt\n${writeReport}\n`);
  chmodSync(stub, 0o755);
  const result = spawnSync('sh', [join(__dirname, 'run.sh'), 'cc', 'readme'], {
    encoding: 'utf8',
    env: { ...process.env, AUDIT_SKILL: 'none', AUDIT_RUNS: join(dir, 'runs'), PATH: `${dir}${delimiter}${process.env.PATH}` },
  });
  assert.equal(result.status, 0, result.stderr);
  const base = join(dir, 'runs', 'cc-noskill');
  const prompt = readFileSync(join(base, 'prompt.txt'), 'utf8');
  assert.doesNotMatch(prompt, /\/audit/);
  assert.match(prompt, /Write the report as one new Markdown file in audits\/\.$/);
  assert.throws(() => readFileSync(join(base, 'skill.txt')));
});
