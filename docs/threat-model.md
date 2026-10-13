# Threat model

metric-definition-check reads a metric dictionary written as YAML or JSON and, optionally, a reports file written as YAML, JSON or
CSV. It never connects to data or a BI tool, never runs a formula, is not a data quality tool and not an audit. This document is
about the tool itself: what it touches, what a hostile or careless file can try, and what stops it.

## What the tool touches

- It reads the dictionary file and the reports file named on the command line. Nothing else is opened, and no path, address, id or
  text written in a file is looked up, opened or followed. A source system, a formula or a field named in a file is only text.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL, follows no symbolic link, runs nothing it reads, evaluates nothing and reads no
  clock and no locale.

## What the input may hold

The files come from a person, from a colleague, from a semantic layer or BI tool that exports them, or, in a pipeline that checks
every pull request, from whoever sent the pull request. Through the files, a person can try to, or a careless run can:

- make the tool run something: an anchor, a tag or a string in the YAML that another reader would turn into an object or a command;
  a formula that something else would evaluate; a cell that a spreadsheet would read as a formula;
- make the tool reach something: a source system written as an address, a sample or a path in a note;
- exhaust the memory, the stack or the time: files of many megabytes, a million lines, brackets nested a hundred thousand deep, a
  formula of braces and parentheses nested very deep or very long, hundreds of thousands of metrics, one name on every metric, one id
  on every metric, a chain or a ring of a hundred thousand metrics that name each other, a table of a million rows, thousands of
  columns, a cell of the longest length, a line of many quotes, one label on every row of a table;
- move the result: a key written twice so that two readers see two values, a misspelt key that hides a formula from every check, an
  id or a name such as `__proto__` or `constructor` that changes how objects behave, two ids that differ only in case, a very long
  text that pushes a finding out of sight;
- rewrite the terminal or the report: control characters, escape sequences, line and paragraph separators or direction controls in
  a name, an owner, a label or a file name; markup or an XML special character in a text that ends in the markdown or the JUnit
  report;
- make the exit code lie: a file that cannot be read must not pass, a check that did not run must say so, and a metric or a row that
  was not read must not be taken for one that is fine.

## What stops it

| Risk | What the tool does |
| --- | --- |
| Reading outside the files | Only the two paths given are opened, through one handle whose type and size are checked first; a link, a folder, a device and an address are refused; nothing in a file is used as a path to open. |
| Running something | The readers are its own and evaluate nothing. Anchors, aliases, tags and mappings in braces are refused. A formula is split into words and braces and compared as text; it is never run, and no program or pattern is built from it. A cell is text. |
| Reaching something | There is no code that opens a connection, and a test fails if a module of src names one. |
| Memory, stack and time | Limits on size, lines, depth, metrics, reports, rows, columns, cells, text, and the parts and nesting of a formula (docs/limits.md). No function calls itself: the readers use a stack and a loop, the circles are found with a loop over a stack, and the checks use lists and maps. The nearest-id lookup is limited to a few asks among the first ids. A file past a limit is refused whole. |
| Two readings of one file | A key written twice is an error in both readers of the dictionary. An unknown key or column is a warning with the nearest name. A key under two of its names is an error. |
| Object tricks | Keys, names, ids and labels are kept in maps and sets, never set as properties of an object. `__proto__` is only a name. |
| Hidden characters | Text from the input is cleaned before it reaches a message; the markdown report escapes markdown and the JUnit report escapes XML and drops the characters XML 1.0 cannot hold. |
| A lying exit code | A file that cannot be read is an error finding and the checks it feeds are shown as not evaluated. A check that did not run says why. A summary never shows a pass for what it did not read. |
| Flooding the report | At most 1,000 findings of one check are listed; the rest are counted and the report says so. A summary table has at most 50 rows. |

## What the tool does not defend

- **The content of the files.** A dictionary can be wrong in every definition and still pass. The tool checks wording and structure,
  not truth.
- **Who may change the files, and who may read the reports.** A finding quotes metric names, owners, labels and file names. Keep the
  reports with the same care as the files.
- **The pipeline.** Pin the actions and the tool to a commit, give the job read access only, and do not hide the exit code
  (docs/secure-defaults.md).

## Not a promise about the numbers

Nothing in the tool says that a number on a report is right. It checks two files.
