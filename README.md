# metric-definition-check

Check a metric dictionary before dashboards and reports are built on it. Give it the written definitions of your business measures,
such as revenue, active customers, churn or on-time delivery, as YAML or JSON, and, if you have it, the list of reports and the
metrics they show, and it reports the mistakes that make two reports show two different numbers for one name: a name or an alias
used by two metrics, a metric with no definition, no formula, no unit, no grain, no owner, no source or no period, a sum of a
currency and a count, a formula that names a metric that is not there, metrics that depend on each other in a circle, an active
metric built on a draft or a deprecated one, a deprecated metric with no replacement, two metrics with one formula, a ratio with a
missing numerator or denominator, and, for the reports, a metric that is not in the dictionary, a label that is not the name, a
deprecated metric that is still shown, one label for two metrics and a report with no owner. It fails the run on the level you
set, so the two files can be checked on every change.

**The tool reads the text of two files. It never connects to data, a database or a BI tool, and it never runs a formula. It checks
the wording and the structure of the definitions, not whether the numbers are right: a clean result means only that none of the
problems of its checks were found in the files. It is not a data quality tool and it is not an audit.** Every check is a best
practice of this tool: no standard sets any of them, and the reports say so. It reads the files you give it and nothing else: it
contacts nothing over the network, runs nothing, needs no key, reads no clock and writes nothing.

The mistakes in these files tend to be the same: a name used twice, a definition that only says the name again, a rate with no
denominator, a count with no period, a metric that depends on a draft, a deprecated metric that is still on a dashboard, an alias
that belongs to two metrics. They get past a read of the file by eye and are cheap to find in a file. This tool reads them on every
build and points at the line.

- **The dictionary.** An id used twice, a name or an alias used by two metrics, a metric with no written definition, a definition
  that only repeats the name, no formula, no unit, no grain, no owner, no source system, no status, and no period or time window for
  a rate, a ratio or a count.
- **How the metrics fit together.** A sum of terms whose declared units differ, a formula that names a metric that is not in the
  dictionary (with the nearest id), a circle, a metric finer than the metrics it is built on with no aggregation note, an active
  metric built on a draft or a deprecated one, a deprecated metric with no `replaced_by`, a `replaced_by` that goes nowhere, two
  metrics with one formula, and a ratio with its numerator or denominator not stated.
- **The reports.** A report that shows a metric id that is not in the dictionary, a label that is neither the name nor an alias, a
  deprecated metric, one label used for two different metrics, and a report with no owner.
- **A summary.** The number of metrics for each status, owner and grain, and what the reports show, in every report.
- **Formulas that are only read.** A formula is written as text, with `{metric_id}` for another metric, or as a structure. The tool
  finds the metrics it names and the terms it adds, and compares them as text. It never runs it.
- **Checks with ids.** Twenty-eight checks, each marked as a check of a file, of the dictionary or of the reports, each with what it
  looks at, what to change, why it is a check at all and what it cannot see. Each message says what was found and where, as
  file:line.
- **Readers of its own.** A small, documented subset of YAML, JSON and a strict CSV reader, all with the line and column of every
  key or cell. They refuse what they do not read (anchors, tags, a key written twice, a stray quote) instead of guessing.
- **Bounded work.** Hundreds of thousands of metrics, brackets nested a hundred thousand deep, a ring of a hundred thousand metrics
  that name each other and a table of one label repeated on every row all end in good time, and no function calls itself.
- Reports as text, markdown, JSON, SARIF and JUnit XML (one test case for each check), with an exit code for a pipeline: `0` no
  finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 298
