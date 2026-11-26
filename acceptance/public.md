# Public benchmarks

The fixtures in this folder are ours, so nobody else can check the answers. These cases run the skill on public repositories whose defects are documented by their authors, at a pinned commit, so anyone can replay a run and score it the same way.

Each case covers an audit type that the fixtures alone could not compare with outside work:

| Case | Repository (pinned commit) | Audit type | Published answers | Prompt |
| --- | --- | --- | --- | --- |
| `nodegoat` | [OWASP/NodeGoat](https://github.com/OWASP/NodeGoat) `c5cb68a` | Security, whole web app (Node.js) | OWASP Top 10 tutorial in the app; each flaw has a commented fix next to it | Audit the security of this application. |
| `juiceshop` | [juice-shop/juice-shop](https://github.com/juice-shop/juice-shop) `c9f9922` | Security, large TypeScript app, scoped to `routes/` | [Challenge list](https://pwning.owasp-juice.shop) and coding-challenge snippets | Audit the security of `routes/`. |
| `benchmark` | [OWASP-Benchmark/BenchmarkJava](https://github.com/OWASP-Benchmark/BenchmarkJava) `10dfcc5` | Security, Java servlets, false-positive rate | `expectedresults-1.2.csv`: real or not for each test | Audit the security of 22 servlets (one real and one false case per category). |
| `leaky` | [Plazmaz/leaky-repo](https://github.com/Plazmaz/leaky-repo) `2e95135` | Secrets and sensitive data | README table of 43 leaking files | Audit secrets and sensitive data in this repository. |
| `actions` | [step-security/github-actions-goat](https://github.com/step-security/github-actions-goat) `4da23c8` | CI/CD configuration (GitHub Actions) | `docs/` solutions and vulnerability pages | Audit the CI configuration. |
| `goof` | [snyk-labs/nodejs-goof](https://github.com/snyk-labs/nodejs-goof) `add14ba` | Dependencies | README list of exploitable packages; any advisory database for the pinned versions | Audit the project's dependencies. |
| `terragoat` | [bridgecrewio/terragoat](https://github.com/bridgecrewio/terragoat) `729f8da` | Infrastructure as code, deployment configuration | Comments in the Terraform files; [Checkov](https://github.com/bridgecrewio/checkov) gives the same list | Audit the security of the AWS Terraform configuration in `terraform/aws/`. |
| `quixbugs` | [jkoppel/QuixBugs](https://github.com/jkoppel/QuixBugs) `4257f44` | Quality / Behavior and error handling, Tests | Each of the 40 programs has one one-line defect, fixed in `correct_python_programs/` | Audit the behavior of the programs in `python_programs/` against their docstrings. |
| `hospital` | [BigDaMa/raha](https://github.com/BigDaMa/raha) `7be1334`, `datasets/hospital/dirty.csv` | Data quality | `clean.csv`: 509 cells differ, each with one letter replaced by `x` | Audit the data quality of hospital.csv. |
| `bad` | [W3C Before and After Demonstration](https://www.w3.org/WAI/demos/bad/), four "before" pages | Accessibility | W3C [evaluation reports](https://www.w3.org/WAI/demos/bad/before/reports/home.html): failed WCAG criteria per page | Audit the accessibility of the four pages in this repository. |
| `nplus` | [jwworth/n-plus](https://github.com/jwworth/n-plus) `d9f1f36` | Performance (optional axis) | README: N+1 queries in `users#index`, fixed with `includes` | Audit the performance of this application. |

Documentation keeps using Express (cases 27, 33, 34 and 39 in [README.md](README.md)): no public repository publishes its own documentation defects, and case 33 lists the known gaps in Express 5.1.0. Operability (logging, backup and recovery) still has no public benchmark; TerraGoat covers its deployment part.

## Run and score

From Git Bash or another POSIX shell, with network access:

```sh
sh acceptance/run.sh cc nodegoat          # or codex; any case name from the table
node acceptance/score-public.js nodegoat ../audit-runs/cc/nodegoat/audits/*.md
node acceptance/check-report.js ../audit-runs/cc/nodegoat/audits
```

The runner fetches the pinned commit once into `../audit-runs/src/` and builds a fresh repository per run. Before the first commit it deletes the benchmark's answer key so the audit runs blind: solution docs, tutorial pages, scanner output (`sarif.json`), `expectedresults-*.csv`, the `correct_*` programs, the Juice Shop `vuln-code-snippet` markers and the fix comments in the n-plus controller. The `bad` and `hospital` cases download only the audited files. `NPM_CONFIG_IGNORE_SCRIPTS=true` keeps an agent that installs a benchmark's dependencies from running their install scripts.

The scorer reads only active findings. It credits an expected item when one finding matches all its keywords, in the title first, otherwise in the bullets, and lists the findings that matched nothing. For `benchmark` it reports the true and false positive rates and their difference, the score the OWASP Benchmark uses. The match is by keyword: check every miss and every unmatched finding by hand before quoting a score, and note them in [RESULTS.md](RESULTS.md).

## Known limits

- NodeGoat and TerraGoat name their flaws in code comments ("Insecure use of eval()", "bucket is not encrypted"). They measure whether the skill reports and ranks what it reads, more than discovery.
- The expected lists are the documented flaws. A finding outside them can be right: Juice Shop alone has over 100 challenges, and the scorer lists 14 that sit in `routes/`.
- TerraGoat keys are the AWS documentation example (`AKIAIOSFODNN7EXAMPLE`). The calibration in `criteria.md` rates a placeholder-looking secret as real unless the repository proves it inert; a report that cites the AWS example and lowers the rating is also right.
- The W3C pages are fetched live, not pinned. They have not changed since 2012.
- An agent with web access can fetch the published answers. A Codex run diffed `hospital.csv` against HoloClean's clean copy. `score-public.js` warns when a report cites a known answer source; such a run is not blind.
