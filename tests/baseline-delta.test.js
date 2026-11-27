'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const script = join(__dirname, '..', '.agents', 'skills', 'audit', 'scripts', 'baseline-delta.cjs');
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const run = (root, report, ...prefixes) => spawnSync(process.execPath, [script, root, report, ...prefixes], { encoding: 'utf8' });

const report = (commit, changes = 'none') => `# Audit: general

- **Date** 2026-11-27 10:00:00 +01:00
- **Branch / commit** main, commit \`${commit}\`
- **Local changes** ${changes}
- **Baseline** None: first audit

## Findings

### GEN-01 · High · Security / Identity and access rights · Confirmed · New

- **Observed** [src/a.js:3](../src/a.js#L3) deletes without a check.

### GEN-02 · Medium · Quality / Tests and CI · Confirmed · New

- **Observed** \`src/b.js:1\` has no test.

### GEN-03 · Low · Documentation / Usage and configuration · Confirmed · New

- **Observed** The configuration is not described.

### GEN-04 · Low · Quality / Code quality · Confirmed · Fixed

- **Observed** [src/a.js:9](../src/a.js#L9) was cleaned up.

## Planned later

### GEN-05 · Medium · Security / Input validation · Confirmed · Planned later

- **Observed** \`src/b.js:4\` accepts any amount.

## Coverage and limitations
`;

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'audit-delta-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.js'), 'a\n');
  writeFileSync(join(root, 'src', 'b.js'), 'b\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Initial');
  return { root, commit: git(root, 'rev-parse', '--short', 'HEAD') };
}

