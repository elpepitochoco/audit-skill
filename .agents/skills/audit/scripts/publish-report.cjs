'use strict';

const { isUtf8 } = require('node:buffer');
const { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } = require('node:fs');
const { basename, dirname, extname, join, resolve } = require('node:path');

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function publishReport(draft, destination, validate, forbid) {
  const destinationPath = resolve(destination);
  const directory = dirname(destinationPath);
  if (basename(directory) !== 'audits' || extname(destinationPath) !== '.md') {
    throw new Error('Pass the intended Markdown filename inside the audits directory.');
  }

  const contents = readFileSync(draft);
  if (!isUtf8(contents) || contents.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    throw new Error('The report draft must be UTF-8 without a byte order mark.');
  }
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
        if (error.code !== 'EEXIST') throw error;
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
  // The draft lives outside the target; removing it here spares agents a delete that may need extra permission.
  rmSync(draft);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
