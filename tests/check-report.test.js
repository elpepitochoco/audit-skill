'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const checker = join(__dirname, '..', '.agents', 'skills', 'audit', 'scripts', 'check-report.cjs');
const { check } = require(checker);

const coverage = `Read the README example and checked it against the implementation.
- **Files** 1 in scope: 1 read in full, 0 sampled, 0 not read
- **Sub-categories** 1 assessed, 0 not applicable, 0 not assessed
- **Criteria** 1 assessed, 0 not applicable, 0 not assessed
`;
const validReport = `- **Date** 2026-11-23 10:00:00 +01:00
- **Branch / commit** main / no commit yet
- **Local changes** README.md is untracked
- **Scope** Documentation / Consistency with the code / README.md
- **Criteria mode** supplied criteria only
- **Checks and references** Compare the documented example with the implementation.
- **Baseline** First audit.

## Summary

| Critical | High | Medium | Low | Informational |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 1 | 0 |

## Findings

### DOC-01 · Low · Documentation / Consistency with the code · Confirmed · New

**The documented example is out of date**

- **Expected** The example matches the implementation.
- **Observed** The example in README.md:4 uses an old field name.
- **Impact** The example fails when copied.

## Coverage and limitations

${coverage}`;
const findingBlock = validReport.slice(
  validReport.indexOf('### DOC-01'),
  validReport.indexOf('## Coverage and limitations'),
);

function checkText(t, text, forbidden = [], name = '2026-11-23_10-00-00-docs.md') {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const file = join(directory, name);
  writeFileSync(file, text);
  return check(file, forbidden);
}

function withBaselineChanges(report) {
  return report.replace(
    '## Coverage and limitations',
    '## Changes since baseline\n\nRechecked the earlier finding with the current evidence.\n\n## Coverage and limitations',
  );
}

test('accepts a conforming report', (t) => {
  assert.deepEqual(checkText(t, validReport), []);
});

test('requires details for each report header field', (t) => {
  const report = validReport
    .replace(/^- \*\*Scope\*\*.+$/m, '- **Scope** <!-- fill in scope -->')
    .replace(/^- \*\*Baseline\*\*.+$/m, '- **Baseline**:');
  const errors = checkText(t, report);
  assert.ok(errors.some(error => error.includes('header field **Scope** is empty')));
  assert.ok(errors.some(error => error.includes('header field **Baseline** is empty')));
});

test('accepts indented details in a report header', (t) => {
  const report = validReport.replace(
    /^- \*\*Checks and references\*\*.+$/m,
    '- **Checks and references**\n  - Compared the README example with the supplied reference.',
  );
  assert.deepEqual(checkText(t, report), []);
});

test('checks the declared criteria mode and accepts annotations', (t) => {
  const unknown = validReport.replace('supplied criteria only', 'custom review (based on built-in grid)');
  assert.ok(checkText(t, unknown).some(error => error.includes('Criteria mode must start with')));
  const annotated = validReport.replace('supplied criteria only', '**Extended grid** (one supplied reference).');
  assert.deepEqual(checkText(t, annotated), []);
});

test('requires a real calendar date and clock time in the report filename', (t) => {
  const leapDay = validReport.replace('2026-11-23 10:00:00', '2024-02-29 23:59:59');
  assert.deepEqual(checkText(t, leapDay, [], '2024-02-29_23-59-59-docs.md'), []);
  for (const name of ['2025-02-29_23-59-59-docs.md', '2026-11-23_24-00-00-docs.md']) {
    assert.ok(checkText(t, validReport, [], name).some(error => error.includes('file name does not match')));
  }
});

test('requires the header date to match the filename and carry a valid UTC offset', (t) => {
  const wrongDate = validReport.replace('10:00:00 +01:00', '10:00:01 +01:00');
  const wrongOffset = validReport.replace('+01:00', '+25:00');
  assert.ok(checkText(t, wrongDate).some(error => error.includes('Date does not match the report filename')));
  assert.ok(checkText(t, wrongOffset).some(error => error.includes('Date must contain a valid local timestamp')));
  assert.deepEqual(checkText(t, validReport.replace('+01:00', '(UTC+01:00)')), []);
  assert.ok(checkText(t, validReport.replace(' +01:00', '')).some(error => error.includes('numeric UTC offset')));
});

