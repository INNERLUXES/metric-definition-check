# Limits

This document says what a clean result means, what the tool is not, what it cannot see and which limits bound its work.

## What a clean result means

A clean result means that none of the problems that the checks look for were found in the dictionary file (and the reports file, if
one was given), at the level you set. It is worded "no finding at or above the level" and nothing stronger. It is not a statement
that the definitions are right, that the numbers are correct, that the reports show what they say, or that two teams who read one
name mean one thing.

## What the tool is not

- **Not a check of numbers.** It never connects to a database, a warehouse or a BI tool, and never runs a formula. A dictionary
  that passes can still sit under a report whose numbers are wrong.
- **Not a data quality tool.** It sees no row of data: no nulls, no duplicates, no late loads, no drift. Use a tool for that, and use
  this one for the words the numbers are built on.
- **Not an audit.** No report of the tool says that a dictionary, a report or a process has been reviewed or approved by anybody.
- **Not a semantic layer or a BI tool.** It does not hold your metrics for you, serve them or build a report. It reads a file that
  you keep.
- **Not a standard.** Every check is a best practice of this tool, and says so. The words it uses to guess that a metric is a rate or
  a count, and the ladders of grain, are its own choice.

## What the tool cannot see

- **Anything outside the two files.** How a report is built in its tool, which filters are on, what a dashboard calls a column, and
  whether the dictionary is the one the reports were built from.
- **The meaning of a definition.** It checks that text is there, and that it is not the name again. It cannot tell a definition that
  is clear from one that is vague, or a formula that is right from one that is wrong.
- **Two names for one thing.** "Sales" and "Revenue" for one measure, "Customers" and "Accounts" for two. Names, aliases, ids and
  labels are compared as written, without case and extra spaces.
- **Two formulas for one thing.** A formula in another order, with another spelling of a field, a text formula and a structure for
  the same sum. Only a formula written the same way, with the same filters, is seen as a copy.
- **Units beyond a sum.** The tool compares the declared units of the terms of a sum or a difference when each term is one metric.
  It does no algebra with units: a product, a ratio, a conversion with a rate and a term with a number in it are not compared, and a
  unit written two ways ("dollars" and "USD") counts as two units.
- **Whether a metric is a rate, a ratio or a count, when the dictionary does not say.** With no `type`, the tool guesses from
  words, the unit and a division. A metric that is one in fact and does not look like one passes; one that looks like one and is not
  can be reported.
- **Grains it does not know.** A grain that is not on a ladder of docs/inputs.md is not compared, and a grain on one ladder is not
  compared with one on the other.
- **Whether a status is true.** A metric marked active may be unused, and one marked deprecated may be everywhere.
- **Who owns a metric in fact.** It checks that an owner is written down, not that the owner exists or agrees.
- **Dependencies outside the dictionary.** A circle through a system that is not in the file, and a metric defined in another
  dictionary.
- **Formats of other tools.** The tool reads the formats of docs/inputs.md. A dictionary exported from a semantic layer or a BI tool
  has to be converted to it; the tool does not read the export formats of any product.

## Limits of the work

A file past a limit is refused whole. The tool never reads a part of a file and goes on.

| Limit | Value |
| --- | --- |
| Size of a file | 16 MiB (16,777,216 bytes) |
| Lines of a YAML file | 1,000,000 |
| Nesting of a YAML or JSON file | 40 levels |
| Metrics in a dictionary | 200,000 |
| Reports in a reports file | 100,000 |
| Entries in a list (aliases, sources, filters) | 200 |
| Length of a text in a file | 20,000 characters |
| Parts of a formula written as a structure | 1,000 |
| Nesting of a formula written as a structure | 30 levels |
| Rows in a reports table | 500,000 |
| Columns in a reports table | 50 |
| Cells in a reports table | 3,000,000 |
| Length of a cell | 20,000 characters |
| Findings listed for one check | 1,000 (the rest are counted and the report says so) |
| Rows in each summary table | 50 (the rest are one row) |
| Lookups of the nearest id in a run | 50, among the first 1,000 ids |

The readers work through a stack and a loop and no function calls itself, so deeply nested brackets cannot exhaust the stack. The
checks visit each metric and each report row a bounded number of times and never compare every pair; circles are found in time
proportional to the number of metrics and the names they use. The tests run files at the limits and fail if the time grows out of
proportion.

## Options that change what is asked

`--disable` leaves a check out, and the report names every check that was turned off. `--fail-on` and `--min-severity` change what
fails the run and what is shown; they never change what is looked for. There is no option that changes what a check asks for: the
rules are the same for every dictionary, so two teams read one report in one way.
