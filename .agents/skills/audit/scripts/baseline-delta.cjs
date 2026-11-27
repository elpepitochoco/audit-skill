'use strict';

// Compares the target with the commit a baseline report audited, for an incremental re-audit:
// files changed since then, and for each open finding whether a file it cites changed.
// Read-only. Usage: node baseline-delta.cjs <target-root> <baseline-report.md>
// Prints "Mode: incremental" or "Mode: full audit required: <reason>".

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function git(root, args) {
  const r = spawnSync('git', ['--no-optional-locks', '-C', root, '-c', 'core.quotepath=off', '-c', 'diff.autoRefreshIndex=false', ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

function headerValue(text, label) {
  const m = new RegExp(`^- \\*\\*${label.replace('/', '\\/')}\\*\\*[ \\t]*(.*)$`, 'm').exec(text);
  return m ? m[1].trim() : null;
}

function sections(text) {
  const out = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^ {0,3}## (.+?)\s*$/.exec(line);
    if (h) out[(current = h[1])] = [];
    else if (current) out[current].push(line);
  }
  return out;
}

// Paths a finding cites: relative links from audits/ (../path) and backticked path:line locators.
function citedPaths(block) {
  const paths = new Set();
  for (const m of block.matchAll(/\]\(\.\.\/([^)#\s]+)/g)) paths.add(decodeURIComponent(m[1]));
  for (const m of block.matchAll(/`([\w.-]+(?:\/[\w.-]+)*\.\w+)(?::\d+(?:-\d+)?)?`/g)) paths.add(m[1]);
  return [...paths];
}

function findings(lines = []) {
  const list = [];
  for (const line of lines) {
    const h = /^ {0,3}### (.+?)\s*$/.exec(line);
    if (h) {
      const [id, priority, , , status] = h[1].split(' · ').map((s) => s.trim());
      list.push({ id, priority, status, body: [] });
    } else if (list.length) list[list.length - 1].body.push(line);
  }
  return list.map((f) => ({ ...f, paths: citedPaths(f.body.join('\n')) }));
}

function delta(root, reportPath) {
  const text = readFileSync(reportPath, 'utf8');
  const branchCommit = headerValue(text, 'Branch / commit') ?? '';
  const commit = /`([0-9a-f]{7,64})`/.exec(branchCommit)?.[1] ?? /\b([0-9a-f]{7,64})\b/.exec(branchCommit)?.[1];
  const localChanges = headerValue(text, 'Local changes') ?? '';
  const parts = sections(text);
  const open = findings(parts.Findings).filter((f) => f.status && f.status !== 'Fixed');
  const planned = findings(parts['Planned later']);

  let reason = null;
  if (!commit) reason = 'the baseline records no commit';
  else if (git(root, ['cat-file', '-e', `${commit}^{commit}`]) === null) reason = `commit ${commit} is not in this repository`;
  else if (!/^none\b/i.test(localChanges)) reason = 'the baseline audited uncommitted changes, so its commit is not what it examined';

  const changed = [];
  if (!reason) {
    for (const line of (git(root, ['diff', '--name-status', '-M', '--no-ext-diff', '--no-textconv', commit, '--', '.']) ?? '').split('\n')) {
      const [status, ...files] = line.split('\t');
      if (status) changed.push({ status: status[0], files });
    }
    for (const file of (git(root, ['ls-files', '--others', '--exclude-standard', '--', '.']) ?? '').split('\n')) {
      if (file) changed.push({ status: '?', files: [file] });
    }
  }
  const relevant = changed.filter((c) => !c.files.every((f) => f.startsWith('audits/')));
  const touched = new Set(relevant.flatMap((c) => c.files));
  const mark = (f) => {
    if (reason) return 're-check';
    if (!f.paths.length) return 're-check: cites no file';
    const hit = f.paths.filter((p) => touched.has(p));
    return hit.length ? `re-check: ${hit.join(', ')} changed` : 'cited files unchanged';
  };
  return { commit, reason, relevant, open, planned, mark };
}

function main() {
  const [target, report] = process.argv.slice(2);
  if (!target || !report) throw new Error('Usage: node baseline-delta.cjs <target-root> <baseline-report.md>');
  const root = resolve(target);
  const { commit, reason, relevant, open, planned, mark } = delta(root, resolve(report));
  const head = git(root, ['rev-parse', '--short', 'HEAD'])?.trim() ?? 'no commit';
  const out = [`# Delta since ${report}`, `Baseline commit: ${commit ?? 'none'}; current HEAD: ${head}`,
    reason ? `Mode: full audit required: ${reason}` : 'Mode: incremental', ''];
  if (!reason) {
    out.push(`## Changed since the baseline commit (${relevant.length}; working tree and untracked files included)`);
    for (const c of relevant) out.push(`- ${c.status} ${c.files.join(' -> ')}`);
    if (!relevant.length) out.push('none');
    out.push('');
  }
  out.push(`## Open findings (${open.length})`);
  for (const f of open) out.push(`- ${f.id} · ${f.priority} · ${f.status}: ${mark(f)}${f.paths.length ? ` [cites ${f.paths.join(', ')}]` : ''}`);
  if (!open.length) out.push('none');
  if (planned.length) {
    out.push('', `## Planned later (${planned.length}): check each deadline or milestone`);
    for (const f of planned) out.push(`- ${f.id} · ${f.priority}: ${mark(f)}`);
  }
  console.log(out.join('\n'));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { citedPaths, delta };
