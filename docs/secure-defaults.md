# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest of the
document is about what the tool cannot do for you: which files you give it, where the output goes, and who may change the files it
reads. A clean result is a dictionary and a reports file with none of the problems the checks look for, not a finding that the
numbers are right: the tool reads two files, it never connects to data, it is not a data quality tool and it is not an audit.

## How the tool behaves by default

- **Reads, never writes.** The tool reads the dictionary file and the reports file it is given. It follows no symbolic link, fetches
  no URL, refuses an argument that looks like an address, contacts nothing over the network, evaluates nothing, runs no program and
  writes nothing to disk.
- **Never touches data.** It has no code that connects to a database, a warehouse, a file store or a BI tool, and needs no driver for
  one. A source system written in the dictionary is text.
- **Never runs a formula.** A formula is read as words and braces, compared as text and followed for the metrics it names. It is
  not parsed into a program, and nothing is calculated.
- **Its own readers, nothing evaluated.** The YAML subset, the JSON reader and the CSV reader are written for this tool. They
  refuse anchors, aliases, tags, mappings in braces, several documents and a key written twice, and they turn no text into an
  object or a command. A cell that starts with an equals sign or a plus sign is text.
- **Every check on from the first run.** A file the reader cannot follow, an id used twice, a name used by two metrics, a formula
  that names a metric that is not there, a circle, an active metric built on a draft or a deprecated one, a report that shows an
  unknown metric or one label for two metrics are errors; a missing unit, grain, owner, source, status or period are warnings. There
  is no configuration file of the tool that could set a check off; only the command line can, and the report names every check that
  was turned off.
- **Fail closed.** When a file cannot be read, no check of that file runs, the checks that need it are reported as not evaluated,
  and the run fails. A file past a limit of size, lines, depth, metrics, reports, rows, columns or cells is refused; it is never
  read in part.
- **No clock.** The tool reads no date and no time. The same files and options give the same report on every day, and the JUnit
  report records every time as 0.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option given twice
  stop the run, so a typo such as `--fail-no` cannot leave a default in place.
- **No pattern from the input.** No regular expression is built from a file or from an argument.
- **Bounded work.** The readers have limits (docs/limits.md), the checks visit each metric and each row a bounded number of times,
  and no function calls itself, so a large or hostile file cannot exhaust the stack, the memory or the time.
- **No prototype tricks.** Names from the files are kept in maps and sets, never set as properties of an object, so `__proto__` is
  only a name.
- **Clean output.** Text from the input, file names, metric names, owners and labels included, has control characters, line
  separators and direction controls replaced and its length capped before it reaches a report or an error message; the markdown
  report also escapes what markdown gives a meaning to, and the JUnit report escapes what XML gives a meaning to.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--fail-on warning`.** A missing unit, grain, owner, source, status or period, a definition that repeats the name, a metric
  finer than its inputs, two metrics with one formula, a label that is not the name, a deprecated metric that is still shown and a
  report with no owner fail the run too. Use it on the dictionary that dashboards are about to be built on, and record each warning
  the team keeps on purpose.
- **`--reports`.** Use it in the job that has the list of reports, so that a report that shows a metric nobody defined is found.
- **The whole dictionary.** Check the whole dictionary at once. A dictionary cut in the middle shows metrics that name others
  that are not there.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@<full commit hash> # vX.Y.Z
  - uses: actions/setup-node@<full commit hash> # vX.Y.Z
    with:
      node-version: 22
  - name: Check the metric dictionary
    run: npx --yes github:INNERLUXES/metric-definition-check analytics/metrics.yaml --reports analytics/reports.csv --format junit > metrics-junit.xml
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no key and no access to a server; never give
  it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx` runs what
  it downloads.
- Check the exact files that the next step builds on. Files edited after the check are not what was checked.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error` and keep the
  JUnit, SARIF or JSON report as an artifact of the job.
- Keep the reports with the same care as the files, because a finding quotes metric names, owners and labels.
- Treat a report built from files you do not trust as untrusted data.
- Do not put a secret in a dictionary or a reports file. The tool does not look for secrets, and a finding can quote the text it is
  about.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with `ssdf-repo-check`
pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
