#!/usr/bin/env node
// Score a report from a public benchmark case (acceptance/public.md) against the benchmark's published answers.
// Usage: node acceptance/score-public.js <bench> <report.md>...   bench: one of the keys of BENCH below.
// An expected item is found when one active finding matches all of its patterns, in its title first, else in its bullets.
// The benchmark case also counts false alarms: a finding of the tested category on a servlet that is not vulnerable.
// shortcut: keyword matching, judge every miss and every unmatched finding by hand before quoting a score.
'use strict';
const fs = require('fs');

const ACTIVE = ['New', 'Still present', 'Reappeared', 'Not reverified'];
// Where the answers are published. An agent with web access can find them (a Codex run compared hospital.csv with HoloClean's clean copy).
const ANSWERS = /holoclean|hospital_clean|clean\.csv|expectedresults|pwning\.owasp-juice|demos\/bad\/\w+\/reports|leaky-meta/i;
const any = (...words) => new RegExp(words.join('|'), 'i');

// [ref, patterns that must all match one active finding, what the benchmark documents]
const BENCH = {
  nodegoat: [
    ['A1-eval', [any('contributions', 'eval'), any('eval', 'inject', 'code execution')], 'eval() on preTax/afterTax/roth'],
    ['A1-nosql', [any('allocations?', '\\$where', 'threshold'), any('nosql', '\\$where', 'inject', 'mongo\\w* expression')], '$where built from threshold'],
    ['A4-idor', [any('allocations?'), any('userId', 'IDOR', 'direct object', 'other users', 'another user', 'any user', 'ownership')], 'userId taken from the URL'],
    ['A7-benefits', [any('benefits'), any('admin', 'authori', 'access control')], 'benefits routes without isAdmin'],
    ['A2-plaintext', [any('password'), any('plain ?text', 'clear ?text', 'unhashed', 'not hashed', 'hash')], 'passwords stored in clear'],
    ['A2-policy', [any('password', 'login', 'brute'), any('complex', 'policy', 'strength', 'weak', 'PASS_RE', 'lockout', 'brute', 'rate.?limit')], 'weak password rule, no lockout'],
    ['A2-fixation', [any('session'), any('fixation', 'regenerat')], 'session id not regenerated at login'],
    ['A3-xss', [any('autoescape', 'automatic escaping', 'XSS', 'cross-site scripting')], 'swig autoescape off'],
    ['A10-redirect', [any('redirect'), any('learn', 'open', 'unvalidated')], '/learn?url= redirect'],
    ['SSRF', [any('research', 'needle', 'SSRF', 'server-side request')], 'research route fetches a user URL'],
    ['A8-csrf', [any('CSRF', 'csurf', 'cross-site request')], 'csrf middleware disabled'],
    ['A6-ssn', [any('ssn', 'social security', 'dob', 'date of birth'), any('plain', 'encrypt', 'clear')], 'SSN and DOB stored unencrypted'],
    ['A5-headers', [any('helmet', 'security headers?', 'httpOnly', 'secure flag', 'cookie flags?', 'X-Frame', 'CSP')], 'helmet and cookie flags disabled'],
    ['secrets', [any('cookieSecret', 'cookie secret', 'session secret', 'cryptoKey', 'crypto key', 'hard-?coded')], 'secrets in config/env/all.js'],
    ['A9-deps', [any('marked', 'dependenc', 'outdated', 'vulnerable (package|version|librar)')], 'vulnerable components'],
  ],
  juiceshop: [
    ['login-sqli', [any('login'), any('SQL')], 'routes/login.ts'],
    ['search-sqli', [any('search'), any('SQL')], 'routes/search.ts'],
    ['review-nosql', [any('updateProductReviews', 'review'), any('NoSQL', '\\$ne', 'inject', 'any review', 'multi', 'other users', 'ownership', 'author')], 'routes/updateProductReviews.ts'],
    ['b2b-rce', [any('b2bOrder', 'orderLinesData', 'b2b')], 'routes/b2bOrder.ts'],
    ['xxe', [any('\\bXXE\\b', 'XML external', 'libxml', 'external entit', 'noent')], 'routes/fileUpload.ts'],
    ['zip-slip', [any('zip', 'unzip'), any('slip', 'traversal', 'path')], 'routes/fileUpload.ts'],
    ['ssrf', [any('profileImageUrlUpload', 'image URL', 'SSRF', 'server-side request')], 'routes/profileImageUrlUpload.ts'],
    ['null-byte', [any('fileServer', 'null byte', 'poison', '%00')], 'routes/fileServer.ts'],
    ['basket-idor', [any('basket'), any('IDOR', 'other users', 'another user', 'bid', 'direct object', 'ownership', 'belongs?', 'any (user|basket)')], 'routes/basket.ts'],
    ['forged-review', [any('createProductReviews', 'author'), any('forg', 'spoof', 'author', 'impersonat')], 'routes/createProductReviews.ts'],
    ['redirect', [any('redirect'), any('allow ?list', 'includes', 'bypass', 'open')], 'routes/redirect.ts'],
    ['lfi', [any('dataErasure', 'layout'), any('file', 'LFI', 'LFR', 'path', 'traversal', 'read')], 'routes/dataErasure.ts'],
    ['ssti', [any('userProfile'), any('eval', 'SSTI', 'template', 'code')], 'routes/userProfile.ts'],
    ['prompt', [any('chat', 'chatbot', 'LLM'), any('prompt')], 'routes/chat.ts'],
  ],
  leaky: [
    '.npmrc', '.dockercfg', 'misc-keys/cert-key.pem', 'misc-keys/putty-example.ppk', '.ssh/id_rsa', 'db/dump.sql',
    'cloud/.credentials', 'cloud/.s3cfg', 'cloud/.tugboat', 'cloud/heroku.json', 'wp-config.php', '.htpasswd',
    'public_html/config.php', 'web/var/www/.env', '.git-credentials', '.bashrc', '.bash_profile', 'db/robomongo.json',
    'db/mongoid.yml', 'web/js/salesforce.js', '.netrc', 'hub', 'filezilla/filezilla.xml', 'filezilla/recentservers.xml',
    '.docker/config.json', 'config', 'db/.pgpass', 'proftpdpasswd', 'ventrilo_srv.ini', 'etc/shadow',
    'db/dbeaver-data-sources.xml', '.esmtprc', '.mozilla/firefox/logins.json', 'web/django/settings.py',
    'web/ruby/secrets.yml', 'ruby/config/master.key', 'deployment-config.json', '.ftpconfig', '.remote-sync.json',
    '.vscode/sftp.json', 'sftp-config.json', '.idea/WebServers.xml', 'high-entropy-misc.txt',
  ].map((p) => [p, [path(p)], 'README table of leaked files']),
  actions: [
    ['log-secret', [any('secret-in-build-log', 'private key', 'build log'), any('log', 'echo', 'print')], 'secret-in-build-log.yml echoes the key'],
    ['toctou', [any('toc-?tou', 'label', 'gh pr checkout', 'pull_request_target')], 'toc-tou.yml checks out the PR after approval'],
    ['changed-files', [any('changed-files', 'tj-actions')], 'tj-actions/changed-files v35/v40 (GHSL-2023-271, CVE-2025-30066)'],
    ['unpinned', [any('pin', 'mutable', 'tag', 'SHA')], 'third-party actions on mutable tags'],
    ['malicious-dep', [any('malware', 'exfiltrat', 'malicious', 'file:\\.\\.', 'local (package|dependency)', 'simulator')], 'publish.yml installs a malware simulator'],
  ],
  goof: [
    ...['mongoose', '\\bst\\b', '\\bms\\b', 'marked'].map((p) => [p, [any(p)], 'documented exploitable package']),
    ...['lodash', 'adm-zip', 'dustjs', '\\bejs\\b', 'express-fileupload', 'moment'].map((p) => [p, [any(p)], 'known advisory on the pinned version']),
    ['latest', [any('latest', 'unpinned', 'floating')], 'method-override and morgan on "latest"'],
    ['base-image', [any('node:6', 'base image', 'Dockerfile')], 'Dockerfile FROM node:6-stretch'],
  ],
  terragoat: [
    ['keys', [any('AKIA', 'access.?key', 'secret.?key', 'credential')], 'providers.tf, lambda.tf, ec2.tf'],
    ['rds-public', [any('rds', 'database', 'db-app', 'publicly_accessible'), any('public', 'encrypt')], 'db-app.tf'],
    ['open-sg', [any('0\\.0\\.0\\.0/0', 'security group', 'ingress', 'SSH', 'port 22')], 'ec2.tf, db-app.tf'],
    ['ebs', [any('EBS', 'volume'), any('encrypt')], 'ec2.tf'],
    ['s3', [any('S3', 'bucket'), any('encrypt', 'versioning', 'logging', 'public')], 's3.tf'],
    ['iam', [any('IAM', 'policy', 'polic'), any('\\*', 'wildcard', 'admin', 'least privilege', 'broad')], 'iam.tf, db-app.tf'],
    ['es', [any('elasticsearch', 'es\\.tf', 'opensearch')], 'es.tf'],
    ['ecr', [any('ECR'), any('mutab', 'scan')], 'ecr.tf'],
    ['neptune', [any('neptune')], 'neptune.tf'],
    ['eks', [any('EKS', 'eks\\.tf')], 'eks.tf'],
    ['user-data', [any('user_data', 'user data', 'DB_PASSWORD', 'wp-config')], 'ec2.tf, db-app.tf secrets in user data'],
    ['kms', [any('KMS', 'rotation')], 'kms.tf'],
  ],
  quixbugs: [
    'bitcount', 'breadth_first_search', 'bucketsort', 'depth_first_search', 'detect_cycle', 'find_first_in_sorted',
    'find_in_sorted', 'flatten', 'gcd', 'get_factors', 'hanoi', 'is_valid_parenthesization', 'kheapsort', 'knapsack',
    'kth', 'lcs_length', 'levenshtein', 'lis', 'longest_common_subsequence', 'max_sublist_sum', 'mergesort',
    'minimum_spanning_tree', 'next_palindrome', 'next_permutation', 'pascal', 'possible_change', 'powerset',
    'quicksort', 'reverse_linked_list', 'rpn_eval', 'shortest_path_length', 'shortest_path_lengths',
    'shortest_paths', 'shunting_yard', 'sieve', 'sqrt', 'subsequences', 'to_base', 'topological_ordering', 'wrap',
  ].map((p) => [p, [new RegExp(`\\b${p}(\\.py)?\\b`)], 'one-line defect, fixed in correct_python_programs/']),
  hospital: [
    ['typos', [any("'x'", '"x"', '`x`', '\\bx\\b', 'typo', 'misspel', 'corrupt', 'substitut', 'character')], "about 509 cells with one letter replaced by 'x'"],
    ['count', [/\b(4[6-9]\d|5[0-5]\d) (cells|values)\b/i], 'a count within 10% of the 509 corrupted cells'],
    ['dependencies', [any('provider', 'depend', 'same (hospital|provider|entity)', 'redundant')], 'values that disagree with the other rows of the same hospital or measure'],
  ],
  // WCAG 2 level A and AA criteria that the W3C evaluation reports mark as failed on the four "before" pages (4.1.1 is obsolete).
  bad: [
    ['1.1.1', 'alt(ernative)? text', 'text alternative', '\\balt\\b'], ['1.3.1', 'info and relationships', 'table headers?', 'fieldset', 'legend', 'heading markup'],
    ['1.3.2', 'meaningful sequence', 'reading order', 'layout table'], ['1.4.1', 'use of colou?r', 'colou?r alone', 'only by colou?r'],
    ['1.4.3', 'contrast'], ['1.4.5', 'images? of text', 'text in images?'], ['2.1.1', 'keyboard'],
    ['2.4.1', 'skip', 'bypass blocks'], ['2.4.2', 'page title', '<title>'], ['2.4.3', 'focus order'],
    ['2.4.4', 'link (text|purpose)', 'click here', 'read more'], ['2.4.6', 'headings? and labels', 'descriptive (heading|label)'],
    ['2.4.7', 'focus visible', 'visible focus', 'focus indicator', 'outline'], ['3.1.1', 'language of (the )?page', '\\blang\\b'],
    ['3.2.1', 'on focus'], ['3.2.2', 'on input', 'onchange', 'context change', 'auto-?submit'], ['3.2.4', 'consistent identification'],
    ['3.3.2', 'labels or instructions', 'instructions', 'required field'], ['4.1.2', 'name,? role,? value', 'accessible name'],
  ].map(([sc, ...w]) => [sc, [any(sc.replace(/\./g, '\\.'), ...w)], 'failed in the W3C report']),
  nplus: [
    ['n+1', [any('comments', 'reviews', 'N ?\\+ ?1', 'per user', 'each user'), any('quer', 'N ?\\+ ?1')], 'app/views/users/index.html.haml'],
    ['unbounded', [any('User\\.all', 'all users', 'unbounded', 'paginat', 'every (user|record)')], 'users#index loads every record'],
    ['indexes', [any('index'), any('user_id', 'foreign key')], 'db/schema.rb has no index on user_id'],
  ],
};

