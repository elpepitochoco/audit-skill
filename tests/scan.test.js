'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const script = join(__dirname, '..', '.agents', 'skills', 'audit', 'scripts', 'scan.cjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
const historyKey = `sk_live_${'A1b2C3d4'.repeat(3)}`;
const treeKey = `ghp_${'x'.repeat(36)}`;

function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'audit-scan-'));
  t.after(() => rmSync(root, { recursive: true }));
  for (const dir of ['src', 'test', 'docs', 'audits', join('.claude', 'skills', 'audit')]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' }, dependencies: { lodash: '*', express: '^5.1.0' } }));
  writeFileSync(join(root, 'README.md'), '```sh\nnpm install\nnpm test\nnpm start\nnpm run seed.\nnode scripts/missing.js\n```\nSee [docs](docs/usage.md), [gone](docs/gone.md#top) and [site](https://example.test).\n');
  writeFileSync(join(root, 'docs', 'usage.md'), 'Back to [readme](../README.md).\n');
  writeFileSync(join(root, 'src', 'billing.js'), `module.exports = { key: '${historyKey}' };\n`);
  writeFileSync(join(root, 'src', 'users.js'), "const password = process.env.PASSWORD;\nmodule.exports = { password: 'process.env.X' };\n");
  writeFileSync(join(root, 'test', 'billing.test.js'), "require('../src/billing');\n");
  writeFileSync(join(root, 'audits', 'old.md'), `${treeKey}\n`);
  writeFileSync(join(root, '.claude', 'skills', 'audit', 'x.md'), `${treeKey}\n`);
  return root;
}

test('reports leads with masked secrets, including history-only ones', (t) => {
  const root = project(t);
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Initial');
  writeFileSync(join(root, 'src', 'billing.js'), `module.exports = { key: process.env.KEY };\nconst token = '${treeKey}';\n`);
  git(root, 'commit', '-qam', 'Move key to env');

  const result = run(root, '.');
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;
  assert.match(out, /- 6 in scope \(Git/);
  assert.match(out, /src\/billing\.js:2 GitHub token \(ghp_…, 40 chars\)/);
  assert.match(out, /src\/billing\.js API key \(sk_live_…, 32 chars\), added in [0-9a-f]+ .*absent from the current tree/);
  assert.match(out, /README\.md:4 `npm start`: no "start" script in package\.json/);
  assert.match(out, /README\.md:5 `npm run seed\.`: no "seed" script/);
  assert.match(out, /README\.md:6 `node scripts\/missing\.js`: scripts\/missing\.js not found/);
  assert.doesNotMatch(out, /npm test`|npm install`/);
  assert.match(out, /README\.md:8 → docs\/gone\.md#top/);
  assert.doesNotMatch(out, /usage\.md|example\.test|\.\.\/README/);
  assert.match(out, /"lodash": "\*" is not pinned/);
  assert.match(out, /2 dependencies, no lockfile/);
  assert.doesNotMatch(out, /express/);
  assert.match(out, /## Source files no test file names\n- src\/users\.js\n/);
  assert.doesNotMatch(out, /users\.js:\d/, 'environment lookups are not secrets');
  assert.ok(!out.includes(historyKey) && !out.includes(treeKey), 'secret values stay masked');
  assert.doesNotMatch(out, /audits\/|\.claude/);
});

test('limits the scan to path prefixes and works outside Git', (t) => {
  const root = project(t);
  const result = run(root, root, 'src');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /- 2 in scope \(outside Git/);
  assert.match(result.stdout, /not checked: outside Git/);
  assert.match(result.stdout, /src\/billing\.js:1 API key/);
  assert.doesNotMatch(result.stdout, /README/);
});

test('scans only the subfolder of a larger repository, history included', (t) => {
  const outer = mkdtempSync(join(tmpdir(), 'audit-scan-outer-'));
  t.after(() => rmSync(outer, { recursive: true }));
  mkdirSync(join(outer, 'app'));
  writeFileSync(join(outer, 'other.js'), `const k = '${historyKey}';\n`);
  writeFileSync(join(outer, 'app', 'a.js'), 'module.exports = 1;\n');
  git(outer, 'init', '-q');
  git(outer, 'add', '.');
  git(outer, 'commit', '-qm', 'Initial');
  git(outer, 'rm', '-q', 'other.js');
  git(outer, 'commit', '-qm', 'Remove');

  const result = run(outer, 'app');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /- 1 in scope/);
  assert.match(result.stdout, /## Secrets only in the Git history\nnone/);
});

test('does not touch the Git index', (t) => {
  const root = project(t);
  git(root, 'init', '-q');
  git(root, 'add', '.');
  const index = readFileSync(join(root, '.git', 'index'));
  writeFileSync(join(root, 'src', 'billing.js'), 'changed\n');
  assert.equal(run(root, '.').status, 0);
  assert.deepEqual(readFileSync(join(root, '.git', 'index')), index);
});

test('survives symbolic links, malformed links and a failing git log, and masks every section', (t) => {
  const root = project(t);
  const outside = mkdtempSync(join(tmpdir(), 'audit-scan-outside-'));
  t.after(() => rmSync(outside, { recursive: true }));
  writeFileSync(join(outside, 'keys.txt'), `${treeKey}\n`);
  writeFileSync(join(root, 'docs', 'bad.md'), 'See [x](a%zz.md).\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { x: 'https://user:tok3nvalue@registry.example.test/x.tgz' } }));
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Initial');
  // A tracked symbolic link to a directory outside the target ('junction' needs no privilege on Windows).
  symlinkSync(outside, join(root, 'link'), 'junction');
  const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: outside, encoding: 'utf8' }).stdout.trim();
  git(root, 'update-index', '--add', '--cacheinfo', `120000,${blob},link`);

  const result = run(root, '.');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /- link \(symbolic link\)/);
  assert.ok(!result.stdout.includes(treeKey.slice(4, 12)), 'nothing is read through the link');
  assert.match(result.stdout, /docs\/bad\.md:1 → a%zz\.md: malformed URL encoding/);
  assert.match(result.stdout, /\[credentials in URL: user:password@\]/);
  assert.doesNotMatch(result.stdout, /tok3nvalue/);

  const failing = run(root, '.', ':(bad)x');
  assert.equal(failing.status, 0, failing.stderr);
  assert.match(failing.stdout, /Note: incomplete: git log failed/);
});