test('rejects repeated sections', (t) => {
  const report = validReport.replace('## Findings\n', '## Summary\n\n## Findings\n');
  assert.ok(checkText(t, report).some(error => error.includes('duplicate section: Summary')));
});

test('rejects a coverage heading with no coverage below it', (t) => {
  const report = validReport.replace(coverage, ' \t\n');
  assert.ok(checkText(t, report).some(error => error.includes('Coverage and limitations is empty')));
});

test('checks the content of section headings with trailing whitespace', (t) => {
  const report = validReport.replace('## Findings\n', '## Findings  \t\n');
  assert.deepEqual(checkText(t, report), []);

  const wrongCount = report.replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | 0 | 0 |');
  assert.ok(checkText(t, wrongCount).some(error => error.includes('differ from active findings')));
});

test('accepts top-level report headings with a tab separator and closing markers', (t) => {
  const report = validReport.replace(/^(#{2,3}) (.+)$/gm, '$1\t$2 ###');
  assert.deepEqual(checkText(t, report), []);
});

test('recognizes report headings indented by up to three spaces', (t) => {
  const report = validReport.replace(/^(#{2,3}) /gm, '   $1 ');
  assert.deepEqual(checkText(t, report), []);
});

test('accepts a report using carriage-return line endings', (t) => {
  assert.deepEqual(checkText(t, validReport.replaceAll('\n', '\r')), []);
});

test('rejects blank counts instead of interpreting them as zero', (t) => {
  const report = validReport.replace('| 0 | 0 | 0 | 1 | 0 |', '|   | 0 | 0 | 1 | 0 |');
  assert.ok(checkText(t, report).some(error => error.includes('explicit non-negative whole numbers')));
});

test('requires a Markdown delimiter row in the Summary table', (t) => {
  const report = validReport.replace('| --- | --- | --- | --- | --- |', '| separator | --- | --- | --- | --- |');
  assert.ok(checkText(t, report).some(error => error.includes('invalid Markdown delimiter row')));
});

test('detects extra Summary cells instead of discarding their contents', (t) => {
  const report = validReport.replace('| 0 | 0 | 0 | 1 | 0 |', 'extra | 0 | 0 | 0 | 1 | 0 | extra');
  assert.ok(checkText(t, report).some(error => error.includes('explicit non-negative whole numbers')));
});

test('rejects competing counts in the Summary table', (t) => {
  const report = validReport.replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | 1 | 0 |\n| 0 | 1 | 0 | 0 | 0 |');
  assert.ok(checkText(t, report).some(error => error.includes('Summary table must contain one counts row')));
});

test('accepts a Summary table without outer pipes and rejects an extra bare row', (t) => {
  const report = validReport.replace(/^\| (.+) \|$/gm, '$1');
  assert.deepEqual(checkText(t, report), []);
  const extraRow = report.replace('0 | 0 | 0 | 1 | 0\n', '0 | 0 | 0 | 1 | 0\n0 | 1 | 0 | 0 | 0\n');
  assert.ok(checkText(t, extraRow).some(error => error.includes('Summary table must contain one counts row')));
});

test('rejects a second priority table in the Summary section', (t) => {
  const table = validReport.slice(validReport.indexOf('| Critical'), validReport.indexOf('## Findings'));
  const report = validReport.replace('## Findings', `${table}## Findings`);
  assert.ok(checkText(t, report).some(error => error.includes('Summary has more than one priority table')));
});

test('accepts paired bold counts and rejects an unmatched emphasis marker', (t) => {
  const report = validReport.replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | **1** | 0 |');
  assert.deepEqual(checkText(t, report), []);
  assert.ok(checkText(t, report.replace('**1**', '1*')).some(error => error.includes('explicit non-negative whole numbers')));
});

test('requires an impact bullet in each finding', (t) => {
  const report = validReport.replace('- **Impact** The example fails when copied.\n', '');
  assert.ok(checkText(t, report).some(error => error.includes('no **Impact** bullet')));
});

test('requires a one-line title before finding evidence', (t) => {
  const report = validReport.replace('**The documented example is out of date**\n\n', '');
  assert.ok(checkText(t, report).some(error => error.includes('finding needs a one-line title')));
});

test('orders active findings by priority and permits a closed finding after them', (t) => {
  const high = findingBlock.replace('DOC-01', 'DOC-02').replace('· Low', '· High');
  const unordered = validReport
    .replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 1 | 0 | 1 | 0 |')
    .replace('## Coverage and limitations', `${high}## Coverage and limitations`);
  assert.ok(checkText(t, unordered).some(error => error.includes('active findings must be ordered by priority')));

  const fixed = high.replace('· New', '· Fixed');
  const withClosure = validReport.replace('## Coverage and limitations', `${fixed}## Coverage and limitations`);
  assert.deepEqual(checkText(t, withBaselineChanges(withClosure)), []);
});

test('tracked findings require a nonempty baseline changes section', (t) => {
  const report = validReport.replace('· New', '· Still present');
  const empty = report.replace('## Coverage and limitations', '## Changes since baseline\n\n<!-- Explain comparison here. -->\n\n## Coverage and limitations');
  for (const incomplete of [report, empty]) {
    assert.ok(checkText(t, incomplete).some(error => error.includes('Tracked findings require Changes since baseline')));
  }
  assert.deepEqual(checkText(t, withBaselineChanges(report)), []);
});

test('a Still present finding with unchanged evidence can be a carried entry linking its full entry', (t) => {
  const evidence = /- \*\*Expected\*\*[\s\S]*?- \*\*Impact\*\* The example fails when copied\./;
  const carried = (status, bullet) => withBaselineChanges(validReport.replace('· New', `· ${status}`).replace(evidence, bullet));
  const link = '- **Carried** Unchanged since `abc1234`; full entry in [the baseline](2026-11-20_10-00-00-docs.md).';
  assert.deepEqual(checkText(t, carried('Still present', link)), []);
  assert.ok(checkText(t, carried('New', link)).some((e) => e.includes('only a Still present finding can be a **Carried** entry')));
  assert.ok(checkText(t, carried('Still present', '- **Carried** Unchanged since the baseline.')).some((e) => e.includes('must link the report')));
  assert.ok(checkText(t, carried('Still present', link.replace('`abc1234`', 'the baseline'))).some((e) => e.includes('must name the commit')));
  const wrongCount = carried('Still present', link).replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | 0 | 0 |');
  assert.ok(checkText(t, wrongCount).some((e) => e.includes('differ from active findings')), 'carried entries stay counted');

  // Inside audits/, the linked report must exist and hold the same finding ID.
  const audits = join(mkdtempSync(join(tmpdir(), 'audit-carried-')), 'audits');
  t.after(() => rmSync(join(audits, '..'), { recursive: true }));
  mkdirSync(audits);
  const inAudits = (text) => {
    const file = join(audits, '2026-11-23_10-00-00-docs.md');
    writeFileSync(file, text);
    return check(file, []);
  };
  assert.ok(inAudits(carried('Still present', link)).some((e) => e.includes('which is not in audits/')));
  writeFileSync(join(audits, '2026-11-20_10-00-00-docs.md'), validReport.replace('DOC-01', 'DOC-02'));
  assert.ok(inAudits(carried('Still present', link)).some((e) => e.includes('which has no finding DOC-01')));
  writeFileSync(join(audits, '2026-11-20_10-00-00-docs.md'), validReport);
  assert.deepEqual(inAudits(carried('Still present', link)), []);
});

test('a Rotation bullet must name the files it read', (t) => {
  const rotation = (bullet) => validReport.replace('## Coverage and limitations\n', `## Coverage and limitations\n\n${bullet}\n`);
  assert.deepEqual(checkText(t, rotation('- **Rotation** `lib/auth.js`, `lib/db.js` read in full.')), []);
  assert.ok(checkText(t, rotation('- **Rotation** 15 files read in full.')).some((e) => e.includes('**Rotation** must name the files')));
});

test('rejects finding bullets that have a label without supporting content', (t) => {
  const report = validReport
    .replace('- **Observed** The example in README.md:4 uses an old field name.', '- **Observed**')
    .replace('- **Impact** The example fails when copied.', '- **Impact**:');
  const errors = checkText(t, report);
  assert.ok(errors.some(error => error.includes('empty **Observed** bullet')));
  assert.ok(errors.some(error => error.includes('empty **Impact** bullet')));
});

test('accepts finding bullets with indented evidence', (t) => {
  const report = validReport.replace(
    '- **Observed** The example in README.md:4 uses an old field name.',
    '- **Observed**\n  - README.md:4 uses an old field name.',
  );
  assert.deepEqual(checkText(t, report), []);
});

test('a planned closure requires a recorded decision and stays out of active counts', (t) => {
  const planned = validReport
    .replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | 0 | 0 |')
    .replace('### DOC-01', '## Planned later\n\n### DOC-01')
    .replace('· New', '· Planned later');
  assert.ok(checkText(t, planned).some(error => error.includes('no **Decision** bullet')));

  const complete = planned.replace(
    '## Coverage and limitations',
    '- **Decision** Defer the example update to the next release, as recorded in ROADMAP.md.\n\n## Coverage and limitations',
  );
  assert.deepEqual(checkText(t, complete), []);
});

test('rejects inconsistent prefixes for new finding IDs', (t) => {
  const secondFinding = findingBlock.replace('DOC-01', 'SETUP-01');
  const report = validReport
    .replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | 2 | 0 |')
    .replace('## Coverage and limitations', `${secondFinding}## Coverage and limitations`);
  assert.ok(checkText(t, report).some(error => error.includes('new findings use several ID prefixes')));
});

test('keeps existing IDs with distinct prefixes and uses one for new findings', (t) => {
  const carriedDoc = findingBlock.replace('· New', '· Still present');
  const carriedSetup = carriedDoc.replace('DOC-01', 'SETUP-01');
  const report = validReport
    .replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | 3 | 0 |')
    .replace('DOC-01', 'DOC-02')
    .replace('## Coverage and limitations', `${carriedSetup}${carriedDoc}## Coverage and limitations`);
  assert.deepEqual(checkText(t, withBaselineChanges(report)), []);
  assert.ok(checkText(t, report.replace('DOC-02', 'NEW-01')).some(error => error.includes('new findings must reuse')));
});

test('treats fenced Markdown evidence as content', (t) => {
  const evidence = ['~~~markdown', '## Example heading', '### Example subheading', '~~~', ''].join('\n');
  const report = validReport.replace('## Coverage and limitations', `${evidence}\n## Coverage and limitations`);
  assert.deepEqual(checkText(t, report), []);
  assert.deepEqual(checkText(t, report, [/Example heading/]), ['forbidden content matches pattern 1']);
});

test('ignores indented code examples when locating traceability tables', (t) => {
  const example = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Gap | Example of an unresolved link. | DOC-99 |',
  ];
  for (const indent of ['    ', '\t']) {
    const report = validReport + '\n' + example.map(line => indent + line).join('\n') + '\n';
    assert.deepEqual(checkText(t, report), []);
    assert.deepEqual(checkText(t, report, [/DOC-99/]), ['forbidden content matches pattern 1']);
  }
  assert.ok(checkText(t, validReport + '\n' + example.join('\n')).some(error => error.includes('unknown finding ID DOC-99')));
});

test('does not count section headings hidden in HTML comments', (t) => {
  const summary = validReport.slice(validReport.indexOf('## Summary'), validReport.indexOf('## Findings'));
  const report = validReport.replace(summary, `<!--\n${summary}-->\n\n`);
  assert.ok(checkText(t, report).some(error => error.includes('missing section: Summary')));
});

test('does not count a comment as coverage or hide text following a fenced comment example', (t) => {
  const placeholder = coverage;
  const commented = validReport.replace(placeholder, '<!-- Fill in coverage later. -->');
  assert.ok(checkText(t, commented).some(error => error.includes('Coverage and limitations is empty')));

  const example = validReport.replace('## Findings', '~~~html\n<!-- example opener\n~~~\n\n## Findings');
  assert.deepEqual(checkText(t, example), []);
});

test('does not echo forbidden content from malformed headings', (t) => {
  const marker = 'fixture-redaction-marker';
  const report = validReport.replace('## Findings', `## ${marker}`);
  const errors = checkText(t, report, [/fixture-redaction-marker/]);

  assert.deepEqual(errors, ['forbidden content matches pattern 1']);
  assert.doesNotMatch(errors.join('\n'), /fixture-redaction-marker/);
});

test('applying a global forbidden pattern does not depend on prior matches', (t) => {
  const marker = 'fixture-redaction-marker';
  const report = validReport.replace('## Findings', `## ${marker}`);
  const pattern = /fixture-redaction-marker/g;
  pattern.lastIndex = report.length;
  const forbidden = [pattern];

  for (let run = 0; run < 2; run++) {
    assert.deepEqual(checkText(t, report, forbidden), ['forbidden content matches pattern 1']);
  }
  assert.equal(pattern.lastIndex, report.length);
});

test('traceability rows can share a finding and include escaped pipes in evidence', (t) => {
  const matrix = [
    '### Requirements traceability',
    '',
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Gap | README lists a \\| b. | [DOC-01](#doc-01--low--documentation--consistency-with-the-code--confirmed--new) |',
    '| R-2 | Gap | The second example uses the same field. | `DOC-01` |',
    '| R-3 | Met | The default value is correct. | |',
  ].join('\n');
  assert.deepEqual(checkText(t, `${validReport}\n${matrix}\n`), []);
});

test('a traceability link must reach the cited finding', (t) => {
  const matrix = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Gap | The old field remains. | [DOC-01](#doc-01--medium--documentation--consistency-with-the-code--confirmed--new) |',
  ].join('\n');
  assert.ok(checkText(t, `${validReport}\n${matrix}\n`).some(error => error.includes('link target does not identify DOC-01')));
});

test('a traceability link can use an explicit stable anchor above the finding', (t) => {
  const matrix = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Gap | The old field remains. | [DOC-01](#finding-doc-01) |',
  ].join('\n');
  const report = validReport.replace('### DOC-01', '<a name="finding-doc-01"></a>\n\n### DOC-01');
  assert.deepEqual(checkText(t, `${report}\n${matrix}\n`), []);
  const reprioritized = report
    .replace('· Low', '· High')
    .replace('· New', '· Still present')
    .replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 1 | 0 | 0 | 0 |');
  assert.deepEqual(checkText(t, `${withBaselineChanges(reprioritized)}\n${matrix}\n`), []);
  assert.ok(checkText(t, `${validReport}\n${matrix}\n`).some(error => error.includes('link target does not identify DOC-01')));
});

test('traceability rows require real finding IDs for gaps and open checks', (t) => {
  const matrix = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Gap | The old field remains. | DOC-02 |',
    '| R-2 | To verify | The generated example is missing. | |',
  ].join('\n');
  const errors = checkText(t, `${validReport}\n${matrix}\n`);
  assert.ok(errors.some(error => error.includes('unknown finding ID DOC-02')));
  assert.ok(errors.some(error => error.includes('To verify row must cite a finding')));
});

test('traceability rejects fixed findings for gaps and open checks', (t) => {
  const fixed = withBaselineChanges(validReport
    .replace('· New', '· Fixed')
    .replace('| 0 | 0 | 0 | 1 | 0 |', '| 0 | 0 | 0 | 0 | 0 |'));
  const header = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
  ].join('\n');
  assert.deepEqual(checkText(t, `${fixed}\n${header}\n| R-1 | Met | The example now passes. | DOC-01 |\n`), []);
  for (const result of ['Gap', 'To verify']) {
    const errors = checkText(t, `${fixed}\n${header}\n| R-1 | ${result} | Evidence recorded. | DOC-01 |\n`);
    assert.ok(errors.some(error => error.includes(`${result} row cites fixed finding DOC-01`)));
  }
});

test('traceability distinguishes current gaps from evidence still to verify', (t) => {
  const matrix = result => [
    '',
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    `| R-1 | ${result} | Evidence recorded. | DOC-01 |`,
    '',
  ].join('\n');
  const pending = validReport.replace('· Confirmed', '· To verify');
  const historical = withBaselineChanges(validReport.replace('· New', '· Not reverified'));

  assert.deepEqual(checkText(t, validReport + matrix('Gap')), []);
  assert.ok(checkText(t, pending + matrix('Gap')).some(error => error.includes('Gap row requires a current confirmed finding')));
  assert.ok(checkText(t, historical + matrix('Gap')).some(error => error.includes('Gap row requires a current confirmed finding')));
  assert.deepEqual(checkText(t, pending + matrix('To verify')), []);
  assert.deepEqual(checkText(t, historical + matrix('To verify')), []);
  assert.ok(checkText(t, validReport + matrix('To verify')).some(error => error.includes('To verify row requires a finding with an incomplete check')));
});

test('a traceability subsection requires the expected matrix header', (t) => {
  const matrix = [
    '### Requirements traceability',
    '',
    '| Requirement and source | Result | Observed or missing evidence |',
    '| --- | --- | --- |',
    '| R-1 | Gap | The old field remains. |',
  ].join('\n');
  const errors = checkText(t, `${validReport}\n${matrix}\n`);
  assert.ok(errors.some(error => error.includes('Requirements traceability table requires the four-column header')));
});

test('validates a traceability row without outer pipes', (t) => {
  const matrix = [
    '### Requirements traceability',
    '',
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Met | The default value is correct. | |',
    'R-2 | Gap | The old field remains. | DOC-02',
  ].join('\n');
  const errors = checkText(t, `${validReport}\n${matrix}\n`);
  assert.ok(errors.some(error => error.includes('traceability row 2: unknown finding ID DOC-02')));
});

test('a new block ends a traceability table even when it contains a pipe', (t) => {
  const table = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Met | The sample passed. | |',
  ].join('\n');
  for (const next of ['### Raw output | observed', '> Raw output | observed', '- Raw output | observed', '1. Raw output | observed', '---']) {
    assert.deepEqual(checkText(t, `${validReport}\n${table}\n${next}\n`), []);
  }
});

test('reports an incomplete traceability row before subsequent rows', (t) => {
  const table = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Met | The sample passed. | |',
    'R-2',
    '| R-3 | Gap | The sample failed. | DOC-02 |',
  ].join('\n');
  const errors = checkText(t, `${validReport}\n${table}\n`);
  assert.ok(errors.some(error => error.includes('traceability row 2 requires a source')));
  assert.ok(errors.some(error => error.includes('traceability row 3: unknown finding ID DOC-02')));
});

