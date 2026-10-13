# 1. Read the dictionary and the reports, and never touch the data

## Status

Accepted

## Context

A tool that checks the metrics of a business could connect to the warehouse: run each formula, compare the result with what the
dashboards show, find the metrics that no query uses. That would find more. It would also need credentials, drivers, time and
access to the most sensitive part of the business, and it would make the result depend on the state of the data at the moment of
the run, in a tool that is meant to run on every pull request.

The mistakes that cost most are also the ones that are visible in two plain files: a name used by two metrics, a formula that names
a metric that is not defined, a rate with no period, a report that shows a deprecated metric. They need no data to find.

## Decision

1. The tool reads the text of the dictionary file and of the reports file, and checks them against each other. It never connects to
   a database, a warehouse or a BI tool, never runs a formula and never reads a row of data.
2. Every finding points at a file, a line and a column that a reader can check by looking at the file.
3. Everything the files do not hold (the data, the queries, the dashboards as they are built, the history of a definition) is said,
   in docs/limits.md, to be outside what the tool sees. A check that would depend on it is not added.
4. A clean result is worded "no finding at or above the level", never as an approval of the dictionary or the numbers.

## Consequences

- The same files give the same report on every machine and on every day, and a report can be kept as a record of what was checked.
- The tool misses everything that only the data shows: a formula that gives a wrong number, a column that is empty, two reports that
  show two numbers under two names that mean one thing. Look at the numbers as well.
- A team that wants those checks needs another tool. This one stays small enough to read in an afternoon.