// One real and one false vulnerability per category, from expectedresults-1.2.csv. As in the OWASP scorecard,
// only a finding of the servlet's own category counts: its title must name the category.
const CATEGORY = {
  cmdi: any('command', 'shell', 'operating.system', 'ProcessBuilder', 'Runtime'), crypto: any('cipher', 'encrypt', '\\bDES\\b', '\\bAES\\b', 'crypto'),
  hash: any('hash', 'digest', 'MD5', 'SHA'), ldapi: any('LDAP'), pathtraver: any('path', 'travers', 'director', 'file'),
  securecookie: any('cookie'), sqli: any('SQL', 'JDBC', 'query'), trustbound: any('trust', 'session attribute'),
  weakrand: any('random', 'predictable', 'token'), xpathi: any('XPath'), xss: any('XSS', 'HTML', 'script', 'cross-site'),
};
const SERVLETS = {
  '00001': ['r', 'pathtraver'], '00003': ['r', 'hash'], '00004': ['r', 'trustbound'], '00005': ['r', 'crypto'], '00006': ['r', 'cmdi'],
  '00008': ['r', 'sqli'], '00012': ['r', 'ldapi'], '00013': ['r', 'xss'], '00023': ['r', 'weakrand'], '00087': ['r', 'securecookie'], '00207': ['r', 'xpathi'],
  '00009': ['f', 'hash'], '00010': ['f', 'weakrand'], '00016': ['f', 'securecookie'], '00051': ['f', 'cmdi'], '00052': ['f', 'sqli'], '00054': ['f', 'crypto'],
  '00063': ['f', 'pathtraver'], '00097': ['f', 'trustbound'], '00116': ['f', 'xpathi'], '00138': ['f', 'ldapi'], '00147': ['f', 'xss'],
};

