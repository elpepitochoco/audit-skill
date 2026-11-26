'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const run = promisify(execFile);
const publisher = join(__dirname, '..', '.agents', 'skills', 'audit', 'scripts', 'publish-report.cjs');
const checker = join(__dirname, '..', '.agents', 'skills', 'audit', 'scripts', 'check-report.cjs');
const reportName = '2026-11-23_02-15-00-general.md';
const completeReport = `- **Date** 2026-11-23 02:15:00 +01:00
- **Branch / commit** outside Git
- **Local changes** Git state unavailable.
- **Scope** Documentation example.
- **Criteria mode** supplied criteria only
- **Checks and references** Compared the example with the supplied rule.
- **Baseline** First report.

## Summary

| Critical | High | Medium | Low | Informational |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0 |

## Findings

No findings.

## Coverage and limitations

Reviewed the supplied example.
- **Files** 1 in scope: 1 read in full, 0 sampled, 0 not read
- **Criteria** 1 assessed, 0 not applicable, 0 not assessed
`;

test('validates the current draft before creating the report directory', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));

  const draft = join(directory, reportName);
  const destination = join(directory, 'audits', reportName);
  writeFileSync(draft, completeReport);
  await run(process.execPath, [checker, draft]);
  writeFileSync(draft, completeReport.slice(0, completeReport.indexOf('Reviewed the supplied example.')));

  await assert.rejects(run(process.execPath, [publisher, '--check', draft, destination]), {
    stderr: /Coverage and limitations is empty/,
  });
  assert.deepEqual(readdirSync(directory), [reportName]);
});

test('rejects trailing arguments before writing any report', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const draft = join(directory, 'draft.md');
  const destination = join(directory, 'audits', reportName);
  writeFileSync(draft, 'Incomplete draft\n');

  await assert.rejects(run(process.execPath, [publisher, draft, destination, '--check']), {
    stderr: /Usage: node publish-report.cjs/,
  });
  assert.deepEqual(readdirSync(directory), ['draft.md']);
});

test('checked publication rejects a timestamp that disagrees with the supplied filename', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const draft = join(directory, 'draft.md');
  const destination = join(directory, 'audits', '2026-11-23_02-15-01-general.md');
  writeFileSync(draft, completeReport);

  await assert.rejects(run(process.execPath, [publisher, '--check', draft, destination]), {
    stderr: /Date does not match the report filename timestamp/,
  });
  assert.deepEqual(readdirSync(directory), ['draft.md']);
});

test('checked publication applies all forbidden patterns to the bytes it would write', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const draft = join(directory, reportName);
  const destination = join(directory, 'audits', reportName);
  const marker = 'sensitive-fixture-marker';
  writeFileSync(draft, completeReport);
  await run(process.execPath, [checker, '--forbid', marker, draft]);
  writeFileSync(draft, completeReport.replace('## Findings', `## ${marker}`));

  const options = ['--check', '--forbid', 'different-marker', '--forbid', marker];
  await assert.rejects(run(process.execPath, [publisher, ...options, draft, destination]), error => {
    assert.match(error.stderr, /forbidden content matches pattern 2/);
    assert.doesNotMatch(error.stderr, /sensitive-fixture-marker/);
    return true;
  });
  assert.deepEqual(readdirSync(directory), [reportName]);

  await assert.rejects(run(process.execPath, [publisher, '--forbid', 'different-marker', draft, destination]), {
    stderr: /unexpected sections/,
  });
  assert.deepEqual(readdirSync(directory), [reportName]);

  writeFileSync(draft, completeReport);
  await run(process.execPath, [publisher, ...options, draft, destination]);
  assert.equal(readFileSync(destination, 'utf8'), completeReport);
});

test('a malformed publication pattern is reported without echoing the pattern', async () => {
  await assert.rejects(
    run(process.execPath, [publisher, '--forbid', '[fixture-private-marker', 'draft.md', 'audits/' + reportName]),
    error => {
      assert.match(error.stderr, /Invalid regular expression for --forbid/);
      assert.doesNotMatch(error.stderr, /fixture-private-marker/);
      return true;
    },
  );
});

test('publishes the validated bytes using the destination name for validation', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));

  const draft = join(directory, 'working-draft.txt');
  const destination = join(directory, 'audits', reportName);
  const contents = Buffer.from(completeReport.replaceAll('\n', '\r\n'));
  writeFileSync(draft, contents);

  const { stdout } = await run(process.execPath, [publisher, '--check', draft, destination]);
  assert.equal(stdout.trim(), destination);
  assert.deepEqual(readFileSync(destination), contents);
  assert.deepEqual(readdirSync(directory), ['audits'], 'the published draft is removed');
});

