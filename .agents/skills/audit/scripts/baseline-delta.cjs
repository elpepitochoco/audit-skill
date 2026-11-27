'use strict';

// Compares the target with the commit a baseline report audited, for an incremental re-audit:
// files changed since then, and for each open finding whether a file it cites changed.
// Also picks the unchanged files to read in full this run (rotation), so coverage grows across re-audits.
// Read-only. Usage: node baseline-delta.cjs <target-root> <baseline-report.md> [<path-prefix>...]
// Prints "Mode: incremental" or "Mode: full audit required: <reason>".

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { basename, dirname, join, resolve } = require('node:path');
const { reportLines } = require('./report-markdown.cjs');

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
  const { visible, structural } = reportLines(text);
  visible.forEach((line, i) => {
    const h = /^## (.+?)\s*$/.exec(structural[i]);
    if (h) out[(current = h[1])] = [];
    // Indent fenced or commented lines by four spaces so a heading quoted as evidence is not read as one.
    else if (current) out[current].push(structural[i] || !line.trim() ? line : `    ${line}`);
  });
  return out;
}

// A malformed percent-encoding is kept as written instead of stopping the script.
function decodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// Paths a finding cites: relative links from audits/ (../path) and backticked path:line locators.
function citedPaths(block) {
  const paths = new Set();
  for (const m of block.matchAll(/\]\(\.\.\/([^)#\s]+)/g)) paths.add(decodePath(m[1]));
  for (const m of block.matchAll(/`([\w.-]+(?:\/[\w.-]+)*\.\w+)(?::\d+(?:-\d+)?)?`/g)) paths.add(m[1]);
  return [...paths];
}

function findings(lines = []) {
  const list = [];
  for (const line of lines) {
    const h = /^ {0,3}### (.+?)\s*$/.exec(line);
    if (h) {
      const [id, priority, pair, certainty, status] = h[1].split(' · ').map((s) => s.trim());
      list.push({ id, priority, pair, certainty, status, body: [] });
    } else if (list.length) list[list.length - 1].body.push(line);
  }
  return list.map((f) => {
    const body = f.body.join('\n');
    // A carried entry points to the report holding the full entry; keep that pointer along the chain.
    const source = /^- \*\*Carried\*\*.*?\]\(([^)\s#]+\.md)/m.exec(body)?.[1];
    const title = /^\*\*(\S.*)\*\*\s*$/m.exec(body)?.[1];
    return { ...f, title, body, source, paths: citedPaths(body) };
  });
}

// Advisories and leaked credentials change without any file changing.
const EXTERNAL = /\/ (?:Dependencies|Secrets)\b/;
const ROTATION_SIZE = 8; // measured on case 79b: 15 made a Codex re-audit cost as much as a full audit
const SKIP = /^(?:audits|\.agents\/skills\/audit|\.claude\/skills\/audit)\//;
const TEXT = /\.(?:c?js|mjs|jsx|tsx?|py|go|rb|java|cs|php|rs|kt|swift|sh|ps1|ya?ml|json|toml|ini|cfg|conf|tf|sql|html?|md|txt)$|(?:^|\/)(?:Dockerfile|Makefile|\.env[^/]*)$/i;

// Higher first: where a gap does the most harm. Ties go to the shorter path, then alphabetical order.
function risk(path) {
  let score = 0;
  if (/auth|login|session|admin|permission|acl|role|token|crypt|passw|secret|secur/i.test(path)) score += 4;
  if (/route|controller|handler|api|server|app\.|index\.|main\.|middleware/i.test(path)) score += 3;
  if (/config|setting|\.env|docker|workflow|db|database|model|migration|store|upload|payment|billing/i.test(path)) score += 2;
  // Tests, examples and docs come after every source file, whatever their names say.
  if (/(?:^|\/)(?:tests?|__tests__|spec|examples?|docs?|benchmarks?|fixtures?)\//i.test(path)) score -= 10;
  return score;
}

function baselineLink(text, reportPath) {
  const link = /\]\(([^)\s#]+\.md)\)/.exec(headerValue(text, 'Baseline') ?? '')?.[1];
  return link ? join(dirname(reportPath), decodePath(link)) : null;
}

// Files the chain of reports read in full (Rotation bullets) or cited as evidence, newest report first.
function readSoFar(reportPath) {
  const read = new Set();
  const seen = new Set();
  let rotations = 0;
  for (let path = reportPath; path && existsSync(path) && !seen.has(path) && seen.size < 100; ) {
    seen.add(path);
    const text = readFileSync(path, 'utf8');
    for (const f of findings(Object.values(sections(text)).flat())) f.paths.forEach((p) => read.add(p));
    const rotation = /^- \*\*Rotation\*\*(.*(?:\n(?!- \*\*|#).*)*)/m.exec(text)?.[1];
    if (rotation) {
      rotations += 1;
      for (const m of rotation.matchAll(/`([^`]+)`/g)) read.add(m[1]);
    }
    path = baselineLink(text, path);
  }
  return { read, rotations, reports: seen.size };
}

function rotation(root, reportPath, prefixes, touched) {
  const listed = git(root, ['ls-files', '-z', '--', ...(prefixes.length ? prefixes : ['.'])]);
  if (listed === null) return null;
  const { read, rotations, reports } = readSoFar(reportPath);
  const inScope = listed.split('\0').filter((f) => f && !SKIP.test(f) && TEXT.test(f) && !touched.has(f));
  const unread = inScope.filter((f) => !read.has(f));
  unread.sort((a, b) => risk(b) - risk(a) || a.length - b.length || (a < b ? -1 : 1));
  return { pick: unread.slice(0, ROTATION_SIZE), unread: unread.length, inScope: inScope.length, rotations, reports };
}

function delta(root, reportPath, prefixes = []) {
  const text = readFileSync(reportPath, 'utf8');
  const branchCommit = headerValue(text, 'Branch / commit') ?? '';
  // Only a backticked hash or one written after "commit": a branch such as fix/deadbeef1 is not a commit.
  const commit = /`([0-9a-f]{7,64})`/.exec(branchCommit)?.[1] ?? /\bcommit ([0-9a-f]{7,64})\b/.exec(branchCommit)?.[1];
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
    // -z: names with tabs, quotes or line breaks come through unquoted and unsplit.
    const diff = git(root, ['diff', '-z', '--name-status', '-M', '--no-ext-diff', '--no-textconv', commit, '--', '.']);
    const others = git(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', '.']);
    // A failed command must not read as "nothing changed".
    if (diff === null || others === null) reason = 'git could not list the changes since the baseline commit';
    else {
      const fields = diff.split('\0');
      for (let i = 0; i < fields.length && fields[i]; ) {
        const status = fields[i][0];
        const count = status === 'R' || status === 'C' ? 2 : 1;
        changed.push({ status, files: fields.slice(i + 1, i + 1 + count) });
        i += 1 + count;
      }
      for (const file of others.split('\0')) if (file) changed.push({ status: '?', files: [file] });
    }
  }
  // Reports and the installed skill are not the target.
  const relevant = changed.filter((c) => !c.files.every((f) => SKIP.test(f)));
  const touched = new Set(relevant.flatMap((c) => c.files));
  const mark = (f) => {
    if (reason) return 're-check';
    if (!f.paths.length) return 're-check: cites no file';
    if (EXTERNAL.test(f.pair ?? '')) return 're-check: depends on facts outside the repository';
    if (f.certainty !== 'Confirmed') return 're-check: not confirmed in the baseline';
    if (f.source && !existsSync(join(dirname(reportPath), f.source))) return `re-check: ${f.source}, which holds the full entry, is missing`;
    const hit = f.paths.filter((p) => touched.has(p));
    return hit.length ? `re-check: ${hit.join(', ')} changed` : 'cited files unchanged';
  };
  const rotate = reason ? null : rotation(root, reportPath, prefixes, touched);
  return { commit, reason, relevant, open, planned, mark, rotate };
}

function main() {
  const [target, report, ...rawPrefixes] = process.argv.slice(2);
  if (!target || !report) throw new Error('Usage: node baseline-delta.cjs <target-root> <baseline-report.md> [<path-prefix>...]');
  const root = resolve(target);
  const prefixes = rawPrefixes.map((p) => p.split('\\').join('/').replace(/^\.\//, ''));
  const { commit, reason, relevant, open, planned, mark, rotate } = delta(root, resolve(report), prefixes);
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
  for (const f of open) {
    const full = mark(f) === 'cited files unchanged' ? `; full entry in ${f.source ?? basename(report)}` : '';
    out.push(`- ${f.id} · ${f.priority} · ${f.status}: ${mark(f)}${full}${f.paths.length ? ` [cites ${f.paths.join(', ')}]` : ''}`);
  }
  if (!open.length) out.push('none');
  if (planned.length) {
    out.push('', `## Planned later (${planned.length}): check each deadline or milestone`);
    for (const f of planned) out.push(`- ${f.id} · ${f.priority}: ${mark(f)}`);
  }
  if (rotate) {
    out.push('', `## Rotation: read these ${rotate.pick.length} unchanged files in full and name them in a **Rotation** bullet`,
      `${rotate.unread} of ${rotate.inScope} unchanged text files${prefixes.length ? ` under ${prefixes.join(', ')}` : ''} are named by no Rotation bullet and cited by no finding in the ${rotate.reports} report(s) of the chain; riskiest first.`);
    if (!rotate.rotations) out.push('No report in the chain has a Rotation bullet: files the first audit read without citing them may come up again.');
    for (const f of rotate.pick) out.push(`- \`${f}\``);
    if (!rotate.pick.length) out.push('none: every unchanged file has been read or cited');
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

module.exports = { citedPaths, decodePath, delta, findings, sections };
