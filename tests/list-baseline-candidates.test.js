'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const script = join(__dirname, '..', '.agents', 'skills', 'audit', 'scripts', 'list-baseline-candidates.cjs');

test('lists same-scope report names by timestamp and numeric suffix', (t) => {
  const target = mkdtempSync(join(tmpdir(), 'audit-baseline-order-'));
  t.after(() => rmSync(target, { recursive: true }));
  const audits = join(target, 'audits');
  mkdirSync(audits);
  const expected = [
    '2026-11-23_10-00-01-release-24.md',
    '2026-11-23_10-00-00-release-24-10.md',
    '2026-11-23_10-00-00-release-24-2.md',
    '2026-11-23_10-00-00-release-24.md',
    '2026-11-23_09-59-59-release-24-100.md',
  ];
  for (const name of [...expected].reverse()) writeFileSync(join(audits, name), '');
  writeFileSync(join(audits, '2026-11-23_10-00-01-release-240.md'), '');
  writeFileSync(join(audits, '2026-11-23_10-00-01-release-24-1.md'), '');
  writeFileSync(join(audits, '2026-02-30_14-00-00-release-24.md'), '');
  writeFileSync(join(audits, '2026-11-23_24-00-00-release-24.md'), '');
  mkdirSync(join(audits, '2026-11-23_10-00-01-release-24-11.md'));

  const result = spawnSync(process.execPath, [script, target, 'release-24'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), expected);
});

test('an initial audit has no candidates and creates no directory', (t) => {
  const target = mkdtempSync(join(tmpdir(), 'audit-baseline-order-'));
  t.after(() => rmSync(target, { recursive: true }));
  const result = spawnSync(process.execPath, [script, target, 'general'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(join(target, 'audits')), false);
});

test('uses explicit UTC offsets to order reports across a repeated local hour', (t) => {
  const target = mkdtempSync(join(tmpdir(), 'audit-baseline-offset-'));
  t.after(() => rmSync(target, { recursive: true }));
  const audits = join(target, 'audits');
  mkdirSync(audits);
  const expected = [
    ['2026-10-25_02-10-00-general-2.md', '2026-10-25 02:10:00 +01:00'],
    ['2026-10-25_02-50-00-general.md', '2026-10-25 02:50:00 (local time, +02:00)'],
    ['2026-10-25_02-10-00-general.md', '2026-10-25 02:10:00 +02:00'],
  ];
  for (const [name, date] of expected) writeFileSync(join(audits, name), `- **Date** ${date}\n`);

  const result = spawnSync(process.execPath, [script, target, 'general'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), expected.map(([name]) => name));
});

test('falls back to filename ordering when an older report lacks a UTC offset', (t) => {
  const target = mkdtempSync(join(tmpdir(), 'audit-baseline-offset-'));
  t.after(() => rmSync(target, { recursive: true }));
  const audits = join(target, 'audits');
  mkdirSync(audits);
  const newerLocal = '2026-10-25_02-50-00-general.md';
  const olderLocal = '2026-10-25_02-10-00-general.md';
  writeFileSync(join(audits, newerLocal), '- **Date** 2026-10-25 02:50:00 (local)\n');
  writeFileSync(join(audits, olderLocal), '- **Date** 2026-10-25 02:10:00 +01:00\n');

  const result = spawnSync(process.execPath, [script, target, 'general'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [newerLocal, olderLocal]);
});

test('reads an indented date after a fenced example with carriage-return line endings', (t) => {
  const target = mkdtempSync(join(tmpdir(), 'audit-baseline-offset-'));
  t.after(() => rmSync(target, { recursive: true }));
  const audits = join(target, 'audits');
  mkdirSync(audits);
  const older = '2026-10-25_02-50-00-general.md';
  const newer = '2026-10-25_02-10-00-general.md';
  writeFileSync(join(audits, older), '- **Date** 2026-10-25 02:50:00 +02:00\n');
  writeFileSync(join(audits, newer), [
    '~~~markdown', '- **Date** 2026-10-25 02:10:00 +02:00', '## Example', '~~~', '',
    '- **Date** <!-- The value is below. -->', '  2026-10-25 02:10:00 +01:00',
  ].join('\r') + '\r');

  const result = spawnSync(process.execPath, [script, target, 'general'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [newer, older]);
});

test('ignores dates after an indented section heading with a tab separator', (t) => {
  const target = mkdtempSync(join(tmpdir(), 'audit-baseline-offset-'));
  t.after(() => rmSync(target, { recursive: true }));
  const audits = join(target, 'audits');
  mkdirSync(audits);
  const laterFilename = '2026-10-25_02-50-00-general.md';
  const earlierFilename = '2026-10-25_02-10-00-general.md';
  writeFileSync(join(audits, laterFilename), '- **Date** 2026-10-25 02:50:00 +02:00\n');
  writeFileSync(join(audits, earlierFilename), '   ##\tSummary ##\n\n- **Date** 2026-10-25 02:10:00 +01:00\n');

  const result = spawnSync(process.execPath, [script, target, 'general'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [laterFilename, earlierFilename]);
});
