#!/bin/sh
# Build the release-process repository for case 37 in $1.
set -e
R=$1; cd "$R"
w() { printf '%s\n' "$2" > "$1"; }
w package.json '{ "name": "relay", "version": "0.1.0", "private": true }'
w index.js 'module.exports = () => "relay";'
w RELEASE.md '# Release procedure

Every release follows these steps, in order:

1. Bump `version` in `package.json`.
2. Add a section for the version at the top of `CHANGELOG.md`.
3. Get two maintainer approvals on the release pull request.
4. Tag the release commit `vX.Y.Z`, matching `package.json`.'
w CHANGELOG.md '# Changelog

## 0.1.0

- First release.'
git add . && git commit -qm "Release 0.1.0" && git tag v0.1.0
w index.js 'module.exports = (name) => `relay ${name}`;'
w CHANGELOG.md '# Changelog

## 0.2.0

- Greet by name.

## 0.1.0

- First release.'
git add . && git commit -qm "Greet by name" && git tag v0.2.0
w package.json '{ "name": "relay", "version": "0.3.0", "private": true }'
w index.js 'module.exports = (name = "world") => `relay ${name}`;'
git add . && git commit -qm "Default name, release 0.3.0" && git tag v0.3.0
