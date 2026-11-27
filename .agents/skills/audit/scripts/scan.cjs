'use strict';

// Read-only pre-scan: prints leads for checks the references already require
// (secrets in the tree and the Git history, documented commands and links, pinned
// dependencies, vendored code, tested files) and the file count for Coverage.
// Usage: node scan.cjs <target-root> [<path-prefix>...]
// Exits 1 only when the target itself cannot be scanned; per-file problems go under Not scanned.

const { spawn, spawnSync } = require('node:child_process');
const { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } = require('node:fs');
const { dirname, join, posix, relative, resolve, sep } = require('node:path');
const readline = require('node:readline');

const MAX_LINES = 40; // per section, to keep the output cheap to read
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_HISTORY_COMMITS = 5000; // newest commits whose patches are read for secrets
const MAX_HISTORY_BYTES = 512 * 1024 * 1024; // patch text read before stopping, to bound the scan time
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

// True when the real path, links in parent folders resolved, stays inside the target.
function inside(root, path) {
  const real = realpathSync(path);
  const base = realpathSync(root);
  return real === base || real.startsWith(base.endsWith(sep) ? base : base + sep);
}

// Returns the text, or why the file was not read. lstat, so a symbolic link never leads outside the target.
function readText(root, file) {
  const path = join(root, file);
  const info = lstatSync(path);
  if (info.isSymbolicLink()) return { skip: 'symbolic link' };
  if (!inside(root, path)) return { skip: 'a parent folder links outside the target' };
  if (!info.isFile()) return { skip: 'not a regular file' };
  if (info.size > MAX_TEXT_BYTES) return { skip: 'over 1 MB' };
  const buf = readFileSync(path);
  if (buf.subarray(0, 8000).includes(0)) return { skip: 'binary' };
  return { text: buf.toString('utf8') };
}

function regularFile(root, path) {
  return (lstatSync(path, { throwIfNoEntry: false })?.isFile() ?? false) && inside(root, path);
}

// Replaces any secret value in a printed line by its mask, whatever section the line comes from.
function sanitize(line) {
  let out = line;
  for (const hit of findSecrets(line)) out = out.split(hit.value).join(`[${hit.type}: ${hit.masked}]`);
  return out;
}

