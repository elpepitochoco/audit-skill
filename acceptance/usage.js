#!/usr/bin/env node
// Sum token usage per agent step from run.sh logs, to compare skill versions and runs without the skill.
// Usage: node acceptance/usage.js <runs-dir>/<tool>/logs...   Prints one line per step and a total per directory.
// Claude Code steps come from <repo>-<label>.last.txt (--output-format json); Codex steps from <repo>-<label>.log (--json).
'use strict';
const fs = require('fs');
const path = require('path');

function claudeStep(text) {
  const run = JSON.parse(text);
  const u = run.usage || {};
  return {
    input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    output: u.output_tokens || 0,
    seconds: Math.round((run.duration_ms || 0) / 1000),
  };
}

function codexStep(text) {
  const step = { input: 0, output: 0, seconds: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'turn.completed' || !event.usage) continue;
    step.input += event.usage.input_tokens || 0;
    step.output += event.usage.output_tokens || 0;
  }
  return step;
}

function usage(logs) {
  // Every step with a .last.txt or .log file is listed; one without readable usage is marked missing, not dropped.
  const found = new Map();
  for (const name of fs.readdirSync(logs).sort()) {
    const ext = name.endsWith('.last.txt') ? '.last.txt' : name.endsWith('.log') ? '.log' : null;
    if (!ext) continue;
    const step = name.slice(0, -ext.length);
    if (!found.has(step)) found.set(step, null);
    const text = fs.readFileSync(path.join(logs, name), 'utf8');
    if (ext === '.last.txt' && text.trimStart().startsWith('{')) {
      try { found.set(step, claudeStep(text)); } catch {}
    } else if (ext === '.log' && text.includes('"turn.completed"')) {
      found.set(step, codexStep(text));
    }
  }
  return [...found].map(([step, u]) => (u ? { step, ...u } : { step, missing: true }));
}

if (require.main === module) {
  for (const logs of process.argv.slice(2)) {
    const steps = usage(logs);
    const counted = steps.filter((s) => !s.missing);
    const total = counted.reduce((t, s) => ({ input: t.input + s.input, output: t.output + s.output }), { input: 0, output: 0 });
    for (const s of steps) {
      console.log(s.missing ? `${logs}\t${s.step}\tmissing: no usage in its logs`
        : `${logs}\t${s.step}\tin=${s.input}\tout=${s.output}${s.seconds ? `\ts=${s.seconds}` : ''}`);
    }
    const gap = steps.length - counted.length;
    console.log(`${logs}\tTOTAL\tin=${total.input}\tout=${total.output}${gap ? `\tINCOMPLETE: ${gap} step(s) missing` : ''}`);
  }
}

module.exports = { usage };
