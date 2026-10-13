# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows
and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the
repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!`
for a breaking change.

This tool reads a metric dictionary, written as YAML or JSON, and a list of reports, written as YAML, JSON or CSV. It checks the
wording and the structure of the two files. It never connects to data or a BI tool, and it never runs a formula. It is not a data
quality tool and not an audit. A change must keep it that way: a check reports what the files hold, and the tool never contacts
anything over the network, never writes, submits or signs anything, and never fetches, opens, runs or evaluates what it reads.

## Never a secret, never a real business

The tool never asks for a key or a token, and never looks up a metric, an owner or a source system. Do not add an option, a key or a
test that gives it one: the checks are about the text as written. Never paste data of a real business, the name of a real company, a
key or a token into an issue, a pull request or an example; use made-up metrics, owners and reports.

## Never a claim that the numbers are right, never a made-up rule

Every check is a best practice of this tool, and says so in `own` in src/rules.js. No standard sets any of them. Do not write a
message, a document or an example that reads as a statement that a dictionary is right, that a number is correct or that a report
has been through a review or an approval. The words the tool uses to guess that a metric is a rate or a count, and the ladders of
grain, are the choice of this tool and are documented in docs/inputs.md.

## Changing a check

1. Describe the change in docs/method.md first: what the check looks at and what it can and cannot see, and add what it cannot see
   to docs/limits.md. Say in `own` in src/rules.js that it is a best practice of the tool, and why the tool asks for it.
2. Keep the checks to what is written. A finding must point at something a reader can check in the files: a file, a line and a
   column. Never add a check that needs the network, data, a registry, a key or the clock.
3. A check says what to change, in `fix` in src/rules.js, what it cannot see, in `cannot`, and is marked as a check of a file, of
   the dictionary or of the reports in `kind`.
4. A run must never pass because something could not be read: a file that is not a dictionary or a reports file is an error
   finding, a key that is unknown or written twice is a finding that names it, and a check that did not run is shown as skipped or
   not-evaluated with the reason.
5. Add a test with the dictionary and the reports written inline (`base()`, `metric()`, `dictText()`, `withMetric()`,
   `reportsText()`, `reportsCsv()`, `idsAfterMetric()`, `idsAfterReports()`, `ofCheck()`, `idsOf()`, `run()` and `cli()` in
   test/helpers.js), small enough to work out by hand, with a near miss on each side: the input that is reported and the one next
   to it that is not.
6. A check id, once released, keeps its meaning: pipelines and other tools read it from the JSON, SARIF and markdown output.

## Changing the readers and the checks

1. The readers (src/yaml.js, src/json.js, src/csv.js and src/formula.js) keep their limits (`WORK_LIMITS` in src/data.js) and work
   through a stack and a loop; they have no recursion, and neither have the checks. A test fails when a function of src calls
   itself.
2. The YAML reader reads the subset of docs/inputs.md. A feature that is added is written there with an example and a test, and the
   reader keeps refusing what it does not read, with the line and column, instead of guessing. `yes` and `no` stay text.
3. The CSV reader refuses what it cannot follow and never keeps the first rows of a long file and goes on.
4. The formula reader reads words, braces, numbers, operators and parentheses, and a structure of op, args, metric, field and
   value. It never evaluates and never builds a pattern. A new way to write a formula goes in docs/inputs.md with a test.
5. Names from the files are kept in maps and sets, never set as properties of an object. A test builds a dictionary whose ids,
   names, aliases and labels are named `__proto__` and `constructor`.
6. No pattern is built from a file or an argument. A test fails when `new RegExp` appears in src outside src/text.js.
7. The checks visit each metric and each row a bounded number of times and never compare every pair. Hostile tests with hundreds of
   thousands of metrics and rows check it. A lookup of the nearest id stays bounded.
8. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when coverage
   is on, and allow four times the time (`allowed()` in test/helpers.js). Run `npm run test:coverage` before you open the pull
   request.
9. Files written with LF, CRLF or CR line ends, as UTF-8 with or without a byte order mark or as UTF-16 with one, must give the same
   findings.

## The examples

The files under `examples/` are made-up input for the tool: dictionaries and reports for a shop and a subscription product that
pass every check at error, warning and info level, and files that hold a mistake of every check, with made-up ids and no key, no
date and no real company. A change to them goes with the real output that `npm run example` writes to `examples/output`.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device) is guarded with `process.platform` and says why in its
`skip`. A test never asserts a line number written by hand: a line is worked out with `lineOf()` of test/helpers.js or from the
text itself. Every other test builds its paths with `resolve()` from names with forward slashes, and a test never writes a
backslash, a bar, a star, a question mark or a quote into a file name, because Windows refuses them.

A test never reads the clock, the time zone of the machine or the locale. A test never asserts the hash or the version of a GitHub
Action: Dependabot changes them, and the test checks only that each action is pinned to a full commit with a version comment.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network connection,
  signs nothing, runs no program and evaluates nothing it reads.
- Text from the input, file names, metric names, owners and labels included, goes through `safeText` before it reaches the output
  or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No file carries a date in its prose, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0), counts,
  sizes and the number of a standard (SARIF 2.1.0, NIST SP 800-218) are fine.
- Examples and tests use made-up metrics, owners and reports.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
