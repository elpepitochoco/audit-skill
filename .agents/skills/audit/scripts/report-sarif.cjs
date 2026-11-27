'use strict';

// Converts an audit report to SARIF 2.1.0 for CI and GitHub code scanning. Active findings become
// results; Planned later closures become suppressed results; Fixed entries are left out.
// Usage: node report-sarif.cjs <report.md> [<output.sarif>]   (stdout without an output path)

const { readFileSync, writeFileSync } = require('node:fs');
const { basename } = require('node:path');
const { findings, sections } = require('./baseline-delta.cjs');

const LEVELS = { Critical: 'error', High: 'error', Medium: 'warning', Low: 'note', Informational: 'note' };
const SEVERITY = { Critical: '9.5', High: '8.0', Medium: '5.0', Low: '2.0', Informational: '0.0' };

const ruleId = (pair = '') => pair.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'finding';

// The first evidence link from audits/ (../path#L12) or backticked locator (`path:12`), in the Observed
// bullet first. A Markdown link target is already URI-encoded, so it is kept as written.
function evidence(block) {
  const link = /\]\(\.\.\/([^)#\s]+)(?:#L(\d+))?/.exec(block);
  const tick = /`([\w.-]+(?:\/[\w.-]+)*\.\w+)(?::(\d+))?`/.exec(block);
  const [, uri, line] = link ?? tick ?? [];
  return uri ? { uri, line } : null;
}

// GitHub code scanning rejects a result with no location: one with no cited file points to its heading in the report.
function location(f, text, reportUri) {
  const observed = /^- \*\*(?:Observed|Carried)\*\*.*(?:\n(?!- \*\*).*)*/m.exec(f.body)?.[0] ?? '';
  const found = evidence(observed) ?? evidence(f.body);
  const lineOf = () => text.split(/\r?\n/).findIndex((l) => l.startsWith(`### ${f.id} ·`)) + 1;
  const { uri, line } = found ?? { uri: reportUri, line: lineOf() || undefined };
  const region = line ? { region: { startLine: Number(line) } } : {};
  return [{ physicalLocation: { artifactLocation: { uri, uriBaseId: '%SRCROOT%' }, ...region } }];
}

function toSarif(text, reportUri = 'audits/report.md') {
  const parts = sections(text);
  const entries = [
    ...findings(parts.Findings).filter((f) => f.status !== 'Fixed'),
    ...findings(parts['Planned later']).map((f) => ({ ...f, planned: true })),
  ];
  const rules = new Map();
  const results = entries.map((f) => {
    const id = ruleId(f.pair);
    if (!rules.has(id)) rules.set(id, { id, name: f.pair, shortDescription: { text: f.pair } });
    const result = {
      ruleId: id,
      level: LEVELS[f.priority] ?? 'note',
      message: { text: `${f.id}: ${f.title ?? f.pair}` },
      locations: location(f, text, reportUri),
      partialFingerprints: { auditFindingId: f.id },
      properties: { priority: f.priority, certainty: f.certainty, status: f.status, 'security-severity': SEVERITY[f.priority] },
    };
    if (f.planned) result.suppressions = [{ kind: 'external', justification: 'Planned later by an explicit decision recorded in the report.' }];
    return result;
  });
  const version = /Skill version (\d+\.\d+\.\d+)/i.exec(text)?.[1];
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'audit skill', ...(version ? { version } : {}), rules: [...rules.values()] } }, results }],
  };
}

if (require.main === module) {
  try {
    const [report, output] = process.argv.slice(2);
    if (!report) throw new Error('Usage: node report-sarif.cjs <report.md> [<output.sarif>]');
    const reportUri = `audits/${encodeURIComponent(basename(report))}`;
    const json = `${JSON.stringify(toSarif(readFileSync(report, 'utf8'), reportUri), null, 2)}\n`;
    if (output) writeFileSync(output, json, { flag: 'wx' });
    else process.stdout.write(json);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { toSarif };
