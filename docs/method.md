# Method

metric-definition-check reads the text of a metric dictionary, and of a list of reports if there is one, and looks for the mistakes
that are cheap to find in a file and expensive to find after two dashboards show two numbers under one name. This document says what
it does, in order, what each check looks at and what each one cannot see. It does not connect to any data, run a formula or look
anything up.

## Where this sits, and where it stops

The tool checks the wording and the structure of the definitions. It does not know whether a definition is right, whether a number
is correct, or whether a report shows what it says. It is not a data quality tool: it never sees a row of data. It is not an audit:
a clean report says that none of the problems of its checks were found in two files, nothing more. Every check is a best practice of
this tool, and no standard sets any of them.

## The order of the work

1. **Read the files.** Each file is opened once, as a regular file of bounded size, never through a link, and decoded as UTF-8 or as
   UTF-16 with a byte order mark. A file that holds a null byte or is not valid text is refused with exit code `2` and no report.
2. **Read the dictionary.** A first character of `{` or `[` means JSON, anything else the YAML subset of docs/inputs.md. Both readers
   build the same tree, with the line and column of every key and value. A syntax error is a `file-unreadable` finding with its line
   and column, and no check of the dictionary runs.
3. **Build the metrics.** Each metric is read from the tree: its text fields, its lists, its status and type, and its formula, which
   is read into the metrics it names, the groups of terms it adds, whether it divides and a canonical text. A value that cannot be
   used is a `field-invalid` finding.
4. **Index.** The ids are put in a map (the first metric of an id wins) and the names and aliases in another.
5. **Check each metric** against the index: the keys it should have, the metrics its formula names, their status and grain, the
   units of its sums, its replaced_by, and whether another metric has its formula. The checks are loops over lists and maps.