pass 296
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link
or a device (a link to a file, a link to a folder, and `/dev/null` named as a file); they are guarded with `process.platform`, run on
Linux and macOS where they apply, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their
time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/metric-definition-check.git
cd metric-definition-check
node bin/metric-definition-check.js examples/bad/metrics.yaml --reports examples/bad/reports.csv
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/metric-definition-check analytics/metrics.yaml --reports analytics/reports.csv
```

To check the dictionary on its own, before there is a list of reports:

```
node bin/metric-definition-check.js examples/bad/metrics.json
```

To see why a check exists, what it cannot see and what to change:

```
node bin/metric-definition-check.js --explain name-clash
node bin/metric-definition-check.js --list-checks
```

To show each check as a test in a build system:

```
node bin/metric-definition-check.js analytics/metrics.yaml --reports analytics/reports.csv --format junit > junit.xml
```

`examples/` holds made-up dictionaries and reports for made-up businesses. The good ones, in `examples/good`, are an online shop
dictionary in YAML with its reports in YAML, and a subscription product dictionary in JSON with its reports as a CSV table; each
metric has a definition of its own, a formula, a unit, a grain, an owner, a source and a status, each rate and count has a period,
no name belongs to two metrics, a deprecated metric points at the metric that replaces it, and every label of a report is a name
or an alias; they pass every check at error, warning and info level. The bad ones, in `examples/bad`, are the shop dictionary
with a mistake of most checks (an id used twice, a name that is also an alias, a definition that is the name, a missing formula, unit,
grain, owner, source, status or period, a sum of a currency and a count, a formula that names a metric that is not there, a circle,
a grain finer than its input, an active metric on a deprecated one, bad `replaced_by`, a copy of a formula, a ratio with no parts)
with reports that show an unknown metric, a label that is not the name, a deprecated metric and one label for two metrics; a
subscription dictionary and reports in JSON with mistakes; a dictionary with circles; reports (`reports.yaml`) to set against the
good dictionary; and a dictionary and a table that cannot be read.

## Usage

```
metric-definition-check <dictionary file> [--reports <reports file>] [options]
metric-definition-check --list-checks
metric-definition-check --explain <id>
```

```
--reports <file>        the reports file: YAML or JSON with a reports list, or a CSV table (a name ending in .csv or .tsv)
--format <name>         text, markdown, json, sarif or junit (default: text)
--json                  the same as --format json
--disable <ids>         comma-separated ids of checks to leave out
--min-severity <level>  the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>       the lowest level of a finding that fails the run: info, warning, error (default: error)
--list-checks           list the checks with their level and kind, and exit
--explain <id>          explain one check: what it looks at, what to change, what it cannot see, and exit
--help                  show the usage
--version               show the version
```

[docs/inputs.md](docs/inputs.md) is the format of the dictionary, the notation of formulas, the YAML subset the tool reads and the
two forms of the reports file, with a short dictionary that passes every check. The path in the report is relative to the folder
you run the command in, with forward slashes on every system, followed by the line.

## A sample run

The shop dictionary and reports in `examples/bad`, as the tool reports them (the head, the table of metrics for each status, two
of the findings, and the end; `examples/output` holds the whole report in every format):

```
metric-definition-check: examples/bad/metrics.yaml + examples/bad/reports.csv
dictionary file: examples/bad/metrics.yaml (yaml, 221 lines, 6,354 bytes)
reports file: examples/bad/reports.csv (csv, 8 lines, 346 bytes)
dictionary: Online shop metric dictionary (with mistakes): 21 metrics
reports: 2 reports, 6 metrics shown, 6 different metrics; 15 metrics of the dictionary on no report
findings: 38 (16 error, 22 warning)
```

```
Metrics for each status

  status      metrics
  active      15
  deprecated  3
  (not set)   2
  draft       1
```

```
  ERROR    name-clash                 examples/bad/metrics.yaml:47
           The name "Revenue" is used by two metrics: "Revenue" at line 36 and "Net revenue" at line 47 (one of them as an alias).
           fix: Give each metric a name of its own that says what is different (for example "Revenue (booked)" and "Revenue (recognised)"), and remove the alias from the metric that does not own it.

  ERROR    report-label-clash         examples/bad/reports.csv:7
           The report "Finance pack" shows "Gross margin" under the label "Revenue", the label that Finance pack uses for "Revenue" (line 5).
           fix: Give each metric one label of its own on every report, so a reader who sees the label in two places gets the same number.
```

```
This report reads the dictionary file and the reports file and nothing else. It never connects to data and never runs a formula. A clean result means that none of the problems of its checks were found in them; it is not a statement that the definitions are right, that the numbers are correct or that the reports show what they say.

RESULT: FAIL - 16 findings at or above error (16 error, 22 warning)
```

The shop dictionary in `examples/good` with its reports:

```
metric-definition-check: examples/good/metrics.yaml + examples/good/reports.yaml
dictionary file: examples/good/metrics.yaml (yaml, 174 lines, 6,067 bytes)
reports file: examples/good/reports.yaml (yaml, 23 lines, 577 bytes)
dictionary: Online shop metric dictionary: 14 metrics
reports: 3 reports, 8 metrics shown, 8 different metrics; 6 metrics of the dictionary on no report
findings: 0
```

```
This report reads the dictionary file and the reports file and nothing else. It never connects to data and never runs a formula. A clean result means that none of the problems of its checks were found in them; it is not a statement that the definitions are right, that the numbers are correct or that the reports show what they say.

