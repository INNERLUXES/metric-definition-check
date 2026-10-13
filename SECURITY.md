# Security

## Reporting a problem

Use private vulnerability reporting on this repository (the Security tab, "Report a vulnerability"). Please do not open a public
issue for a vulnerability.

Include a small made-up dictionary and reports file that show the problem, the command you ran, what you expected and what
happened. Use made-up metric names, owners and report names, never data of a real business or the name of a real company, and never
a real key, token or password, even an old one.

## Scope

The tool reads the text of a metric dictionary file and of a reports file. It never connects to data or a BI tool, never runs a
formula, is not a data quality tool and is not an audit. In scope:

- an input that makes the tool read a file other than the ones it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a URL, connect to a database, write or sign anything, run any other
  program, or evaluate anything it reads, such as an anchor, a tag, a string in the YAML, the JSON or a cell of the table, or a
  formula
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large file, brackets
  nested very deep, a formula of braces or parentheses nested or repeated very deep, hundreds of thousands of metrics, one name or
  one id on every metric, a chain or a ring of metrics that name each other, hundreds of thousands of rows, thousands of columns, a
  cell of the longest length, a line of many quotes, or one label on every row
- binary or invalid input that the tool reads as if it were a dictionary or a table
- a key written twice that is read without an error, a misspelt key or column that is not reported, or two ids that differ only in
  case that are taken for two
- a dictionary or reports file that docs/method.md says is reported (an id used twice, a name used by two metrics, a formula that
  names a metric that is not there, a circle, a unit that does not add up, a report that shows an unknown metric) that the tool does
  not report
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is reported,
  or a file that cannot be read and still passes
- text from a file or a file name that rewrites the terminal through control or direction characters, is shown unescaped in the
  output, puts markup into the markdown report or breaks the XML of the JUnit report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the problems docs/limits.md says the tool does not see, whether a definition is right, whether a number is correct,
what a BI tool does with a file, who may change or upload the files, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
