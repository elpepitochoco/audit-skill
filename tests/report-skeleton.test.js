'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const scripts = join(__dirname, '..', '.agents', 'skills', 'audit', 'scripts');
const node = (script, ...args) => spawnSync(process.execPath, [join(scripts, script), ...args], { encoding: 'utf8' });
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'audit-skeleton-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'README.md'), 'Run npm start.\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Initial');
  writeFileSync(join(root, 'notes.txt'), 'draft\n');
  mkdirSync(join(root, 'audits'));
  writeFileSync(join(root, 'audits', 'scratch.md'), 'not a report name\n');
  return root;
}

function draftOf(result) {
  assert.equal(result.status, 0, result.stderr);
  const [, draft] = /^Draft: (.+)$/m.exec(result.stdout);
  const [, destination] = /^Publish to: (.+)$/m.exec(result.stdout);
  return { draft, destination };
}

test('fills the mechanical header fields and refuses to publish an unfilled draft', (t) => {
  const root = repo(t);
  const { draft, destination } = draftOf(node('report-skeleton.cjs', root, 'general'));
  t.after(() => rmSync(draft, { force: true }));
  const text = readFileSync(draft, 'utf8');
  assert.match(destination, /audits[\\/]\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-general\.md$/);
  assert.match(text, /^- \*\*Date\*\* \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/m);
  assert.match(text, /^- \*\*Branch \/ commit\*\* main, commit `[0-9a-f]+`$/m);
  assert.match(text, /`\?\? notes\.txt`/);
  assert.doesNotMatch(text, /scratch\.md/);
  assert.match(text, /^- \*\*Baseline\*\* None: first audit$/m);
  assert.match(text, /Skill version \d+\.\d+\.\d+\./);

  const refused = node('publish-report.cjs', '--check', draft, destination);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /unfilled skeleton placeholder/);
});

test('a filled draft publishes with the Summary counts computed from the findings', (t) => {
  const root = repo(t);
  const { draft, destination } = draftOf(node('report-skeleton.cjs', root, 'general'));
  t.after(() => rmSync(draft, { force: true }));
  const finding = `### GEN-01 · Medium · Documentation / Consistency with the code · Confirmed · New

**The README start command has no script**

- **Expected** Documented commands work.
- **Observed** [README.md:1](../README.md#L1) says \`npm start\`; there is no package.json.
- **Impact** The documented start fails.`;
  const filled = readFileSync(draft, 'utf8')
    .replace(/<fill: findings[^>]*>/, finding)
    .replace(/<fill: n>/g, '1')
    .replace(/<fill: [^>]*>/g, 'Filled.')
    .replace('**Criteria mode** Filled.', '**Criteria mode** built-in grid');
  const quoted = '```text\n| auto | auto | auto | auto | auto |\n```\n';
  writeFileSync(draft, `${filled}\nThe skeleton's counts row, quoted:\n\n${quoted}`);

  const published = node('publish-report.cjs', '--check', draft, destination);
  assert.equal(published.status, 0, published.stderr);
  const report = readFileSync(published.stdout.trim(), 'utf8');
  assert.match(report, /^\| 0 \| 0 \| 1 \| 0 \| 0 \|$/m);
  assert.ok(report.includes(quoted), 'an auto row outside the Summary is left as written');
  assert.equal(node('check-report.cjs', published.stdout.trim()).status, 0);
});

test('stops instead of recording "none" when git status fails', (t) => {
  const root = repo(t);
  writeFileSync(join(root, '.git', 'index'), 'corrupt');
  const result = node('report-skeleton.cjs', root, 'general');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /git status failed/);
});

test('names a later run baseline as a placeholder and records detached or unborn heads', (t) => {
  const root = repo(t);
  writeFileSync(join(root, 'audits', '2026-11-20_10-00-00-general.md'), '');
  git(root, 'checkout', '-q', '--detach');
  const later = readFileSync(draftOf(node('report-skeleton.cjs', root, 'general')).draft, 'utf8');
  assert.match(later, /^- \*\*Baseline\*\* <fill: baseline report/m);
  assert.match(later, /^- \*\*Branch \/ commit\*\* detached HEAD, commit/m);

  const empty = mkdtempSync(join(tmpdir(), 'audit-skeleton-empty-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  git(empty, 'init', '-q', '-b', 'main');
  assert.match(readFileSync(draftOf(node('report-skeleton.cjs', empty, 'general')).draft, 'utf8'), /main, no commit yet/);
  assert.match(readFileSync(draftOf(node('report-skeleton.cjs', join(empty, '..'), 'general')).draft, 'utf8'), /outside Git/);
});