test('rejects a second traceability table or subsection', (t) => {
  const table = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Met | The sample passed. | |',
  ].join('\n');
  const duplicatedTable = `${validReport}\n${table}\n\n${table}\n`;
  const duplicatedHeading = `${validReport}\n### Requirements traceability\n\n${table}\n\n### Requirements traceability\n\nMissing table.\n`;
  assert.ok(checkText(t, duplicatedTable).some(error => error.includes('more than one traceability table')));
  assert.ok(checkText(t, duplicatedHeading).some(error => error.includes('more than one Requirements traceability subsection')));
});

test('requires traceability matrices and subsection headings to be in coverage', (t) => {
  const heading = '### Requirements traceability';
  const table = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 (README) | Met | README:4 matches the example. | |',
  ].join('\n');
  for (const misplaced of [heading, table]) {
    const report = validReport.replace('## Findings', `${misplaced}\n\n## Findings`);
    assert.ok(checkText(t, report).some(error => error.includes('traceability belongs in Coverage and limitations')));
  }
  const example = validReport.replace('## Findings', `\`\`\`markdown\n${heading}\n\n${table}\n\`\`\`\n\n## Findings`);
  assert.deepEqual(checkText(t, example), []);
});

test('rejects repeated requirement rows in the same traceability table', (t) => {
  const table = [
    '| Requirement and source | Result | Observed or missing evidence | Finding |',
    '| --- | --- | --- | --- |',
    '| R-1 | Met | The sample passed. | |',
    '| R-1 | Gap | The sample failed. | DOC-01 |',
  ].join('\n');
  assert.ok(checkText(t, `${validReport}\n${table}\n`).some(error => error.includes('traceability row 2 repeats the requirement and source')));
});