RESULT: PASS - no finding at or above error
```

## How the files are read

- The dictionary file is read as JSON when its first character is `{` or `[`, and as the YAML subset otherwise. The reader keeps the
  line and column of every key, so a finding points at the line.
- The reports file is read as a CSV table (a comma or a tab) when its name ends in `.csv` or `.tsv`, and as JSON or the YAML subset
  otherwise. A quote that is never closed, text after a closing quote, a missing required column and a semicolon as the delimiter are
  refused with the line and column.
- A syntax error is a `file-unreadable` finding with its line and column, and no other check of that file runs. The run fails; a
  file that cannot be read never passes.
- A metric or a row is read as far as it can be: a value that is not what the format says is a finding, and the check that needs it
  does not take it for one that is fine.
- A metric is found by its id without case and extra spaces. When an id is used twice, the first metric is the one that formulas and
  reports point at.
- A file that is larger than 16 MiB, a link, a folder, a device, an address and text that is not UTF-8 or UTF-16 stop the run with
  exit code `2` and no report.

## What it checks

| Check | Level | What it looks at |
| --- | --- | --- |
| file-unreadable | error | a file cannot be followed by the reader (a syntax error in the YAML subset or the JSON, a dictionary with no metrics, a reports table with a quote that is never closed or a header without the columns it needs, or a file past a limit); no other check ran on that file |
| field-invalid | error | a value is not what the format says: a metric with no id or no name, a status that is not active, draft or deprecated, a type the tool does not know, a formula that cannot be followed (a { never closed, an op with no args), a value that is not text, or a row with the wrong number of cells |
| field-unknown | warning | a key of the dictionary, of a metric, of the reports file or of a report, or a column of a reports table, that the tool does not read, often a misspelt name such as defintion or ownr; what is under it is not checked |
| metric-duplicate-id | error | two metrics with the same id (compared without case and without extra spaces) |
| name-clash | error | one name or alias used by two different metrics (compared without case and without extra spaces): the classic way two reports show two numbers under one name; a deprecated metric that names the other in replaced_by is left out |
| metric-no-definition | error | a metric with no written definition: nothing says in words what is counted or measured |
| definition-repeats-name | warning | a definition that is only the name said again, such as "Revenue" for the metric Revenue or "The number of active customers" for Active customers |
| metric-no-formula | error | a metric with no formula (no "formula" key, or an empty one): nothing says how the number is worked out |
| metric-no-unit | warning | a metric with no unit (currency, count, percent, days and so on) |
| metric-no-grain | warning | a metric with no grain: nothing says the level it is calculated at (order, day, customer and so on) |
| metric-no-owner | warning | a metric with no owner: nobody is named who decides what the definition is |
| metric-no-source | warning | a metric with no source system: nothing says where the data comes from |
| metric-no-status | warning | a metric with no status (active, draft or deprecated); the tool reads it as active for the other checks |
| metric-no-period | warning | a rate, a ratio or a count with no period or time window rule (no "period" key): "active customers" in which days, "churn" over what month; a metric of type snapshot is left out |
| formula-unit-mismatch | error | a formula that adds or subtracts metrics whose declared units differ, such as a currency amount and a count; only terms that are exactly one metric are compared |
| formula-unknown-metric | error | a formula, a numerator or a denominator that names a metric id that is not in the dictionary |
| metric-circular | error | metrics that depend on each other in a circle, directly (a metric that names itself) or through others |
| grain-finer-than-input | warning | a metric built from other metrics whose grain is finer than one of them, with no "aggregation" note: a daily figure made from a monthly one, an order-level figure made from a customer-level one |
| active-uses-inactive | error | an active metric whose formula, numerator or denominator names a metric that is draft or deprecated |
| deprecated-no-replacement | warning | a deprecated metric with no "replaced_by" |
| replaced-by-invalid | error | a "replaced_by" that names a metric that is not in the dictionary, is the metric itself or is deprecated |
| formula-duplicate | warning | two metrics with the same formula and the same filters under different names (the formula compared as text without case and spaces, or as the same structure); a deprecated metric that names the other in replaced_by is left out |
| ratio-parts-missing | warning | a ratio or a rate whose numerator or denominator is not stated: no "numerator" and "denominator", and no division in the formula that has something on each side |
| report-unknown-metric | error | a report that shows a metric id that is not in the dictionary |
| report-label-differs | warning | a report that shows a metric under a label that is neither its name nor one of its aliases |
| report-shows-deprecated | warning | a report that shows a deprecated metric |
| report-label-clash | error | one label used for two different metric ids in the reports (a metric shown with no label counts under its name) |
| report-no-owner | warning | a report with no owner (in a table, when the table has an owner column) |

Every check is a best practice of this tool; `--explain <id>` says why it exists, what to change and what it cannot see.

## What is not checked

- Whether the definitions are right. The tool checks that they are written down, that they say more than the name, and that no two
  metrics share a name.
- Whether the numbers are right. It never runs a formula and never sees data, so it is not a data quality tool.
- Whether a formula is right. It reads the metrics a formula names, the terms it adds and whether it divides. It does no algebra
  with units, and a formula written in another order or a text formula and a structure for one sum are not seen as the same.
- Two names for one measure. "Sales" and "Revenue" are two names to the tool.
- Whether a report really shows what the list says, or whether a dashboard has a filter on. It reads a list.
- Whether an owner exists or a status is true. It looks for text.
- Whether the dictionary is complete for the business, or whether every report is in the list.
- The export formats of any BI tool or semantic layer. Convert the dictionary and the list of reports to the formats of
  docs/inputs.md first.
- Whether the dictionary has been reviewed by anybody. It is not an audit.

[docs/limits.md](docs/limits.md) has the full list.

## Formats

- `text` for a terminal, `markdown` for a job summary or a pull request comment.
- `json` is the report object the other formats are built from.
- `sarif` is SARIF 2.1.0, for code scanning: the checks are the rules and each finding with a place in a file is a result with its
  line and column.
- `junit` has one test case for each check, a failure for a check with findings, a skip with the reason for a check that did not run
  and an error when a file could not be read. Every time is 0.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No finding at or above the `--fail-on` level (default `error`). |
| `1` | At least one finding at or above it. |
| `2` | A usage error, or a file that cannot be read at all (missing, a link, a folder, too large, not text); no report. |

`--min-severity` hides findings from the listing and never changes the exit code.

## Limits

A file past 16 MiB, a YAML file of more than 1,000,000 lines, 40 levels of nesting, a dictionary of more than 200,000 metrics, a
reports file of more than 100,000 reports, and a table of more than 500,000 rows, 50 columns, 3,000,000 cells or a cell of 20,000
characters is refused whole. Up to 1,000 findings of one check are listed; the rest are counted. See docs/limits.md.

## Architecture

```
bin/metric-definition-check.js   the command
src/cli.js                       arguments and the exit code
src/check.js                     options, a run, the summary, the report object
src/yaml.js, src/json.js         the two readers of the dictionary and the reports file, with line and column
src/csv.js                       the reader of a reports table, with line and column
src/nodes.js                     the tree the readers build
src/formula.js                   reading a formula as text or as a structure, never running it
src/dictionary.js                the model of a dictionary: metrics, keys, status, type, formula
src/reports.js                   the model of a reports file, from a table or from YAML and JSON
src/checks.js                    the checks of the dictionary and of the reports, and the circles
src/rules.js                     the 28 checks: id, level, kind, text
src/report.js                    text, markdown, JSON, SARIF, JUnit
src/files.js, text.js, size.js   reading a file, cleaning text, numbers
tools/check.mjs                  the repository checks that run next to the tests
tools/example.mjs                runs the examples and writes examples/output
```

## Where the ideas come from

- The idea of one written definition for each measure, with an owner, a unit, a grain and a status, is the common advice of anyone
  who has been in a meeting about why two dashboards disagree. It is the idea behind the metric layers and the data catalogues
  that teams keep. This tool checks a plain file in that style; it holds no metrics for you and serves none.
- Naming a metric, an alias and a label once, and keeping deprecated metrics pointing at their replacement, are the common advice
  of anyone who has had to retire a metric. The checks look for the places where that advice was not followed.
- The ladders of grain, the words that mark a rate or a count, and the filler words dropped when a definition is compared with a
  name are the choice of this tool and are listed in docs/inputs.md.

docs/context.md says what checking these files is good for and where it misleads, docs/method.md has the method, docs/decisions has
the decisions, docs/threat-model.md and docs/secure-defaults.md have the security notes.

## License

MIT, see [LICENSE](LICENSE).