function path(p) {
  const e = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A short, common name (config, hub) must be the whole path, quoted or linked, to count.
  return p.includes('/') || p.includes('.') ? new RegExp(`(^|[^\\w.-])${e}\\b`) : new RegExp(`[\`\\[(/]${e}[\`\\])#]`);
}

function findings(text) {
  const out = [];
  let cur = null;
  for (const l of text.split(/\r?\n/)) {
    if (/^#{2,3} /.test(l)) {
      cur = null;
      const f = l.slice(4).split(' · ').map((s) => s.trim());
      if (l.startsWith('### ') && f.length >= 5) out.push(cur = { id: f[0], priority: f[1], status: f[4], title: '', text: l });
    } else if (cur) {
      // The Correction often names a safe example ("as BenchmarkTest00054 does"): it is not evidence of the defect.
      if (/^- \*\*/.test(l)) cur.inFix = l.startsWith('- **Correction**');
      if (!cur.inFix) cur.text += `\n${l}`;
      if (!cur.title && /^\*\*.+\*\*$/.test(l.trim())) cur.title = l;
    }
  }
  return out.filter((f) => ACTIVE.includes(f.status));
}

function score(bench, file) {
  const all = findings(fs.readFileSync(file, 'utf8'));
  if (bench === 'benchmark') {
    return Object.entries(SERVLETS).map(([n, [want, cat]]) => {
      const hit = all.find((f) => f.priority !== 'Informational' && f.text.includes(`BenchmarkTest${n}`) && CATEGORY[cat].test(f.title));
      return { ref: `BenchmarkTest${n}`, want: want === 'r' ? 'vulnerable' : 'safe', id: hit ? hit.id : '-', priority: hit ? hit.priority : '-', ok: !!hit === (want === 'r') };
    });
  }
  if (!BENCH[bench]) throw new Error(`unknown bench "${bench}", expected one of: benchmark, ${Object.keys(BENCH).join(', ')}`);
  const rows = BENCH[bench].map(([ref, pats, want]) => {
    // Prefer a finding whose title matches, so a passing mention in another finding does not take the credit.
    const hit = all.find((f) => pats.every((p) => p.test(f.title))) || all.find((f) => pats.every((p) => p.test(f.text)));
    return { ref, want, id: hit ? hit.id : '-', priority: hit ? hit.priority : 'missed', ok: !!hit };
  });
  const used = new Set(rows.map((r) => r.id));
  rows.unmatched = all.filter((f) => !used.has(f.id)).map((f) => `${f.id} ${f.priority}`);
  return rows;
}

