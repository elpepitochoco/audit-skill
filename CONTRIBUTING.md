# Contributing

## Layout

- `.agents/skills/audit/` is the skill, the only folder users install. `SKILL.md` is the entry point, `references/` holds the rules it loads, `scripts/` the optional Node.js helpers.
- `tests/` checks the scripts and the example reports. `examples/` holds complete reports that pass the checker.

## Rules for changes

- Write in English.
- Each rule lives in one file. `SKILL.md` gives the workflow and points to the reference that owns each rule; do not repeat a rule elsewhere.
- Keep the skill usable from the Markdown files alone: a script only automates a rule that the references already state.
- A change to the report format goes in `references/report.md`, `scripts/check-report.cjs`, the tests and the examples together.

## Check a change

```sh
node --test "tests/*.test.js"
```

Node.js 22 or later runs the tests; the scripts themselves need 18.14. CI runs the same command on Linux, macOS and Windows.

To try the skill on a project, install your working copy with `npx skills add <path-to-this-repository>` or copy `.agents/skills/audit/` as described in the README. Copy it again after each change.

## Release

Bump `metadata.version` in `SKILL.md` and add an entry to `CHANGELOG.md`. Raise the major version when the grid or the report format changes in a way that makes earlier reports unfit as a baseline.