6. **Find the circles** in the graph of the metrics that name each other, with a loop over a stack (Tarjan's method), never by a
   function that calls itself.
7. **Read the reports,** if a file was given: a YAML or JSON file with a `reports` list, or a table when the name ends in `.csv` or
   `.tsv`. A row or an entry that cannot be used is a finding and is left out.
8. **Check the reports** against the dictionary: unknown metrics, labels, deprecated metrics, one label for two metrics, owners.
9. **Count.** Metrics for each status, owner and grain, and what the reports show.
10. **Write the report** in the format asked for, to standard output.

Findings are collected with a cap of 1,000 for each check; the rest are counted and the report says so.

## The checks

Every check is a best practice of this tool. Each check says in its `own` text why the tool asks for it. `--explain <id>` prints
what a check looks at, why it exists, what to change and what it cannot see.

### Files

- **file-unreadable.** A file the reader cannot follow: a syntax error, a dictionary that is not a mapping or has no metrics, a
  reports table with a bad quote or without the columns it needs, or a file past a limit. The finding says where the reader
  stopped. No other check runs on that file, and the checks that need it are shown as not evaluated, so a file that cannot be read
  never passes.
- **field-invalid.** A metric with no id or no name, a status that is not active, draft or deprecated, a type the tool does not
  know, a value that is not text, a formula that cannot be followed, a row of a table with the wrong number of cells or with no
  report or metric. It cannot tell a value that is allowed but wrong from one that is right.
- **field-unknown.** A key or a column that is not read, with the nearest name within two edits (one edit for a name of under five
  letters). It cannot tell a misspelling from a key your own tools add on purpose.

### The dictionary

- **metric-duplicate-id.** Two metrics with the same id, compared without case and extra spaces. The first one is the metric the
  other checks point at. It cannot tell two ids for one measure from two measures.
- **name-clash.** One name or alias used by two different metrics. This is the check for the problem the tool is for: the same words
  over two definitions. A deprecated metric whose `replaced_by` names the other metric is left out, because keeping the name while a
  metric is replaced is how a move is done. It compares the written names; it cannot tell "Sales" and "Revenue" for one measure.
- **metric-no-definition.** No written definition. It looks for text, not for a definition that is clear.
- **definition-repeats-name.** A definition that is only the name said again, after a few filler words (the, a, of, is, total,
  number, amount, count) are dropped from both. A definition that says little in other words passes.
- **metric-no-formula.** No formula. The tool does not run it and cannot tell a right formula from a wrong one.
- **metric-no-unit, metric-no-grain, metric-no-owner, metric-no-source, metric-no-status.** A key that is missing or empty. A
  status that is present and invalid is `field-invalid` and not also a missing status.
- **metric-no-period.** A rate, a ratio or a count with no period or time window rule. Which metrics are read as one is in the
  section on types of docs/inputs.md: the `type` if there is one, otherwise the words of the name and id, the unit and a division in
  the formula. A metric of type `snapshot`, `sum`, `average` or `other` is left out.
- **formula-unit-mismatch.** A sum or a difference of terms that are each exactly one metric, where the declared units differ
  (compared without case and extra spaces). The tool does no algebra with units: a product, a ratio or a term with a number in it is
  not compared, and a metric with no unit is not compared.
- **formula-unknown-metric.** A formula, numerator or denominator that names `{an id}` that is not in the dictionary. The finding
  shows the nearest id when one is close; the lookup is bounded, so a file full of unknown ids does not make the tool slow.
- **metric-circular.** Metrics that depend on each other in a circle, or a metric that names itself. One finding for each circle,
  at the first metric of it.
- **grain-finer-than-input.** A metric built on another whose grain is coarser, with no `aggregation` note. Grains are compared on
  the two ladders of docs/inputs.md and only on the same ladder.
- **active-uses-inactive.** An active metric (or one with no status) whose formula, numerator or denominator names a draft or a
  deprecated metric.
- **deprecated-no-replacement.** A deprecated metric with no `replaced_by`.
- **replaced-by-invalid.** A `replaced_by` that is not in the dictionary, is the metric itself, or names a metric that is deprecated
  too. It follows one step.
- **formula-duplicate.** Two metrics with the same formula (without case and spaces, or the same structure) and the same `filters`,
  under different names. A deprecated metric that names the other in `replaced_by` is left out. A formula in another order, or
  with another spelling of a field, is not seen as the same, and a text formula is never compared with a structure.
- **ratio-parts-missing.** A ratio or a rate that states neither a division with something on each side in its formula nor both a
  `numerator` and a `denominator`. The message names the part that is missing.

### The reports

These run when `--reports` is given, and, except for the owner, only when the dictionary could be read.

- **report-unknown-metric.** A report that shows an id that is not in the dictionary, with the nearest id.
- **report-label-differs.** A report that shows a metric under a label that is neither its name nor one of its aliases. A report
  that gives no label is shown under the name of the dictionary and has nothing to differ.
- **report-shows-deprecated.** A report that shows a deprecated metric, with the one that replaces it.
- **report-label-clash.** One label used for two different metric ids. A metric shown with no label counts under its name. Two
  metrics under their own different names never clash, and two metrics with one name are `name-clash` in the dictionary; a clash is
  reported when at least one of the two labels is written out.
- **report-no-owner.** A report with no owner. For a table, the owner of a report may be on any one of its rows, and a table with
  no `owner` column is not asked for owners.

## The summary

Every report carries the number of metrics for each status, owner and grain, with a metric that has none counted as `(none)`
(`(not set)` for the status), owners and grains compared without case, and the most common first. At most 50 rows are shown for
each; the rest are one row, "and N more". With reports it says how many reports and rows there are, how many different metrics they
show, and how many metrics of the dictionary no report shows.

## What the tool cannot do

It cannot tell which of two definitions is right, whether a formula gives the number that people expect, or whether a name that
means one thing to finance means the same to sales. Those are questions for the owners of the metrics. The tool makes it cheap to
find the places where they have not been asked.