if (require.main === module) {
  const [bench, ...files] = process.argv.slice(2);
  if (!bench || !files.length) { console.error('usage: node acceptance/score-public.js <bench> <report.md>...'); process.exit(2); }
  for (const file of files) {
    const rows = score(bench, file);
    if (bench === 'benchmark') {
      const tp = rows.filter((r) => r.want === 'vulnerable' && r.ok).length, fp = rows.filter((r) => r.want === 'safe' && !r.ok).length;
      console.log(`TPR ${tp}/11, FPR ${fp}/11, Benchmark score (TPR-FPR) ${Math.round((tp - fp) / 11 * 100)}% ${file}`);
    } else {
      console.log(`${rows.filter((r) => r.ok).length}/${rows.length} ${file}`);
    }
    for (const r of rows) console.log(`  ${r.ok ? 'ok ' : 'BAD'} ${r.ref.padEnd(28)} ${r.id.padEnd(8)} ${r.priority.padEnd(13)} ${r.want}`);
    if (rows.unmatched && rows.unmatched.length) console.log(`  unmatched active findings, judge by hand: ${rows.unmatched.join(', ')}`);
    if (ANSWERS.test(fs.readFileSync(file, 'utf8'))) console.log('  WARNING: the report cites a published answer key; if it used it, the run is not blind');
  }
}

module.exports = { score, BENCH };
