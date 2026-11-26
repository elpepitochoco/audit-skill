#!/usr/bin/env node
// Score a case 1 report on the billing fixture: find each planted defect by keywords in the
// finding titles and check its priority against the accepted range in acceptance/README.md.
// Usage: node acceptance/score-case1.js <report.md>...   A merged finding can match several defects.
// Exit code 1 if any defect is BAD. D1-D11 need an active finding; D9 needs a Planned later entry about amount validation.
// shortcut: keyword matching on titles, judge misses by hand before concluding a defect is absent.
'use strict';
const fs = require('fs');

const ACTIVE = ['New', 'Still present', 'Reappeared', 'Not reverified'];
const D9 = /amount|validat/i;

const DEFECTS = [
  ['D1', /export/i, /organi[sz]ation|tenant|every|all /i, ['Critical', 'High']],
  ['D2', /delet/i, /admin|authori|permission|any user|role check|access/i, ['Critical', 'High']],
  ['D3', /\b(?:keys?|credentials?|secrets?)\b/i, /source|commit|hard-?coded|config|embedded|tracked|git|repositor/i, ['Critical', 'High']],
  ['D4', /\b(?:keys?|credentials?|secrets?)\b/i, /\b(?:log(?:s|ged|ging)?|print\w*|console|output|stdout)\b/i, ['Critical', 'High']],
  ['D5', /delet/i, /trace|audit|\blog(?:s|ged|ging)?\b|record|event/i, ['Medium', 'High']],
  ['D6', /\b(?:un)?test(?:s|ed|ing)?\b/i, /./, ['Medium', 'Low']],
  ['D7', /setRole|role/i, /crash|unknown|missing|exist|TypeError|target/i, ['Low', 'Medium']],
  ['D8', /\bstart(?:s|up|ing)?\b/i, /./, ['Low', 'Medium']],
  ['D10', /\blog(?:s|ged|ging)?\b/i, /contradict|conflict|opposite|permission/i, ['Medium', 'Low']],
  ['D11', /role|user admin|administrator/i, /organi[sz]ation|tenant|across|other/i, ['High', 'Medium']],
];

function findings(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (!l.startsWith('### ')) return;
    const f = l.slice(4).split(' · ').map((s) => s.trim());
    const title = (lines.slice(i + 1, i + 4).find((t) => /^\*\*.+\*\*$/.test(t.trim())) || '').replace(/\*\*/g, '');
    out.push({ id: f[0], priority: f[1], status: f[4], title });
  });
  return out;
}

function score(file) {
  const all = findings(fs.readFileSync(file, 'utf8'));
  const rows = DEFECTS.map(([ref, a, b, range]) => {
    // D4 must not match a finding that is only about the committed key, and vice versa for D3.
    const hits = all.filter((f) => ACTIVE.includes(f.status) && a.test(f.title) && b.test(f.title)
      && !(ref === 'D5' && /key/i.test(f.title)) && !(ref === 'D3' && /log/i.test(f.title)) && !(ref === 'D4' && /document|guide/i.test(f.title)) && !(ref === 'D2' && /role/i.test(f.title) && !/delet/i.test(f.title)));
    const best = hits.find((f) => range.includes(f.priority)) || hits[0];
    return { ref, id: best ? best.id : '-', priority: best ? best.priority : 'missed', ok: !!best && range.includes(best.priority), range };
  });
  const d9 = all.find((f) => f.status === 'Planned later' && D9.test(f.title));
  rows.push({ ref: 'D9', id: d9 ? d9.id : '-', priority: d9 ? 'Planned later' : 'missed', ok: !!d9, range: ['Planned later'] });
  return rows;
}

if (require.main === module) {
  for (const file of process.argv.slice(2)) {
    const rows = score(file);
    if (rows.some((r) => !r.ok)) process.exitCode = 1;
    console.log(`${rows.filter((r) => r.ok).length}/${rows.length} ${file}`);
    for (const r of rows) console.log(`  ${r.ok ? 'ok ' : 'BAD'} ${r.ref.padEnd(3)} ${r.id.padEnd(7)} ${r.priority.padEnd(13)} expected ${r.range.join(' or ')}`);
  }
}

module.exports = { score };
