#!/usr/bin/env node
'use strict';

const validator = require('../.agents/skills/audit/scripts/check-report.cjs');

if (require.main === module) process.exitCode = validator.run(process.argv.slice(2));

module.exports = validator;
