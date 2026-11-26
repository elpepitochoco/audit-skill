# Audit

An agent skill that audits code, documents, data or processes. It compares an observed state with explicit criteria and produces verifiable findings, ranked by impact, with proposed fixes. Each run adds a Markdown report to `audits/` in the audited project. Keep that folder, committed or not, so the next run can compare with it.

## Install

Built for Claude, Codex and Gemini. Tested so far with Claude Code and Codex; Gemini is not tested yet.

From the root of the project to audit:

```sh
npx skills add elpepitochoco/audit-skill
```

The [skills](https://github.com/vercel-labs/skills) installer asks which agents to set up. Add `-g` to install it for your user instead of the project.

Without Node.js, copy the folder from a fresh clone. These commands replace an existing copy of the skill. Bash (Linux, macOS, Git Bash):

```sh
src=$(mktemp -d) && git clone --depth 1 https://github.com/elpepitochoco/audit-skill.git "$src" \
  && mkdir -p .agents/skills && rm -rf .agents/skills/audit && cp -r "$src/.agents/skills/audit" .agents/skills/ \
  && rm -rf "$src"
```

PowerShell (Windows):

```powershell
$src = Join-Path $env:TEMP ([guid]::NewGuid())
git clone --depth 1 https://github.com/elpepitochoco/audit-skill.git $src
if ($LASTEXITCODE -eq 0) {
  New-Item -ItemType Directory -Force .agents\skills | Out-Null
  Remove-Item -Recurse -Force .agents\skills\audit -ErrorAction SilentlyContinue
  Copy-Item -Recurse "$src\.agents\skills\audit" .agents\skills\
  Remove-Item -Recurse -Force $src
}
```

For Claude Code, replace `.agents` with `.claude` in the destination. The skill is the [`audit`](.agents/skills/audit/) folder in the [Agent Skills](https://agentskills.io/specification) format: [`SKILL.md`](.agents/skills/audit/SKILL.md), [`references/`](.agents/skills/audit/references/) and optional [`scripts/`](.agents/skills/audit/scripts/). Copy the whole folder where the tool accepts it; the skill works from the Markdown files alone.

| Tool | In a project | For personal use | Invoke |
| --- | --- | --- | --- |
| Codex | `.agents/skills/audit/` | `~/.agents/skills/audit/` | `$audit` |
| Claude Code | `.claude/skills/audit/` | `~/.claude/skills/audit/` | `/audit` |
| Gemini CLI | `.agents/skills/audit/` | `~/.agents/skills/audit/` | ask to use the `audit` skill |
| Claude web | Zip the `audit` folder, keeping the folder inside the archive, and upload it in **Customize → Skills**. | | ask to use the `audit` skill |
| Gemini web | Markdown only: upload `SKILL.md` in **Customize → Skills** and attach the files from `references/`. The scripts are not used. | | ask to use the `audit` skill |

In Gemini CLI, project skills load only in a [trusted folder](https://geminicli.com/docs/cli/trusted-folders/).

The scripts check the report format and publish it without overwriting an earlier one. They need Node.js 18.14 or later; without Node.js the agent writes the report directly.

Official documentation: [Codex](https://learn.chatgpt.com/docs/build-skills) · [Claude Code](https://code.claude.com/docs/en/skills) · [Claude web](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills) · [Gemini CLI](https://geminicli.com/docs/cli/skills/) · [Gemini web](https://support.google.com/gemini/answer/17094296)

## Try it

- Whole repository, built-in grid: `Use the audit skill on this repository.`
- A change against its goal: `Use the audit skill on the last commit, against the goal in its message.`
- Your own rules only: `Use the audit skill with only the criteria in docs/rules.md, on src/.`

Each run writes a report in `audits/` with findings ranked by priority, their evidence and a proposed fix. See [a complete example](examples/2026-11-26_10-00-00-publications.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md). Benchmark results are in [acceptance/RESULTS.md](acceptance/RESULTS.md).

## License

[MIT](LICENSE)