test('creates the audits directory and uses the unsuffixed name on the first run', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));

  const draft = join(directory, 'draft.md');
  const destination = join(directory, 'audits', '2026-11-23_02-15-00-general.md');
  const contents = 'Complete report · café\n';
  writeFileSync(draft, contents);

  const { stdout } = await run(process.execPath, [publisher, draft, destination]);
  assert.equal(stdout.trim(), destination);
  assert.equal(readFileSync(destination, 'utf8'), contents);
  assert.deepEqual(readdirSync(join(directory, 'audits')), ['2026-11-23_02-15-00-general.md']);
});

test('rejects an audits link that would redirect writes outside the target', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));

  const target = join(directory, 'target');
  const outside = join(directory, 'outside');
  mkdirSync(target);
  mkdirSync(outside);
  const audits = join(target, 'audits');
  symlinkSync(outside, audits, process.platform === 'win32' ? 'junction' : 'dir');
  const draft = join(directory, 'draft.md');
  writeFileSync(draft, 'Complete report\n');
  const destination = join(audits, '2026-11-23_02-15-00-general.md');

  await assert.rejects(run(process.execPath, [publisher, draft, destination]), {
    stderr: /The audits path must be a real directory/,
  });
  assert.deepEqual(readdirSync(outside), []);
});

test('rejects a draft with an invalid UTF-8 byte sequence before publishing', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));

  const draft = join(directory, 'draft.md');
  const destination = join(directory, 'audits', '2026-11-23_02-15-00-general.md');
  writeFileSync(draft, Buffer.from([0xc3, 0x28]));

  await assert.rejects(run(process.execPath, [publisher, draft, destination]), {
    stderr: /The report draft must be UTF-8 without a byte order mark/,
  });
  assert.deepEqual(readdirSync(directory), ['draft.md']);
});

test('rejects a draft with a UTF-8 byte order mark before publishing', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));

  const draft = join(directory, 'draft.md');
  const destination = join(directory, 'audits', '2026-11-23_02-15-00-general.md');
  writeFileSync(draft, '\uFEFFComplete report\n');

  await assert.rejects(run(process.execPath, [publisher, draft, destination]), {
    stderr: /The report draft must be UTF-8 without a byte order mark/,
  });
  assert.deepEqual(readdirSync(directory), ['draft.md']);
});

test('concurrent publishers keep the existing report and publish each complete draft', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));

  const audits = join(directory, 'audits');
  mkdirSync(audits);
  const stem = '2026-11-23_02-15-00-general';
  const first = join(audits, `${stem}.md`);
  writeFileSync(first, 'Existing report\n');

  const drafts = Array.from({ length: 6 }, (_, i) => `## Summary\n\nRun ${i + 1} · café\n\n## Coverage and limitations\n\nComplete.\n`);
  const published = await Promise.all(drafts.map(async (contents, i) => {
    const draft = join(directory, `draft-${i}.txt`);
    writeFileSync(draft, contents);
    const { stdout } = await run(process.execPath, [publisher, draft, first]);
    const result = stdout.trim();
    assert.equal(readFileSync(result, 'utf8'), contents);
    return result;
  }));

  assert.equal(new Set(published).size, drafts.length);
  assert.equal(readFileSync(first, 'utf8'), 'Existing report\n');
  assert.deepEqual(readdirSync(audits).sort(), [
    `${stem}.md`,
    ...drafts.map((_, i) => `${stem}-${i + 2}.md`),
  ].sort());
});

test('keeps a draft that lives outside the temp folder', async (t) => {
  const directory = mkdtempSync(join(__dirname, '.publish-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const draft = join(directory, 'draft.md');
  writeFileSync(draft, completeReport);

  const { stderr } = await run(process.execPath, [publisher, '--check', draft, join(directory, 'audits', reportName)]);
  assert.match(stderr, /Draft kept/);
  assert.equal(readFileSync(draft, 'utf8'), completeReport);
  assert.equal(readFileSync(join(directory, 'audits', reportName), 'utf8'), completeReport);
});

test('publishes without overwriting when the file system has no hard links', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-publish-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const noLinks = join(directory, 'no-links.cjs');
  writeFileSync(noLinks, `require('node:fs').linkSync = () => { throw Object.assign(new Error('no links'), { code: 'EPERM' }); };`);
  mkdirSync(join(directory, 'audits'));
  writeFileSync(join(directory, 'audits', reportName), 'earlier report\n');
  const draft = join(directory, 'draft.md');
  writeFileSync(draft, completeReport);

  const { stdout } = await run(process.execPath, ['-r', noLinks, publisher, '--check', draft, join(directory, 'audits', reportName)]);
  assert.equal(stdout.trim(), join(directory, 'audits', reportName.replace('.md', '-2.md')));
  assert.equal(readFileSync(join(directory, 'audits', reportName), 'utf8'), 'earlier report\n');
  assert.equal(readFileSync(stdout.trim(), 'utf8'), completeReport);
});
