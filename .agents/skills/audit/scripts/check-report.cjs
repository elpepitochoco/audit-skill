#!/usr/bin/env node
// Mechanical format check of audit reports against references/report.md and criteria.md.
// Usage: node check-report.cjs [--json] [--forbid <regex>]... <report.md|folder>...
// Exit code 1 if any report has an error. Judgement (right findings, right priorities) stays manual.
'use strict';
const { isUtf8 } = require('node:buffer');
const fs = require('fs');
const path = require('path');
const { parseReportName, parseReportDate } = require('./report-name.cjs');
const { reportLines, bulletDetails } = require('./report-markdown.cjs');

const REFERENCES = path.join(__dirname, '..', 'references');
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
const STATUSES = ['New', 'Still present', 'Fixed', 'Not reverified', 'Reappeared', 'Planned later'];
const LABELS = ['Date', 'Branch / commit', 'Local changes', 'Scope', 'Criteria mode', 'Checks and references', 'Baseline'];
const CRITERIA_MODE = /^(\*\*|`)?(?:built-in grid|extended grid|supplied criteria only)\1(?=$|[ \t]*[.,:;(–—])/i;
const SECTIONS = ['Summary', 'Findings', 'Planned later', 'Changes since baseline', 'Coverage and limitations'];
const OPTIONAL = new Set(['Planned later', 'Changes since baseline']);
const FINDING_ID = /^([A-Z][A-Z0-9]*)-\d{2,}$/;
const TABLE_DELIMITER = /^:?-+:?$/;
const TABLE_BREAK = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|(?:[-+*]|1[.)])[ \t]|([-*_])(?:[ \t]*\1){2,}[ \t]*$)/;
const TRACE_HEADER = ['Requirement and source', 'Result', 'Observed or missing evidence', 'Finding'];
const TRACE_RESULTS = ['Met', 'Gap', 'To verify', 'Not applicable'];
const TRACE_HEADING = '### Requirements traceability';
const COVERAGE_SECTION = 'Coverage and limitations';

// Axis / sub-category pairs from the grid table in criteria.md.
const GRID = new Set(
  fs.readFileSync(path.join(REFERENCES, 'criteria.md'), 'utf8').split('\n')
    .map((l) => l.match(/^\| (Security|Quality|Documentation|Accessibility|Performance|Operability) \| ([^|]+?) \|/))
    .filter(Boolean).map((m) => `${m[1]} / ${m[2]}`),
);

function tableCells(line = '') {
  return line.trim().replace(/^\||(?<!\\)\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function continuesTable(line = '') {
  return Boolean(line.trim()) && !TABLE_BREAK.test(line);
}

function checkTraceability(lines, coverageStart, coverageEnd, findingsById, errors) {
  const headerText = TRACE_HEADER.join('|');
  const matchesHeader = (line) => line?.includes('|') && tableCells(line).join('|') === headerText;
  const headings = [];
  const tableHeaders = [];
  let misplaced = false;
  for (const [index, line] of lines.entries()) {
    const isHeading = line === TRACE_HEADING;
    const isTable = matchesHeader(line);
    if (!isHeading && !isTable) continue;
    if (index < coverageStart || index >= coverageEnd) {
      misplaced = true;
      continue;
    }
    if (isHeading) headings.push(index);
    if (isTable) tableHeaders.push(index);
  }
  if (misplaced) errors.push('Requirements traceability belongs in Coverage and limitations');
  if (headings.length > 1) errors.push('Report has more than one Requirements traceability subsection');
  if (tableHeaders.length > 1) errors.push('Report has more than one traceability table');
  const [heading] = headings;
  const header = heading === undefined
    ? tableHeaders[0]
    : lines.findIndex((line, index) => index > heading && index < coverageEnd && line.trim());
  if (heading === undefined && header === undefined) return;
  if (!matchesHeader(lines[header])) {
    errors.push('Requirements traceability table requires the four-column header');
    return;
  }

  const delimiters = tableCells(header + 1 < coverageEnd ? lines[header + 1] : undefined);
  if (delimiters.length !== TRACE_HEADER.length || delimiters.some((cell) => !TABLE_DELIMITER.test(cell))) {
    errors.push('Requirements traceability table has an invalid Markdown delimiter row');
  }
  let index = header + 2;
  const seenRequirements = new Set();
  for (; index < coverageEnd; index++) {
    const line = lines[index];
    if (!continuesTable(line)) break;
    const cells = tableCells(line);
    const where = `Requirements traceability row ${index - header - 1}`;
    const [requirement, result, evidence, findings] = cells;
    if (cells.length !== TRACE_HEADER.length || !requirement || !evidence || !TRACE_RESULTS.includes(result)) {
      errors.push(`${where} requires a source, a valid Result, and evidence in four columns`);
      continue;
    }
    if (seenRequirements.has(requirement)) errors.push(`${where} repeats the requirement and source`);
    seenRequirements.add(requirement);
    const openResult = result === 'Gap' || result === 'To verify';
    if (!findings) {
      if (openResult) errors.push(`${where}: ${result} row must cite a finding`);
      continue;
    }
    const linkedFindings = [];
    for (const citation of findings.split(',')) {
      const text = citation.trim();
      const link = /^\[([^\]]+)\]\(#([^)]+)\)$/.exec(text);
      const id = (link?.[1] ?? text).replace(/^`([^`]+)`$/, '$1');
      const finding = findingsById.get(id);
      if (!FINDING_ID.test(id)) errors.push(`${where}: expected a finding ID`);
      else if (!finding) errors.push(`${where}: unknown finding ID ${id}`);
      else if (link && !finding.anchors.includes(link[2])) {
        errors.push(`${where}: link target does not identify ${id}`);
      } else if (openResult && finding.status === 'Fixed') {
        errors.push(`${where}: ${result} row cites fixed finding ${id}`);
      } else {
        linkedFindings.push(finding);
      }
    }
    if (!linkedFindings.length) continue;
    if (result === 'Gap' && !linkedFindings.some(finding =>
      finding.certainty === 'Confirmed' && finding.status !== 'Not reverified'
    )) {
      errors.push(`${where}: Gap row requires a current confirmed finding`);
    }
    if (result === 'To verify' && !linkedFindings.some(finding =>
      finding.certainty === 'To verify' || finding.status === 'Not reverified'
    )) {
      errors.push(`${where}: To verify row requires a finding with an incomplete check`);
    }
  }
  if (index === header + 2) errors.push('Requirements traceability table has no requirement rows');
}

