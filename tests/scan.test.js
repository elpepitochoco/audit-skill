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

test('flags CI, container, environment-file and HTML page leads without flagging safe forms', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'audit-scan-config-'));
  t.after(() => rmSync(root, { recursive: true }));
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  const sha = 'a'.repeat(40);
  writeFileSync(join(root, '.github', 'workflows', 'pr.yml'), [
    'on:', '  pull_request_target:', 'jobs:', '  t:', '    steps:',
    '      - uses: actions/checkout@v4', '        with:', '          ref: ${{ github.event.pull_request.head.sha }}',
    `      - uses: org/tool@${sha}`, '      - uses: ./local-action',
    '      - run: echo "${{ github.event.pull_request.title }}"',
  ].join('\n'));
  writeFileSync(join(root, '.github', 'workflows', 'ok.yml'), `on: push\npermissions:\n  contents: read\njobs:\n  t:\n    steps:\n      - uses: actions/checkout@${sha}\n`);
  writeFileSync(join(root, 'Dockerfile'), 'FROM node:22 AS build\nRUN make\nFROM build\nARG NPM_TOKEN\nENV API_KEY=abc123\nENV PORT=8080\n');
  writeFileSync(join(root, 'Dockerfile.ok'), 'FROM node@sha256:abcd\nENV API_KEY=$API_KEY\nUSER node\n');
  writeFileSync(join(root, '.env'), 'X=1\n');
  writeFileSync(join(root, '.env.example'), 'X=\n');
  writeFileSync(join(root, 'page.html'), '<!doctype html><html><head></head><body></body></html>');
  writeFileSync(join(root, 'ok.html'), '<html lang="en"><head><title>Home</title></head></html>');

  const result = run(root, root);
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;
  assert.match(out, /pr\.yml: runs on pull_request_target and checks out code from the pull request head/);
  assert.match(out, /pr\.yml: no permissions block/);
  assert.match(out, /pr\.yml:6 actions\/checkout@v4 is not pinned/);
  assert.match(out, /pr\.yml:11 untrusted `github\.event\.pull_request\.title` expanded/);
  assert.doesNotMatch(out, /org\/tool|local-action|ok\.yml/);
  assert.match(out, /Dockerfile:5 API_KEY gets a value in the image/);
  assert.match(out, /- Dockerfile: the final stage runs as root/);
  assert.doesNotMatch(out, /FROM node:22|FROM build|NPM_TOKEN|PORT|Dockerfile\.ok/);
  assert.match(out, /- \.env: environment file in the target/);
  assert.doesNotMatch(out, /\.env\.example/);
  assert.match(out, /- page\.html: no page title\n- page\.html: no page language/);
  assert.doesNotMatch(out, /ok\.html/);
});

test('does not read through a parent folder that links outside the target', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'audit-scan-parent-'));
  const outside = mkdtempSync(join(tmpdir(), 'audit-scan-outside-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  mkdirSync(join(root, 'conf'));
  writeFileSync(join(root, 'conf', 'keys.txt'), 'nothing\n');
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Initial');
  // The tracked folder is replaced by a link to a folder outside the target holding a file of the same name.
  rmSync(join(root, 'conf'), { recursive: true });
  writeFileSync(join(outside, 'keys.txt'), `token = '${treeKey}'\n`);
  symlinkSync(outside, join(root, 'conf'), 'junction');
  const result = run(root, '.');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /conf\/keys\.txt \(a parent folder links outside the target\)/);
  assert.doesNotMatch(result.stdout, /GitHub token/);
});

test('masks every secret on a line and names the files behind a truncated section', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'audit-scan-many-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const second = `ghp_${'y'.repeat(36)}`;
  const lines = Array.from({ length: 44 }, (_, i) => `const k${i} = 1;`);
  lines.unshift(`const a = '${treeKey}', b = '${second}', c = '${historyKey}';`);
  writeFileSync(join(root, 'many.js'), `${lines.join('\n')}\n`);
  writeFileSync(join(root, 'more.js'), Array.from({ length: 45 }, (_, i) => `const t${i} = 'ghp_${String(i).padStart(36, 'z')}';`).join('\n'));
  const result = run(root, '.');
  assert.equal(result.status, 0, result.stderr);
  for (const value of [treeKey, second, historyKey]) assert.ok(!result.stdout.includes(value), 'no secret is printed');
  assert.match(result.stdout, /^- many\.js:1 GitHub token[\s\S]*^- many\.js:1 GitHub token[\s\S]*^- many\.js:1 API key/m);
  assert.match(result.stdout, /^- … 8 more, in more\.js \(8\): read those files, or rerun with narrower path prefixes$/m);
});

test('stops reading the history at its byte limit and says so', async (t) => {
  const { scan } = require(script);
  const root = mkdtempSync(join(tmpdir(), 'audit-scan-cap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  for (let i = 0; i < 5; i++) {
    writeFileSync(join(root, 'notes.txt'), `${'line\n'.repeat(50)}${i}\n`);
    git(root, 'add', '.');
    git(root, 'commit', '-qm', `Note ${i}`);
  }
  const { historyNote } = await scan(root, [], { maxHistoryBytes: 400 });
  assert.match(historyNote, /^stopped after 0 MB of patches, at commit [0-9a-f]+ /);
});