function findSecrets(line) {
  const hits = [];
  // Every match on the line, so a second secret is masked too.
  for (const [type, pattern, mask] of SECRET_PATTERNS) {
    for (const m of line.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      const value = m[1] ?? m[0];
      // An assignment whose value another pattern already named is the same secret.
      if (type === 'assigned secret' && (/^(?:process\.env|os\.environ|\$\{|<|\{\{)/.test(value)
        || hits.some((h) => value.includes(h.value) || h.value.includes(value)))) continue;
      hits.push({ type, value, masked: mask(value) });
    }
  }
  return hits;
}

// Reads the patches of the newest MAX_HISTORY_COMMITS commits on all refs; the caller reports the limit.
async function historySecrets(root, prefixes, current, maxBytes) {
  const args = ['--no-optional-locks', '-C', root, '-c', 'core.quotepath=off', 'log', '--all', `--max-count=${MAX_HISTORY_COMMITS}`,
    '-p', '-U0', '--relative', '--no-color', '--no-ext-diff', '--no-textconv', '--date=short', '--format=commit %h %ad', '--', ...prefixes];
  const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const exit = new Promise((done) => child.on('close', done));
  const seen = new Map();
  let commit = '';
  let file = '';
  let bytes = 0;
  let stoppedAt = null;
  for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    bytes += line.length + 1;
    if (bytes > maxBytes) {
      stoppedAt = commit;
      child.kill();
      break;
    }
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
  if (stoppedAt !== null) return { hits: [...seen.values()], error: null, stoppedAt };
  return { hits: [...seen.values()], error: code === 0 ? null : stderr.trim().split(/\r?\n/)[0] || `git log exited with ${code}` };
}

function nearestManifest(root, file, name) {
  for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
    const path = join(root, dir === '.' ? '' : dir, name);
    if (regularFile(root, path)) return path;
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

const WORKFLOW = /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/;
const DOCKERFILE = /(?:^|\/)(?:Dockerfile|Containerfile)(?:\.[\w-]+)?$|\.Dockerfile$/;
const ENV_FILE = /(?:^|\/)\.env(?:\.(?!example$|sample$|template$|dist$)[\w-]+)?$/;
const SECRET_NAME = /(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)/i;

// CI workflows, container files, committed environment files and HTML pages: configuration
// mistakes a reader skims over. Each line is a lead under criteria.md's Security or Accessibility rows.
function checkConfig(file, text, out) {
  const lines = text.split(/\r?\n/);
  if (WORKFLOW.test(file)) {
    if (/^\s*pull_request_target\s*:/m.test(text) || /^on:\s*\[?[^\n]*pull_request_target/m.test(text)) {
      out.ci.push(`${file}: runs on pull_request_target${/actions\/checkout/.test(text) ? ' and checks out code' : ''}${/github\.event\.pull_request\.head/.test(text) ? ' from the pull request head' : ''}`);
    }
    if (!/^\s*permissions\s*:/m.test(text)) out.ci.push(`${file}: no permissions block, the token gets the repository default`);
    lines.forEach((line, i) => {
      if (/^\s*permissions\s*:\s*write-all\b/.test(line)) out.ci.push(`${file}:${i + 1} permissions: write-all`);
      const uses = /^\s*-?\s*uses\s*:\s*['"]?([^'"\s#]+)/.exec(line)?.[1];
      if (uses && !uses.startsWith('./') && !uses.startsWith('docker://') && !/@[0-9a-f]{40}$/.test(uses)) {
        out.ci.push(`${file}:${i + 1} ${uses} is not pinned to a commit SHA`);
      }
      const expr = /\$\{\{\s*(github\.(?:event\.(?:issue|pull_request|comment|review|head_commit|commits|discussion)\S*\.(?:title|body|message|ref|label|name|email)|head_ref)\S*)\s*\}\}/.exec(line);
      if (expr) out.ci.push(`${file}:${i + 1} untrusted \`${expr[1]}\` expanded in the workflow`);
    });
  } else if (DOCKERFILE.test(file)) {
    const stages = new Set();
    let user = null;
    lines.forEach((line, i) => {
      const from = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
      if (from) {
        const image = from[1];
        if (from[2]) stages.add(from[2].toLowerCase());
        const tag = /^[^@]*?(?::([^/:@]+))?(?:@.+)?$/.exec(image)?.[1];
        if (image !== 'scratch' && !stages.has(image.toLowerCase()) && !image.includes('@') && (!tag || tag === 'latest')) {
          out.containers.push(`${file}:${i + 1} FROM ${image} uses ${tag ? 'the latest tag' : 'no tag'}`);
        }
        user = null; // each stage starts as root
      }
      const u = /^\s*USER\s+(\S+)/i.exec(line);
      if (u) user = u[1];
      const env = /^\s*(?:ENV|ARG)\s+([A-Za-z_][\w]*)\s*[= ]\s*(\S+)/i.exec(line);
      if (env && SECRET_NAME.test(env[1]) && !/^\$/.test(env[2])) out.containers.push(`${file}:${i + 1} ${env[1]} gets a value in the image`);
    });
    if (!user || /^(?:root|0)(?::|$)/.test(user)) out.containers.push(`${file}: the final stage runs as root (no USER)`);
  } else if (ENV_FILE.test(file)) {
    out.envFiles.push(`${file}: environment file in the target`);
  } else if (/\.html?$/i.test(file) && /<html[\s>]/i.test(text)) {
    if (!/<title[^>]*>\s*\S[\s\S]*?<\/title>/i.test(text)) out.pages.push(`${file}: no page title`);
    if (!/<html[^>]*\slang\s*=\s*["']?\w/i.test(text)) out.pages.push(`${file}: no page language`);
  }
}

const CODE = /\.(?:c?js|mjs|jsx|tsx?|py|go|rb|java|cs|php|rs|kt|swift)$/;
const TEST = /(?:^|\/)(?:tests?|__tests__|spec)\/|[._-](?:test|spec)\.[a-z]+$|(?:^|\/)test_[^/]+\.py$|_test\.(?:go|py)$/;
const VENDOR = /(?:^|\/)(?:vendor|third[_-]party|external)\/|\.min\.(?:js|css)$/;

async function scan(root, prefixes, { maxHistoryBytes = MAX_HISTORY_BYTES } = {}) {
  const inGit = git(root, ['rev-parse', '--is-inside-work-tree']) !== null;
  const all = listFiles(root, inGit);
  const files = prefixes.length ? all.filter((f) => prefixes.some((p) => f === p || f.startsWith(p.replace(/\/?$/, '/')))) : all;
  const fileSet = new Set(all);
  const out = { secrets: [], history: [], commands: [], links: [], deps: [], ci: [], containers: [], envFiles: [], pages: [], vendored: [], unread: [], untested: [] };
  const current = new Set();
  const texts = new Map();
  for (const file of files) {
    // One unreadable file must not cost the agent every other lead.
    try {
      const { text, skip } = readText(root, file);
      if (skip) { out.unread.push(`${file} (${skip})`); continue; }
      // Only test texts are needed later; keeping every file would hold the whole tree in memory.
      if (TEST.test(file)) texts.set(file, text);
      text.split(/\r?\n/).forEach((line, i) => {
        for (const hit of findSecrets(line)) {
          current.add(hit.value);
          out.secrets.push(`${file}:${i + 1} ${hit.type} (${hit.masked})`);
        }
      });
      if (/\.(?:md|markdown)$/i.test(file)) checkDocs(root, file, text, out);
      checkDependencies(root, file, text, fileSet, out);
      checkConfig(file, text, out);
      if (VENDOR.test(file) || (/\.(?:c?js|css)$/.test(file) && text.split('\n', 20).some((l) => l.length > 1000))) out.vendored.push(file);
    } catch (error) {
      out.unread.push(`${file} (${error.code || error.message})`);
    }
  }
  let historyNote = null;
  if (inGit) {
    const { hits, error, stoppedAt } = await historySecrets(root, prefixes, current, maxHistoryBytes);
    // A secret seen before the stop may have been added in an older commit than the one shown.
    for (const h of hits) out.history.push(`${h.file} ${h.type} (${h.masked}), added in ${h.commit}${stoppedAt !== null ? ' or earlier' : ''}, absent from the current tree`);
    const total = Number(git(root, ['rev-list', '--all', '--count']));
    if (error) historyNote = `incomplete: git log failed (${error}); check the history by hand`;
    else if (stoppedAt !== null) historyNote = `stopped after ${Math.round(maxHistoryBytes / 1048576)} MB of patches, at commit ${stoppedAt || 'the first'}; older history not checked`;
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
  if (lines.length > MAX_LINES) {
    // Name the files holding the rest: a prefix cannot narrow a single file with many leads, so the agent reads it.
    const perFile = new Map();
    for (const l of lines.slice(MAX_LINES)) {
      const file = /^[^\s:]+/.exec(l)?.[0] ?? l;
      perFile.set(file, (perFile.get(file) ?? 0) + 1);
    }
    const names = [...perFile].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([f, n]) => `${sanitize(f)} (${n})`);
    shown.push(`- … ${lines.length - MAX_LINES} more, in ${names.join(', ')}${perFile.size > 10 ? `, and ${perFile.size - 10} other files` : ''}: read those files, or rerun with narrower path prefixes`);
  }
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
    section('CI workflows', out.ci),
    section('Container files', out.containers),
    section('Environment files', out.envFiles),
    section('HTML pages', out.pages),
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
