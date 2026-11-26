'use strict';

const SCOPE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPORT_NAME = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-(.+)\.md$/;

function validLocalTime(localIso) {
  // Check the calendar fields without applying the machine's local time zone.
  const utc = localIso + '.000Z';
  const date = new Date(utc);
  return Number.isFinite(date.getTime()) && date.toISOString() === utc;
}

function parseReportName(name) {
  const match = REPORT_NAME.exec(name);
  if (!match) return null;
  const [, timestamp, scopeAndSuffix] = match;
  if (!SCOPE_SLUG.test(scopeAndSuffix)) return null;

  const iso = `${timestamp.slice(0, 10)}T${timestamp.slice(11).replaceAll('-', ':')}`;
  if (!validLocalTime(iso)) return null;

  return { timestamp, scopeAndSuffix };
}

function parseReportDate(value = '') {
  const match = /^(\d{4}-\d{2}-\d{2})[ \t]+(\d{2}:\d{2}:\d{2})(?=$|[ \t])(.*)$/.exec(value.trim());
  if (!match) return null;
  const [, date, time, suffix] = match;
  const localIso = `${date}T${time}`;
  if (!validLocalTime(localIso)) return null;
  const offset = /(?:^|[ (,])(?:UTC)?([+-][a-z0-9:]+)(?=$|[ )])/i.exec(suffix)?.[1];
  if (offset && !/^[+-]\d{2}:\d{2}$/.test(offset)) return null;
  const instant = offset ? Date.parse(localIso + offset) : null;
  if (offset && !Number.isFinite(instant)) return null;

  return { timestamp: `${date}_${time.replaceAll(':', '-')}`, instant };
}

module.exports = { parseReportName, parseReportDate, SCOPE_SLUG };
