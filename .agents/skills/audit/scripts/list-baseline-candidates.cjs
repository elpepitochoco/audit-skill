'use strict';

const { lstatSync, readdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { parseReportName, parseReportDate, SCOPE_SLUG } = require('./report-name.cjs');
const { reportLines, bulletDetails } = require('./report-markdown.cjs');

function readInstant(file, timestamp) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const { visible, structural } = reportLines(text);
  const firstSection = structural.findIndex((line) => line.startsWith('## '));
  const headerEnd = firstSection < 0 ? structural.length : firstSection;
  const label = '- **Date**';
  for (let i = 0; i < headerEnd; i++) {
    if (!structural[i].startsWith(label)) continue;
    const value = bulletDetails(structural[i].slice(label.length), visible, i, headerEnd);
    const date = parseReportDate(value);
    return date?.timestamp === timestamp ? date.instant : null;
  }
  return null;
}

function listCandidates(target, scope) {
  if (!SCOPE_SLUG.test(scope)) {
    throw new Error('Pass the kebab-case scope slug from the intended report filename.');
  }

  const directory = resolve(target, 'audits');
  const stats = lstatSync(directory, { throwIfNoEntry: false });
  if (!stats) return [];
  if (!stats.isDirectory()) throw new Error('The audits path must be a real directory within the target.');

  const scopePattern = new RegExp(`^${scope}(?:-([1-9]\\d*))?$`);
  const candidates = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const parsed = parseReportName(entry.name);
    if (!parsed) continue;
    const match = scopePattern.exec(parsed.scopeAndSuffix);
    if (!match || match[1] === '1') continue;
    candidates.push({
      name: entry.name,
      timestamp: parsed.timestamp,
      sequence: BigInt(match[1] ?? '1'),
      instant: readInstant(join(directory, entry.name), parsed.timestamp),
    });
  }
  const dated = candidates.every(({ instant }) => instant !== null);
  candidates.sort((a, b) => (dated ? b.instant - a.instant : 0)
    || b.timestamp.localeCompare(a.timestamp) || Number(b.sequence - a.sequence));
  return candidates.map(({ name }) => name);
}

try {
  const [target, scope] = process.argv.slice(2);
  if (!target || !scope) throw new Error('Usage: node list-baseline-candidates.cjs <target-root> <scope-slug>');
  for (const name of listCandidates(target, scope)) console.log(name);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