test('rejects corrupted UTF-8', (t) => {
  const report = Buffer.concat([Buffer.from(validReport), Buffer.from([0xff])]);
  assert.ok(checkText(t, report).some(error => error.includes('file is not valid UTF-8')));
});

test('the CLI requires at least one input path', () => {
  const run = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Provide at least one report path or directory/);
});

test('the CLI reports a missing forbidden-content pattern', () => {
  const run = spawnSync(process.execPath, [checker, '--forbid'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /--forbid requires a regular expression/);
});

test('the CLI reports an invalid forbidden-content pattern without a stack trace', () => {
  const run = spawnSync(process.execPath, [checker, '--forbid', '['], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Invalid regular expression for --forbid/);
  assert.doesNotMatch(run.stderr, /\n\s+at /);
});

test('the CLI reports an empty input directory even when another input is valid', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const report = join(directory, '2026-11-23_10-00-00-docs.md');
  writeFileSync(report, validReport);
  const empty = mkdtempSync(join(directory, 'empty-'));
  const run = spawnSync(process.execPath, [checker, report, empty], { encoding: 'utf8' });

  assert.equal(run.status, 1);
  assert.match(run.stderr, /no Markdown reports found/);
  assert.match(run.stdout, /1\/1 reports pass/);
});

test('the CLI counts each resolved path once when input paths overlap', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const report = '2026-11-23_10-00-00-docs.md';
  writeFileSync(join(directory, report), validReport);
  writeFileSync(join(directory, '2026-11-23_10-00-00-other.md'), validReport);

  const run = spawnSync(process.execPath, [checker, '.', './' + report, join(directory, report)], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /2\/2 reports pass/);
  assert.equal(run.stdout.split(/\r?\n/).filter(line => line.startsWith('ok  ')).length, 2);
});

