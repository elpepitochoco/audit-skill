'use strict';

// Read-only pre-scan: prints leads for checks the references already require
// (secrets in the tree and the Git history, documented commands and links, pinned
// dependencies, vendored code, tested files) and the file count for Coverage.
// Usage: node scan.cjs <target-root> [<path-prefix>...]
// Exits 1 only when the target itself cannot be scanned; per-file problems go under Not scanned.

const { spawn, spawnSync } = require('node:child_process');
const { existsSync, lstatSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { dirname, join, posix, relative, resolve, sep } = require('node:path');
const readline = require('node:readline');

const MAX_LINES = 40; // per section, to keep the output cheap to read
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_HISTORY_COMMITS = 5000; // newest commits whose patches are read for secrets
const SKIP_DIRS = new Set(['.git', 'node_modules', 'audits', '.venv', 'venv', '__pycache__', 'dist', 'build']);
const SKILL_DIRS = ['.agents/skills/audit/', '.claude/skills/audit/'];

const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/, () => 'PEM block'],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/, (v) => `AKIA…, ${v.length} chars`],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, (v) => `${v.slice(0, 4)}…, ${v.length} chars`],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/, (v) => `${v.slice(0, 5)}…, ${v.length} chars`],
  ['API key', /\b(?:sk|pk|rk)_(?:live|test|prod)_[A-Za-z0-9]{8,}/, (v) => `${v.slice(0, v.indexOf('_', 3) + 1)}…, ${v.length} chars`],
  ['credentials in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:[^\s@/'"]+@/i, () => 'user:password@'],
  ['assigned secret', /\b(?:api[_-]?key|secret|password|passwd|token|private[_-]?key)\w*["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i, (v) => `${v.length} chars`],
];

function git(root, args) {
  const r = spawnSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

function walk(root, dir = '', out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, rel, out);
    } else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function listFiles(root, inGit) {
  const listed = inGit ? git(root, ['-c', 'core.quotepath=off', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']) : null;
  const files = listed === null ? walk(root) : listed.split('\0').filter(Boolean);
  return [...new Set(files)].filter((f) => !f.startsWith('audits/') && !SKILL_DIRS.some((d) => f.startsWith(d)) && existsSync(join(root, f)));
}

// Returns the text, or why the file was not read. lstat, so a symbolic link never leads outside the target.
function readText(root, file) {
  const path = join(root, file);
  const info = lstatSync(path);
  if (info.isSymbolicLink()) return { skip: 'symbolic link' };
  if (!info.isFile()) return { skip: 'not a regular file' };
  if (info.size > MAX_TEXT_BYTES) return { skip: 'over 1 MB' };
  const buf = readFileSync(path);
  if (buf.subarray(0, 8000).includes(0)) return { skip: 'binary' };
  return { text: buf.toString('utf8') };
}

function regularFile(path) {
  return lstatSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

// Replaces any secret value in a printed line by its mask, whatever section the line comes from.
function sanitize(line) {
  let out = line;
  for (const hit of findSecrets(line)) out = out.split(hit.value).join(`[${hit.type}: ${hit.masked}]`);
  return out;
}

function findSecrets(line) {
  const hits = [];
  for (const [type, pattern, mask] of SECRET_PATTERNS) {
    const m = pattern.exec(line);
    if (!m) continue;
    const value = m[1] ?? m[0];
    if (type === 'assigned secret' && (/^(?:process\.env|os\.environ|\$\{|<|\{\{)/.test(value) || hits.length)) continue;
    hits.push({ type, value, masked: mask(value) });
  }
  return hits;
}

// Reads the patches of the newest MAX_HISTORY_COMMITS commits on all refs; the caller reports the limit.
async function historySecrets(root, prefixes, current) {
  const args = ['--no-optional-locks', '-C', root, '-c', 'core.quotepath=off', 'log', '--all', `--max-count=${MAX_HISTORY_COMMITS}`,
    '-p', '-U0', '--relative', '--no-color', '--no-ext-diff', '--no-textconv', '--date=short', '--format=commit %h %ad', '--', ...prefixes];
  const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const exit = new Promise((done) => child.on('close', done));
  const seen = new Map();
  let commit = '';
  let file = '';
  for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    if (line.startsWith('commit ')) commit = line.slice(7);
    else if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (line.startsWith('+') && file && !file.startsWith('audits/')) {
      for (const hit of findSecrets(line.slice(1))) {
        if (current.has(hit.value)) continue;
        // git log lists newest first, so keep overwriting to end on the commit that introduced it.
        seen.set(hit.value, { ...hit, file, commit });
      }
    }
  }
  const code = await exit;
  return { hits: [...seen.values()], error: code === 0 ? null : stderr.trim().split(/\r?\n/)[0] || `git log exited with ${code}` };
}

function nearestManifest(root, file, name) {
  for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
    const path = join(root, dir === '.' ? '' : dir, name);
    if (regularFile(path)) return path;
    if (dir === '.' || dir === '') return null;
  }
}

function packageScripts(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).scripts ?? {};
  } catch {
    return null;
  }
}

function checkDocs(root, file, text, out) {
  const lines = text.split(/\r?\n/);
  const pkg = nearestManifest(root, file, 'package.json');
  const scripts = pkg && packageScripts(pkg);
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    for (const m of line.matchAll(/\b(npm|yarn|pnpm)\s+(?:run\s+)?([a-z][\w:.-]*)/g)) {
      const [, tool] = m;
      const name = m[2].replace(/[.:]+$/, '');
      const builtin = ['install', 'i', 'ci', 'add', 'init', 'exec', 'dlx', 'publish', 'audit', 'update', 'remove', 'link', 'pack', 'version', 'outdated', 'ls', 'login', 'config', 'cache', 'why'];
      // Without "run", npm only runs a script for these lifecycle names; any other word is prose or a built-in.
      const npmScript = /\brun\s/.test(m[0]) || ['start', 'test', 'build', 'dev', 'lint'].includes(name);
      if (builtin.includes(name) || (tool === 'npm' && !npmScript)) continue;
      if (scripts && !(name in scripts) && !(name === 'start' && existsSync(join(dirname(pkg), 'server.js')))) {
        out.commands.push(`${at} \`${m[0]}\`: no "${name}" script in ${relative(root, pkg).split(sep).join('/')}`);
      }
    }
    for (const m of line.matchAll(/\b(?:node|python3?|sh|bash|ruby)\s+((?:\.{1,2}\/)?[\w./-]+\.(?:c?js|mjs|py|sh|rb))\b/g)) {
      const base = posix.dirname(file);
      if (!existsSync(join(root, m[1])) && !existsSync(join(root, base, m[1]))) out.commands.push(`${at} \`${m[0]}\`: ${m[1]} not found`);
    }
    for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      let target;
      try { target = decodeURI(m[1]).replace(/[#?].*$/, ''); } catch { out.links.push(`${at} → ${m[1]}: malformed URL encoding`); continue; }
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes('{')) continue;
      const path = target.startsWith('/') ? join(root, target) : join(root, posix.dirname(file), target);
      if (!existsSync(path)) out.links.push(`${at} → ${m[1]}`);
    }
  });
}

function checkDependencies(root, file, text, files, out) {
  if (file.endsWith('package.json')) {
    let json;
    try { json = JSON.parse(text); } catch { return out.deps.push(`${file}: not valid JSON`); }
    const deps = { ...json.dependencies, ...json.devDependencies };
    const loose = Object.entries(deps).filter(([, v]) => /^(?:\*|latest|x|)$|^(?:git|https?):|github:|\.x$/.test(String(v).trim()));
    for (const [name, v] of loose) out.deps.push(`${file}: "${name}": "${v}" is not pinned`);
    const dir = posix.dirname(file) === '.' ? '' : `${posix.dirname(file)}/`;
    const locks = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'];
    if (Object.keys(deps).length && !locks.some((l) => files.has(dir + l))) out.deps.push(`${file}: ${Object.keys(deps).length} dependencies, no lockfile`);
  } else if (/(^|\/)requirements[\w-]*\.txt$/.test(file)) {
    text.split(/\r?\n/).forEach((line, i) => {
      const spec = line.replace(/#.*/, '').trim();
      if (spec && !spec.startsWith('-') && !/==|@/.test(spec)) out.deps.push(`${file}:${i + 1} \`${spec}\` is not pinned`);
    });
  }
}

const CODE = /\.(?:c?js|mjs|jsx|tsx?|py|go|rb|java|cs|php|rs|kt|swift)$/;
const TEST = /(?:^|\/)(?:tests?|__tests__|spec)\/|[._-](?:test|spec)\.[a-z]+$|(?:^|\/)test_[^/]+\.py$|_test\.(?:go|py)$/;
const VENDOR = /(?:^|\/)(?:vendor|third[_-]party|external)\/|\.min\.(?:js|css)$/;

async function scan(root, prefixes) {
  const inGit = git(root, ['rev-parse', '--is-inside-work-tree']) !== null;
  const all = listFiles(root, inGit);
  const files = prefixes.length ? all.filter((f) => prefixes.some((p) => f === p || f.startsWith(p.replace(/\/?$/, '/')))) : all;
  const fileSet = new Set(all);
  const out = { secrets: [], history: [], commands: [], links: [], deps: [], vendored: [], unread: [], untested: [] };
  const current = new Set();
  const texts = new Map();
  for (const file of files) {
    // One unreadable file must not cost the agent every other lead.
    try {
      const { text, skip } = readText(root, file);
      if (skip) { out.unread.push(`${file} (${skip})`); continue; }
      texts.set(file, text);
      text.split(/\r?\n/).forEach((line, i) => {
        for (const hit of findSecrets(line)) {
          current.add(hit.value);
          out.secrets.push(`${file}:${i + 1} ${hit.type} (${hit.masked})`);
        }
      });
      if (/\.(?:md|markdown)$/i.test(file)) checkDocs(root, file, text, out);
      checkDependencies(root, file, text, fileSet, out);
      if (VENDOR.test(file) || (/\.(?:c?js|css)$/.test(file) && text.split('\n', 20).some((l) => l.length > 1000))) out.vendored.push(file);
    } catch (error) {
      out.unread.push(`${file} (${error.code || error.message})`);
    }
  }
  let historyNote = null;
  if (inGit) {
    const { hits, error } = await historySecrets(root, prefixes, current);
    for (const h of hits) out.history.push(`${h.file} ${h.type} (${h.masked}), added in ${h.commit}, absent from the current tree`);
    const total = Number(git(root, ['rev-list', '--all', '--count']));
    if (error) historyNote = `incomplete: git log failed (${error}); check the history by hand`;
    else if (total > MAX_HISTORY_COMMITS) historyNote = `newest ${MAX_HISTORY_COMMITS} of ${total} commits checked; older history not checked`;
  }
  const tests = files.filter((f) => TEST.test(f) && texts.has(f));
  const testText = tests.map((f) => texts.get(f)).join('\n');
  const sources = files.filter((f) => CODE.test(f) && !TEST.test(f) && !out.vendored.includes(f));
  if (tests.length) {
    for (const f of sources) {
      const stem = posix.basename(f).replace(/\.[^.]+$/, '');
      if (!new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(testText)) out.untested.push(f);
    }
  }
  return { inGit, files, tests, sources, out, historyNote };
}

function section(title, lines, empty = 'none') {
  const shown = lines.slice(0, MAX_LINES).map((l) => `- ${sanitize(l)}`);
  if (lines.length > MAX_LINES) shown.push(`- … ${lines.length - MAX_LINES} more: rerun with narrower path prefixes to list them`);
  return `## ${title}\n${shown.length ? shown.join('\n') : empty}\n`;
}

function format(root, prefixes, { inGit, files, tests, sources, out, historyNote }) {
  const byExt = {};
  for (const f of files) {
    const ext = posix.extname(f) || posix.basename(f);
    byExt[ext] = (byExt[ext] ?? 0) + 1;
  }
  const exts = Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${n} ${e}`).join(', ');
  return [
    `# Pre-scan of ${root}${prefixes.length ? ` (paths: ${prefixes.join(', ')})` : ''}`,
    'Leads only: confirm each one in the source before reporting it.\n',
    `## Files\n- ${files.length} in scope${inGit ? ' (Git: tracked and untracked, ignored files excluded)' : ' (outside Git: directory walk)'}: ${exts || 'none'}\n- ${sources.length} source files, ${tests.length} test files\n`,
    section('Secrets in the current tree', out.secrets),
    inGit ? section('Secrets only in the Git history', out.history) + (historyNote ? `Note: ${historyNote}\n` : '') : '## Secrets only in the Git history\nnot checked: outside Git\n',
    section('Documented commands with no target', out.commands),
    section('Broken relative links in Markdown', out.links),
    section('Dependencies', out.deps),
    section('Vendored, minified or generated files', out.vendored),
    tests.length ? section('Source files no test file names', out.untested) : '## Source files no test file names\nno test files found\n',
    section('Not scanned', out.unread),
  ].join('\n');
}

async function main() {
  const [target, ...prefixes] = process.argv.slice(2);
  if (!target) throw new Error('Usage: node scan.cjs <target-root> [<path-prefix>...]');
  const root = resolve(target);
  if (!statSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
  const clean = prefixes.map((p) => p.split(sep).join('/').replace(/^\.\//, ''));
  process.stdout.write(format(root, clean, await scan(root, clean)));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { findSecrets, scan };