test('lists changes since the baseline commit and which open findings to re-check', (t) => {
  const { root, commit } = repo(t);
  mkdirSync(join(root, 'audits'));
  writeFileSync(join(root, 'audits', 'base.md'), report(commit));
  writeFileSync(join(root, 'src', 'a.js'), 'a changed\n');
  writeFileSync(join(root, 'src', 'c.js'), 'c\n');
  git(root, 'add', 'src');
  git(root, 'commit', '-qm', 'Change a, add c');
  writeFileSync(join(root, 'notes.txt'), 'untracked\n');

  const result = run(root, join(root, 'audits', 'base.md'));
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;
  assert.match(out, /^Mode: incremental$/m);
  assert.match(out, /^- M src\/a\.js$/m);
  assert.match(out, /^- A src\/c\.js$/m);
  assert.match(out, /^- \? notes\.txt$/m);
  assert.doesNotMatch(out, /^- \S+ audits\//m, 'the report folder is not a change');
  assert.match(out, /GEN-01 · High · New: re-check: src\/a\.js changed/);
  assert.match(out, /GEN-02 · Medium · New: cited files unchanged; full entry in base\.md \[cites src\/b\.js\]/);
  assert.match(out, /GEN-03 · Low · New: re-check: cites no file/);
  assert.doesNotMatch(out, /GEN-04/);
  assert.match(out, /## Planned later \(1\)[\s\S]*GEN-05 · Medium: cited files unchanged/);
});

test('a carried entry keeps pointing to the report holding the full entry', (t) => {
  const { root, commit } = repo(t);
  mkdirSync(join(root, 'audits'));
  const carried = report(commit).replace(
    /### GEN-02 · Medium · Quality \/ Tests and CI · Confirmed · New\n\n- \*\*Observed\*\* `src\/b\.js:1` has no test\./,
    '### GEN-02 · Medium · Quality / Tests and CI · Confirmed · Still present\n\n- **Carried** `src/b.js` unchanged since `abc1234`; full entry in [the first report](2026-11-20_10-00-00-general.md).',
  );
  writeFileSync(join(root, 'audits', 'second.md'), carried);
  const missing = run(root, join(root, 'audits', 'second.md'));
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.stdout, /GEN-02 · Medium · Still present: re-check: 2026-11-20_10-00-00-general\.md, which holds the full entry, is missing/);

  writeFileSync(join(root, 'audits', '2026-11-20_10-00-00-general.md'), report(commit));
  const result = run(root, join(root, 'audits', 'second.md'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GEN-02 · Medium · Still present: cited files unchanged; full entry in 2026-11-20_10-00-00-general\.md \[cites src\/b\.js\]/);
});

test('a malformed link encoding is kept as written', () => {
  const { citedPaths } = require(script);
  assert.deepEqual(citedPaths('[a](../src/my%20file.js#L2) [b](../src/%E0%A4%A.js)'), ['src/my file.js', 'src/%E0%A4%A.js']);
});

test('dependency and secret findings are re-checked even when their files are unchanged', (t) => {
  const { root, commit } = repo(t);
  mkdirSync(join(root, 'audits'));
  writeFileSync(join(root, 'audits', 'base.md'), report(commit).replace('Quality / Tests and CI', 'Security / Dependencies and security configuration'));
  const result = run(root, join(root, 'audits', 'base.md'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GEN-02 · Medium · New: re-check: depends on facts outside the repository/);
});

test('a failing git command requires a full audit instead of reporting no change', (t) => {
  const { root, commit } = repo(t);
  mkdirSync(join(root, 'audits'));
  writeFileSync(join(root, 'audits', 'base.md'), report(commit));
  writeFileSync(join(root, '.git', 'index'), 'corrupt');
  const result = run(root, join(root, 'audits', 'base.md'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /full audit required: git could not list the changes/);
});

test('requires a full audit when the baseline commit is unusable', (t) => {
  const { root, commit } = repo(t);
  const dir = mkdtempSync(join(tmpdir(), 'audit-delta-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cases = [
    [report(commit, '\n  - `?? draft.md`'), /full audit required: the baseline audited uncommitted changes/],
    [report('0123456789abcdef'), /full audit required: commit 0123456789abcdef is not in this repository/],
    [report('x').replace(/commit `x`/, 'no commit yet'), /full audit required: the baseline records no commit/],
    [report('x').replace(/main, commit `x`/, 'fix/deadbeef1, no commit yet'), /full audit required: the baseline records no commit/],
  ];
  cases.forEach(([text, expected], i) => {
    writeFileSync(join(dir, `${i}.md`), text);
    const result = run(root, join(dir, `${i}.md`));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
    assert.match(result.stdout, /GEN-02 · Medium · New: re-check \[cites/);
  });
});

test('a finding left To verify is re-checked even when its files are unchanged', (t) => {
  const { root, commit } = repo(t);
  mkdirSync(join(root, 'audits'));
  writeFileSync(join(root, 'audits', 'base.md'), report(commit).replace('Tests and CI · Confirmed', 'Tests and CI · To verify'));
  const result = run(root, join(root, 'audits', 'base.md'));
  assert.match(result.stdout, /GEN-02 · Medium · New: re-check: not confirmed in the baseline/);
});

test('rotation picks unread unchanged files, riskiest first, and skips those read along the chain', (t) => {
  const { root, commit } = repo(t);
  for (const [file, text] of [['src/auth.js', 'a'], ['src/util.js', 'u'], ['test/auth.test.js', 't'], ['logo.png', 'p'], ['lib/seen.js', 's']]) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), `${text}\n`);
  }
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'More files');
  const head = git(root, 'rev-parse', '--short', 'HEAD');
  mkdirSync(join(root, 'audits'));
  // The first report read lib/seen.js in rotation; the second names it as its baseline.
  writeFileSync(join(root, 'audits', 'first.md'), `${report(commit)}\n- **Rotation** \`lib/seen.js\` read in full.\n`);
  writeFileSync(join(root, 'audits', 'second.md'), report(head).replace('None: first audit', '[first](first.md), the latest report'));
  const result = run(root, join(root, 'audits', 'second.md'));
  assert.equal(result.status, 0, result.stderr);
  const picked = result.stdout.split('## Rotation')[1].match(/^- `[^`]+`$/gm);
  // Cited files still count as unread: a citation does not mean the file was read in full. logo.png is not text.
  assert.deepEqual(picked, ['- `src/auth.js`', '- `src/a.js`', '- `src/b.js`', '- `src/util.js`', '- `test/auth.test.js`']);
  assert.match(result.stdout, /5 of 6 unchanged text files are named by no Rotation bullet in the 2 report\(s\)/);
  assert.doesNotMatch(result.stdout, /No report in the chain has a Rotation bullet/);

  const scoped = run(root, join(root, 'audits', 'second.md'), 'test');
  assert.deepEqual(scoped.stdout.split('## Rotation')[1].match(/^- `[^`]+`$/gm), ['- `test/auth.test.js`']);
});

test('names with tabs or line breaks are listed whole', { skip: process.platform === 'win32' }, (t) => {
  const { root, commit } = repo(t);
  mkdirSync(join(root, 'audits'));
  writeFileSync(join(root, 'audits', 'base.md'), report(commit));
  writeFileSync(join(root, 'src', 'odd\tname\n.js'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Odd name');
  const result = run(root, join(root, 'audits', 'base.md'));
  assert.ok(result.stdout.includes('- A src/odd\tname\n.js'), result.stdout);
});

test('links out of audits/ are not followed', (t) => {
  const { root, commit } = repo(t);
  mkdirSync(join(root, 'audits'));
  writeFileSync(join(root, 'outside.md'), `${report(commit)}\n- **Rotation** \`src/auth.js\` read in full.\n`);
  const carried = report(commit)
    .replace('None: first audit', '[earlier](../outside.md)')
    .replace(/### GEN-02 · Medium · Quality \/ Tests and CI · Confirmed · New\n\n- \*\*Observed\*\* `src\/b\.js:1` has no test\./,
      '### GEN-02 · Medium · Quality / Tests and CI · Confirmed · Still present\n\n- **Carried** `src/b.js` unchanged since `abc1234`; full entry in [out](../outside.md).');
  writeFileSync(join(root, 'audits', 'second.md'), carried);
  const result = run(root, join(root, 'audits', 'second.md'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GEN-02 · Medium · Still present: re-check: the full entry link \.\.\/outside\.md is not a report in audits\//);
  assert.match(result.stdout, /in the 1 report\(s\) of the chain/, 'the Baseline link to ../outside.md is not followed');
});