test('the CLI emits a JSON diagnostic for each report and missing input', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const accepted = join(directory, '2026-11-23_10-00-00-accepted.md');
  const rejected = join(directory, '2026-11-23_10-00-00-rejected.md');
  const missing = join(directory, 'missing');
  writeFileSync(accepted, validReport);
  writeFileSync(rejected, validReport.replace('## Findings', '## fixture-redaction-marker'));

  const run = spawnSync(process.execPath, [
    checker, '--json', '--forbid', 'fixture-redaction-marker', accepted, rejected, missing,
  ], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stderr, '');
  const result = JSON.parse(run.stdout);
  assert.equal(result.total, 2);
  assert.equal(result.passed, 1);
  assert.deepEqual(result.reports, [
    { path: accepted, errors: [] },
    { path: rejected, errors: ['forbidden content matches pattern 1'] },
  ]);
  assert.equal(result.inputErrors.length, 1);
  assert.equal(result.inputErrors[0].path, missing);
});

test('the CLI continues when a report becomes unreadable during a scan', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const unavailable = join(directory, '2026-11-23_10-00-00-unavailable.md');
  const available = join(directory, '2026-11-23_10-00-00-available.md');
  writeFileSync(unavailable, validReport);
  writeFileSync(available, validReport);

  const simulateFailure = join(directory, 'read-failure.cjs');
  writeFileSync(simulateFailure, `
const fs = require('node:fs');
const [checker, unavailable, available] = process.argv.slice(2);
const readFileSync = fs.readFileSync;
fs.readFileSync = (file, ...options) => {
  if (file === unavailable) throw Object.assign(new Error('file is unreadable'), { code: 'EACCES' });
  return readFileSync(file, ...options);
};
process.exitCode = require(checker).run([unavailable, available]);
`);
  const run = spawnSync(process.execPath, [simulateFailure, checker, unavailable, available], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /file is unreadable/);
  assert.match(run.stdout, /1\/2 reports pass/);
});

