const fs = require('node:fs');
const { dataFile } = require('./config');

function load() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function save(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

module.exports = { load, save };
