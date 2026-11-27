'use strict';

// Writes a report draft with the mechanical fields filled: Date with UTC offset, Branch / commit,
// Local changes, skill version, first-audit Baseline, section headings and an "auto" Summary row
// that publish-report.cjs counts. The agent replaces every <fill: …> placeholder.
// Usage: node report-skeleton.cjs <target-root> <scope-slug>
// Prints the draft path and the path to pass to publish-report.cjs.

const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { parseReportName, SCOPE_SLUG } = require('./report-name.cjs');

function git(root, args) {
  const r = spawnSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const pad = (n) => String(n).padStart(2, '0');

function localStamp(date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const minutes = -date.getTimezoneOffset();
  const offset = `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  return { date: `${day} ${time} ${offset}`, file: `${day}_${time.replaceAll(':', '-')}` };
}

function gitState(root) {
  if (git(root, ['rev-parse', '--is-inside-work-tree']) === null) {
    return { branch: 'outside Git', changes: 'Git state unavailable: the target is outside Git.' };
  }
  const name = git(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const commit = git(root, ['rev-parse', '--short', 'HEAD']);
  const branch = `${name ?? 'detached HEAD'}, ${commit ? `commit \`${commit}\`` : 'no commit yet'}`;
  const status = git(root, ['-c', 'core.quotepath=off', 'status', '--short', '--untracked-files=all', '--', '.']) ?? '';
  // Report files are excluded, as SKILL.md asks, unless reports are in scope.
  const lines = status.split(/\r?\n/).filter((l) => l && !/(?:^|[ "])audits\//.test(l.slice(3)));
  return { branch, changes: lines.length ? `\n${lines.map((l) => `  - \`${l}\``).join('\n')}` : 'none' };
}

function hasReports(root) {
  try {
    return readdirSync(join(root, 'audits')).some((name) => parseReportName(name));
  } catch {
    return false;
  }
}

function skillVersion() {
  const skill = readFileSync(join(__dirname, '..', 'SKILL.md'), 'utf8');
  return /^\s*version:\s*"?([^"\s]+)"?/m.exec(skill)?.[1] ?? 'unknown';
}

function skeleton(root, scope, now = new Date()) {
  const stamp = localStamp(now);
  const { branch, changes } = gitState(root);
  const baseline = hasReports(root)
    ? '<fill: baseline report and why it was chosen, or why none applies (references/tracking.md)>'
    : 'None: first audit';
  const text = `# Audit: <fill: short title of the scope>

- **Date** ${stamp.date}
- **Branch / commit** ${branch}
- **Local changes** ${changes}
- **Scope** <fill: axes, sub-categories, repository areas>
- **Criteria mode** <fill: built-in grid, extended grid or supplied criteria only>
- **Checks and references** <fill: checks applied and supplied references with their hashes>. Skill version ${skillVersion()}.
- **Baseline** ${baseline}

## Summary

| Critical | High | Medium | Low | Informational |
| --- | --- | --- | --- | --- |
| auto | auto | auto | auto | auto |

<fill: two or three sentences on the most important findings>

## Findings

<fill: findings in the format of references/report.md, ordered by priority; delete this line if there are none>

## Coverage and limitations

- **Files** <fill: n> in scope: <fill: n> read in full, <fill: n> sampled, <fill: n> not read
- **Sub-categories** <fill: n> assessed, <fill: n> not applicable, <fill: n> not assessed
- <fill: checks run with results, checks not run with the reason, sub-categories not applicable>
`;
  return { text, name: `${stamp.file}-${scope}.md` };
}

function main() {
  const [target, scope] = process.argv.slice(2);
  if (!target || !scope) throw new Error('Usage: node report-skeleton.cjs <target-root> <scope-slug>');
  if (!SCOPE_SLUG.test(scope)) throw new Error('The scope slug must be kebab-case, for example general or billing-security.');
  const root = resolve(target);
  if (!statSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
  const { text, name } = skeleton(root, scope);
  const draft = join(tmpdir(), `audit-draft-${randomBytes(4).toString('hex')}-${name}`);
  writeFileSync(draft, text, { flag: 'wx' });
  console.log(`Draft: ${draft}`);
  console.log(`Publish to: ${join(root, 'audits', name)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { skeleton };