test('a partially unreadable directory still validates reports in other subdirectories', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const available = join(directory, 'available');
  const unavailable = join(directory, 'unavailable');
  mkdirSync(available);
  mkdirSync(unavailable);
  const report = join(available, '2026-11-23_10-00-00-docs.md');
  writeFileSync(report, validReport);

  const simulateFailure = join(directory, 'directory-failure.cjs');
  writeFileSync(simulateFailure, `
const fs = require('node:fs');
const [checker, directory, unavailable] = process.argv.slice(2);
const readdirSync = fs.readdirSync;
fs.readdirSync = (folder, ...options) => {
  if (folder === unavailable) throw Object.assign(new Error('subdirectory is unreadable'), { code: 'EACCES' });
  return readdirSync(folder, ...options);
};
process.exitCode = require(checker).run(['--json', directory]);
`);
  const run = spawnSync(process.execPath, [simulateFailure, checker, directory, unavailable], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 1, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.passed, 1);
  assert.deepEqual(result.reports, [{ path: report, errors: [] }]);
  assert.deepEqual(result.inputErrors, [{ path: unavailable, error: 'subdirectory is unreadable' }]);
});

test('the CLI walks report directories with names ending in .md', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const nested = join(directory, 'archive.md');
  mkdirSync(nested);
  writeFileSync(join(nested, '2026-11-23_10-00-00-docs.md'), validReport);

  const run = spawnSync(process.execPath, [checker, directory], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /1\/1 reports pass/);
});

