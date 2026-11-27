'use strict';

const { isUtf8 } = require('node:buffer');
const { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, dirname, extname, isAbsolute, join, relative, resolve } = require('node:path');

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const AUTO_COUNTS = /^\|(?:[ \t]*auto[ \t]*\|){5}[ \t]*$/m;

// A Summary counts row written as "| auto | auto | auto | auto | auto |" gets the counts of the active findings.
// Only the row inside the Summary section is replaced, never an "auto" row quoted elsewhere.
function fillCounts(contents) {
  const text = contents.toString('utf8');
  const summary = /^## Summary[ \t]*\r?$/m.exec(text);
  if (!summary) return contents;
  const end = text.slice(summary.index + summary[0].length).search(/^## /m);
  const stop = end < 0 ? text.length : summary.index + summary[0].length + end;
  const section = text.slice(summary.index, stop);
  if (!AUTO_COUNTS.test(section)) return contents;
  const fill = (row) => text.slice(0, summary.index) + section.replace(AUTO_COUNTS, row) + text.slice(stop);
  const { checkBytes } = require('./check-report.cjs');
  const { activeCounts } = checkBytes(Buffer.from(fill('| 0 | 0 | 0 | 0 | 0 |')), 'draft.md');
  return Buffer.from(fill(`| ${activeCounts.join(' | ')} |`));
}

function publishReport(draft, destination, validate, forbid) {
  const destinationPath = resolve(destination);
  const directory = dirname(destinationPath);
  if (basename(directory) !== 'audits' || extname(destinationPath) !== '.md') {
    throw new Error('Pass the intended Markdown filename inside the audits directory.');
  }

  const raw = readFileSync(draft);
  if (!isUtf8(raw) || raw.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    throw new Error('The report draft must be UTF-8 without a byte order mark.');
  }
  const contents = fillCounts(raw);
  if (validate || forbid.length) {
    const { checkBytes } = require('./check-report.cjs');
    const errors = checkBytes(contents, destinationPath, forbid);
    if (errors.length) throw new Error(`Report validation failed:\n- ${errors.join('\n- ')}`);
  }
  try {
    mkdirSync(directory);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!lstatSync(directory).isDirectory()) {
    throw new Error('The audits path must be a real directory within the target.');
  }
  const temporaryDirectory = mkdtempSync(join(directory, '.report-'));
  const temporaryReport = join(temporaryDirectory, 'complete');

  try {
    writeFileSync(temporaryReport, contents, { flag: 'wx' });
    const stem = basename(destinationPath, '.md');
    for (let suffix = 1; ; suffix++) {
      const name = suffix === 1 ? `${stem}.md` : `${stem}-${suffix}.md`;
      const candidate = join(directory, name);
      try {
        // A hard link exposes the complete file only if the candidate is still free.
        linkSync(temporaryReport, candidate);
        return candidate;
      } catch (error) {
        if (error.code === 'EEXIST') continue;
      }
      // Without hard links (FAT, some network shares), publishers reserve the name with a lock directory, then
      // rename the complete file into place, so a reader never sees a partial report.
      // shortcut: a non-publisher creating the same name between the check and the rename would be replaced.
      const lock = `${candidate}.lock`;
      try {
        mkdirSync(lock);
      } catch (error) {
        if (error.code === 'EEXIST') continue;
        throw error;
      }
      try {
        if (lstatSync(candidate, { throwIfNoEntry: false })) continue;
        renameSync(temporaryReport, candidate);
        return candidate;
      } finally {
        rmdirSync(lock);
      }
    }
  } finally {
    rmSync(temporaryReport, { force: true });
    rmdirSync(temporaryDirectory);
  }
}

try {
  const args = process.argv.slice(2);
  const usage = 'Usage: node publish-report.cjs [--check] [--forbid <regex>]... <draft-file> <report-path>';
  const flags = ['--check', '--forbid'];
  const [draft, destination] = args.slice(-2);
  if (!draft || !destination || flags.includes(draft) || flags.includes(destination)) throw new Error(usage);

  const options = args.slice(0, -2);
  const forbid = [];
  let validate = false;
  for (let i = 0; i < options.length; i++) {
    if (options[i] === '--check') {
      validate = true;
    } else if (options[i] === '--forbid') {
      const { compileForbiddenPattern } = require('./check-report.cjs');
      forbid.push(compileForbiddenPattern(options[++i], flags));
    } else {
      throw new Error(usage);
    }
  }
  console.log(publishReport(draft, destination, validate, forbid));
  // Removing the draft spares agents a delete that may need extra permission. Only a draft in the temp folder
  // and outside the audited target is removed, so a mistyped path never deletes a project file, even for a
  // project that itself lives in the temp folder.
  const draftPath = realpathSync(draft);
  const inside = (folder) => {
    const rel = relative(realpathSync(folder), draftPath);
    return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
  };
  if (inside(tmpdir()) && !inside(dirname(dirname(resolve(destination))))) rmSync(draft);
  else console.error(`Draft kept: ${draft} is not a temporary file outside the audited target.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
