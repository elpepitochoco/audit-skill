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
  const steps = [];
  for (const name of fs.readdirSync(logs).sort()) {
    const file = path.join(logs, name);
    const text = fs.readFileSync(file, 'utf8');
    if (name.endsWith('.last.txt') && text.trimStart().startsWith('{')) {
      try { steps.push({ step: name.slice(0, -'.last.txt'.length), ...claudeStep(text) }); } catch {}
    } else if (name.endsWith('.log') && text.includes('"turn.completed"')) {
      steps.push({ step: name.slice(0, -'.log'.length), ...codexStep(text) });
    }
  }
  return steps;
}

if (require.main === module) {
  for (const logs of process.argv.slice(2)) {
    const steps = usage(logs);
    const total = steps.reduce((t, s) => ({ input: t.input + s.input, output: t.output + s.output }), { input: 0, output: 0 });
    for (const s of steps) console.log(`${logs}\t${s.step}\tin=${s.input}\tout=${s.output}${s.seconds ? `\ts=${s.seconds}` : ''}`);
    console.log(`${logs}\tTOTAL\tin=${total.input}\tout=${total.output}`);
  }
}

module.exports = { usage };