test('the installed skill checks a draft on its own', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-report-check-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const installedSkill = join(directory, 'audit');
  cpSync(join(__dirname, '..', '.agents', 'skills', 'audit'), installedSkill, { recursive: true });
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
  const draft = join(directory, '2026-11-23_10-00-00-docs.md');
  writeFileSync(draft, validReport);

  const checker = join(installedSkill, 'scripts', 'check-report.cjs');
  const run = spawnSync(process.execPath, [checker, draft], { cwd: directory, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /1\/1 reports pass/);
});

test('accepts a supplied criterion as the finding category only in supplied criteria only mode', (t) => {
  const report = validReport.replace('DOC-01 · Low · Documentation / Consistency with the code', 'DOC-01 · Low · Criteria / R1 Owner approval');
  assert.deepEqual(checkText(t, report), []);
  const builtIn = report.replace('**Criteria mode** supplied criteria only', '**Criteria mode** built-in grid');
  assert.ok(checkText(t, builtIn).some(error => error.includes('is not an axis / sub-category')));
});

test('the example reports pass the checker', () => {
  const run = spawnSync(process.execPath, [checker, join(__dirname, '..', 'examples')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
});

test('coverage needs the Files count and the count that matches the criteria mode', (t) => {
  const noFiles = validReport.replace(/^- \*\*Files\*\*.*\n/m, '');
  assert.ok(checkText(t, noFiles).some(error => error.includes('**Files** bullet')));
  const builtIn = validReport.replace('**Criteria mode** supplied criteria only', '**Criteria mode** built-in grid')
    .replace(/^- \*\*Sub-categories\*\*.*\n/m, '');
  assert.ok(checkText(t, builtIn).some(error => error.includes('**Sub-categories** bullet')));
  const noCriteria = validReport.replace(/^- \*\*Criteria\*\* 1.*\n/m, '');
  assert.ok(checkText(t, noCriteria).some(error => error.includes('**Criteria** bullet')));
});