function check(file, forbid) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    return [`cannot read report: ${error.message}`];
  }
  return checkBytes(bytes, file, forbid);
}

function checkBytes(bytes, file, forbid = []) {
  const errors = [];
  if (!isUtf8(bytes)) errors.push('file is not valid UTF-8');
  const raw = bytes.toString('utf8');
  if (raw.charCodeAt(0) === 0xfeff) errors.push('file starts with a byte order mark');
  const text = raw.replace(/^﻿/, '');
  // Report forbidden matches before any diagnostic can quote the report text.
  const forbiddenMatches = forbid.flatMap((pattern, index) => {
    const matcher = pattern.global || pattern.sticky ? new RegExp(pattern) : pattern;
    return matcher.test(text) ? [`forbidden content matches pattern ${index + 1}`] : [];
  });
  if (forbiddenMatches.length) return errors.concat(forbiddenMatches);

  const { visible: sourceLines, structural: lines } = reportLines(text);
  const reportName = parseReportName(path.basename(file));
  if (!reportName) errors.push('file name does not match YYYY-MM-DD_HH-mm-ss-<scope>.md with a valid date and time');

  // Header labels: first bullets before the first "## ".
  const sectionNames = lines.map((line) => line.startsWith('## ') ? line.slice(3).trim() : undefined);
  const firstSection = sectionNames.findIndex((name) => name !== undefined);
  const headerEnd = firstSection < 0 ? lines.length : firstSection;
  const labels = [];
  let suppliedOnly = false;
  for (let i = 0; i < headerEnd; i++) {
    const field = /^- \*\*(.+?)\*\*(.*)$/.exec(lines[i]);
    if (!field) continue;
    const [, label, detail] = field;
    labels.push(label);
    if (!LABELS.includes(label)) continue;
    const value = bulletDetails(detail, sourceLines, i, headerEnd);
    if (!value) errors.push(`header field **${label}** is empty`);
    else if (label === 'Date') {
      const date = parseReportDate(value);
      if (!date) errors.push('Date must contain a valid local timestamp and UTC offset.');
      else {
        // The baseline lister still reads older reports without an offset; new reports must carry one.
        if (date.instant === null) errors.push('Date must end with a numeric UTC offset, for example +01:00.');
        if (reportName && date.timestamp !== reportName.timestamp) {
          errors.push('Date does not match the report filename timestamp.');
        }
      }
    } else if (label === 'Criteria mode') {
      if (!CRITERIA_MODE.test(value)) {
        errors.push('Criteria mode must start with built-in grid, extended grid or supplied criteria only.');
      }
      suppliedOnly = /^(\*\*|`)?supplied criteria only/i.test(value);
    }
  }
  if (labels.join('|') !== LABELS.join('|')) errors.push(`header labels are [${labels.join(', ')}], expected [${LABELS.join(', ')}]`);

  // Sections: exact names, required ones present, order respected.
  const sections = sectionNames.filter((name) => name !== undefined);
  const unknown = sections.filter((s) => !SECTIONS.includes(s));
  if (unknown.length) errors.push(`unexpected sections: ${unknown.join(', ')}`);
  for (const section of SECTIONS) {
    const occurrences = sections.filter((heading) => heading === section).length;
    if (occurrences === 0 && !OPTIONAL.has(section)) errors.push(`missing section: ${section}`);
    if (occurrences > 1) errors.push(`duplicate section: ${section}`);
  }
  const known = sections.filter((s) => SECTIONS.includes(s));
  if (known.some((s, i) => i && SECTIONS.indexOf(s) < SECTIONS.indexOf(known[i - 1]))) errors.push(`sections out of order: ${known.join(', ')}`);

  const sectionEnd = (start) => {
    const next = sectionNames.findIndex((section, index) => index > start && section !== undefined);
    return next < 0 ? lines.length : next;
  };
  const body = (name, content = lines) => {
    const i = sectionNames.indexOf(name);
    return i < 0 ? [] : content.slice(i + 1, sectionEnd(i));
  };
  const coverageHeading = sectionNames.indexOf(COVERAGE_SECTION);
  if (coverageHeading >= 0 && !body(COVERAGE_SECTION, sourceLines).some((line) => line.trim())) {
    errors.push('Coverage and limitations is empty');
  } else if (coverageHeading >= 0) {
    const coverage = body(COVERAGE_SECTION);
    for (const label of ['Files', suppliedOnly ? 'Criteria' : 'Sub-categories']) {
      if (!coverage.some((line) => line.startsWith(`- **${label}**`) && /\d/.test(line))) {
        errors.push(`Coverage and limitations needs a **${label}** bullet with counts`);
      }
    }
  }

  // Findings: heading format, grid pairs, unique IDs, required bullets.
  const findingsById = new Map();
  const newPrefixes = new Set();
  const carriedPrefixes = new Set();
  const counts = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
  let lowestActivePriority = -1;
  for (const section of ['Findings', 'Planned later']) {
    const part = body(section);
    const rawPart = body(section, sourceLines);
    const requiredLabels = ['Expected', 'Observed', 'Impact'];
    if (section === 'Planned later') requiredLabels.push('Decision');
    const headingIndices = [];
    for (const [index, line] of part.entries()) {
      if (line.startsWith('### ')) headingIndices.push(index);
    }
    headingIndices.forEach((i, position) => {
      const l = part[i];
      const f = l.slice(4).split(' · ').map((s) => s.trim());
      const where = `${section}: "${l.slice(4, 70)}"`;
      if (f.length !== 5) return errors.push(`${where} has ${f.length} fields, expected 5`);
      const [id, prio, pair, cert, status] = f;
      const identifier = FINDING_ID.exec(id);
      if (!identifier) {
        errors.push(`${where}: bad ID "${id}"`);
      } else if (status === 'New') {
        newPrefixes.add(identifier[1]);
      } else if (STATUSES.includes(status) && status !== 'Planned later') {
        carriedPrefixes.add(identifier[1]);
      }
      if (findingsById.has(id)) errors.push(`${where}: duplicate ID ${id}`);
      // Finding headings use a fixed vocabulary and punctuation.
      const headingAnchor = l.slice(4).trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').replaceAll(' ', '-');
      const stableAnchor = `finding-${id.toLowerCase()}`;
      const precedingAnchor = part[i - 2]?.trim() === `<a name="${stableAnchor}"></a>` && part[i - 1] === '';
      const anchors = precedingAnchor ? [headingAnchor, stableAnchor] : [headingAnchor];
      findingsById.set(id, { anchors, status, certainty: cert });
      const priorityIndex = PRIORITIES.indexOf(prio);
      if (priorityIndex < 0) errors.push(`${where}: bad priority "${prio}"`);
      const criterionPair = suppliedOnly && /^Criteria \/ \S/.test(pair);
      if (!GRID.has(pair) && !criterionPair) {
        errors.push(`${where}: "${pair}" is not an axis / sub-category of the grid${suppliedOnly ? ' or Criteria / <criterion>' : ''}`);
      }
      if (!['Confirmed', 'To verify'].includes(cert)) errors.push(`${where}: bad certainty "${cert}"`);
      if (!STATUSES.includes(status)) errors.push(`${where}: bad status "${status}"`);
      if ((section === 'Planned later') !== (status === 'Planned later')) errors.push(`${where}: status ${status} in section ${section}`);
      const end = headingIndices[position + 1] ?? part.length;
      const block = part.slice(i + 1, end);
      const title = block.find((line) => line.trim())?.trim() ?? '';
      if (!/^\*\*\S.*\*\*$/.test(title)) errors.push(`${where}: finding needs a one-line title before its evidence`);
      // A Still present finding whose evidence is unchanged may point to the report holding its full entry.
      const carriedIndex = block.findIndex((line) => line.startsWith('- **Carried**'));
      if (carriedIndex >= 0) {
        const detail = bulletDetails(block[carriedIndex].slice('- **Carried**'.length), rawPart, i + 1 + carriedIndex, end);
        if (status !== 'Still present') errors.push(`${where}: only a Still present finding can be a **Carried** entry`);
        else if (!/\]\([^)\s]+\.md(?:#[^)\s]*)?\)/.test(detail)) errors.push(`${where}: **Carried** must link the report holding the full entry`);
        else if (!/`[0-9a-f]{7,64}`/.test(detail)) errors.push(`${where}: **Carried** must name the commit its files are unchanged since, in backticks`);
      }
      for (const label of carriedIndex >= 0 ? [] : requiredLabels) {
        const prefix = `- **${label}**`;
        const bulletIndex = block.findIndex((line) => line.startsWith(prefix));
        if (bulletIndex < 0) {
          errors.push(`${where}: no **${label}** bullet`);
          continue;
        }
        const detail = block[bulletIndex].slice(prefix.length);
        if (!bulletDetails(detail, rawPart, i + 1 + bulletIndex, end)) {
          errors.push(`${where}: empty **${label}** bullet`);
        }
      }
      if (section === 'Findings' && status !== 'Fixed' && priorityIndex >= 0) {
        if (priorityIndex < lowestActivePriority) errors.push(`${where}: active findings must be ordered by priority`);
        lowestActivePriority = Math.max(lowestActivePriority, priorityIndex);
        counts[prio]++;
      }
    });
  }
  if (newPrefixes.size > 1) {
    errors.push(`new findings use several ID prefixes: ${[...newPrefixes].join(', ')}`);
  } else if (carriedPrefixes.size && [...newPrefixes].some((prefix) => !carriedPrefixes.has(prefix))) {
    errors.push(`new findings must reuse a prefix from carried findings: ${[...carriedPrefixes].join(', ')}`);
  }
  if (carriedPrefixes.size && !body('Changes since baseline').some((line) => line.trim())) {
    errors.push('Tracked findings require Changes since baseline with a summary of the re-check.');
  }

  // Summary table: exact header, counts equal to active findings.
  const sum = body('Summary');
  const withoutEmphasis = (cell) => cell.replace(/^(\*{1,2})([^*]+)\1$/, '$2');
  const priorityTables = sum.flatMap((line, index) => {
    const cells = tableCells(line);
    return cells.length > 1 && withoutEmphasis(cells[0]) === 'Critical' ? [index] : [];
  });
  const [h] = priorityTables;
  if (h === undefined) errors.push('Summary has no priority table');
  else {
    if (priorityTables.length > 1) errors.push('Summary has more than one priority table');
    if (continuesTable(sum[h + 3])) errors.push('Summary table must contain one counts row');
    const headerCells = tableCells(sum[h]).map(withoutEmphasis);
    if (headerCells.join('|') !== PRIORITIES.join('|')) errors.push(`Summary table header is [${headerCells.join(', ')}]`);
    const delimiters = tableCells(sum[h + 1]);
    if (delimiters.length !== PRIORITIES.length || delimiters.some((cell) => !TABLE_DELIMITER.test(cell))) {
      errors.push('Summary table has an invalid Markdown delimiter row');
    }
    const countCells = tableCells(sum[h + 2]).map(withoutEmphasis);
    if (countCells.length !== PRIORITIES.length || countCells.some((cell) => !/^\d+$/.test(cell))) {
      errors.push('Summary counts must be explicit non-negative whole numbers');
    } else {
      const row = countCells.map(Number);
      const want = PRIORITIES.map((p) => counts[p]);
      if (row.join('|') !== want.join('|')) errors.push(`Summary counts [${row.join(', ')}] differ from active findings [${want.join(', ')}]`);
    }
  }

  checkTraceability(
    lines,
    coverageHeading < 0 ? lines.length : coverageHeading + 1,
    sectionEnd(coverageHeading),
    findingsById,
    errors,
  );
  const placeholder = sourceLines.find((line) => line.includes('<fill:'));
  if (placeholder) errors.push(`unfilled skeleton placeholder: ${placeholder.trim().slice(0, 80)}`);
  // publish-report.cjs reads these to fill a Summary row written as "auto"; non-enumerable, so errors stay a plain list.
  Object.defineProperty(errors, 'activeCounts', { value: PRIORITIES.map((p) => counts[p]) });
  return errors;
}

function listReports(directory, inputErrors) {
  const reports = [];
  function visit(folder) {
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (error) {
      inputErrors.push({ path: folder, error: error.message });
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && entry.name.endsWith('.md')) reports.push(entryPath);
    }
  }
  visit(directory);
  return reports;
}

function compileForbiddenPattern(pattern, flags) {
  if (pattern === undefined || flags.includes(pattern)) {
    throw new Error('--forbid requires a regular expression.');
  }
  try {
    return new RegExp(pattern);
  } catch {
    throw new Error('Invalid regular expression for --forbid.');
  }
}

function run(args) {
  const forbid = [];
  const targets = [];
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') {
      json = true;
      continue;
    }
    if (args[i] !== '--forbid') {
      targets.push(args[i]);
      continue;
    }

    try {
      forbid.push(compileForbiddenPattern(args[++i], ['--forbid', '--json']));
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }
  if (!targets.length) {
    console.error('Provide at least one report path or directory.');
    return 1;
  }

  const files = new Map();
  const inputErrors = [];
  for (const target of targets) {
    try {
      const errorsBefore = inputErrors.length;
      const reports = fs.statSync(target).isDirectory() ? listReports(target, inputErrors) : [target];
      if (!reports.length && errorsBefore === inputErrors.length) {
        inputErrors.push({ path: target, error: 'no Markdown reports found' });
      }
      for (const report of reports) {
        // The real path merges inputs that reach one file through a symlink (macOS /var is /private/var).
        let resolved = path.resolve(report);
        try { resolved = fs.realpathSync(report); } catch {}
        if (!files.has(resolved)) files.set(resolved, report);
      }
    } catch (error) {
      inputErrors.push({ path: target, error: error.message });
    }
  }
  const reports = Array.from(files.values(), (file) => ({ path: file, errors: check(file, forbid) }));
  const passed = reports.filter(({ errors }) => !errors.length).length;
  if (json) {
    console.log(JSON.stringify({ passed, total: reports.length, reports, inputErrors }));
  } else {
    for (const issue of inputErrors) console.error(`${issue.path}: ${issue.error}`);
    for (const report of reports) {
      console.log(`${report.errors.length ? 'FAIL' : 'ok  '} ${report.path}`);
      for (const error of report.errors) console.log(`     - ${error}`);
    }
    console.log(`${passed}/${reports.length} reports pass`);
  }
  return inputErrors.length || passed !== reports.length ? 1 : 0;
}

if (require.main === module) process.exitCode = run(process.argv.slice(2));

module.exports = { check, checkBytes, compileForbiddenPattern, run };
