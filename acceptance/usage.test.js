'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { usage } = require('./usage.js');

test('sums Claude Code and Codex token usage per step, cache reads apart', (t) => {
  const logs = mkdtempSync(join(tmpdir(), 'audit-usage-'));
  t.after(() => rmSync(logs, { recursive: true }));
  writeFileSync(join(logs, 'c1-run.last.txt'), JSON.stringify({ duration_ms: 2000, num_turns: 4, usage: { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 } }));
  writeFileSync(join(logs, 'c2-run.log'), [
    '{"type":"item.completed","item":{"type":"command_execution"}}',
    '{"type":"item.completed","item":{"type":"agent_message"}}',
    '{"type":"turn.completed","usage":{"input_tokens":40,"cached_input_tokens":30,"output_tokens":3}}',
    'not json',
    '{"type":"turn.completed","usage":{"input_tokens":60,"output_tokens":7}}',
  ].join('\n'));
  writeFileSync(join(logs, 'c3-run.last.txt'), 'plain text answer');
  assert.deepEqual(usage(logs), [
    { step: 'c1-run', input: 111, cached: 100, fresh: 11, output: 5, turns: 4, seconds: 2 },
    { step: 'c2-run', input: 100, cached: 30, fresh: 70, output: 10, turns: 1, seconds: 0 },
    { step: 'c3-run', missing: true },
  ]);
});
