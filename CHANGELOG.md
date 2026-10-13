# Changes

## 1.0.0

First release.

- Checks a metric dictionary, the written definitions of business measures, and, with `--reports`, the list of the reports that
  show them, before dashboards are built on them, so that two reports do not show two numbers under one name. Reads one dictionary
  file, YAML (a small documented subset) or JSON, and one reports file, YAML, JSON or CSV. It reads the text of the files and
  nothing else: it never connects to data or a BI tool, never runs a formula and does not judge whether a definition is right. It is
  not a data quality tool and not an audit. It contacts nothing over the network, runs nothing, needs no key, follows no symbolic
  link, reads no clock and writes nothing to disk.
- The dictionary format, documented in docs/inputs.md: `name`, `description` and `metrics`; a metric has an `id`, a `name`,
  `aliases`, a `definition`, a `formula` (text with `{metric_id}` for another metric, or a structure of `op` and `args`), a `unit`, a
  `grain`, a `period`, an `owner`, a `source`, a `status` (active, draft or deprecated), `replaced_by`, `filters`, `aggregation`,
  a `type`, a `numerator`, a `denominator` and a `note`, with other names for several of them. The reports file lists reports with
  an owner and the metrics each shows, with the label it uses, as YAML, JSON or a CSV table with a row for each metric shown.
- Three readers of its own with the line and column of every key, value or cell, no dependency and no recursion: JSON, a
  documented subset of YAML (mappings and lists by indentation, plain and quoted values, lists of values in square brackets, block
  values and comments), and a strict CSV reader (quotes as in RFC 4180, a comma or a tab). Anchors, aliases, tags, mappings in braces,
  several documents, tabs in the indentation, a key written twice, a stray quote and a semicolon as the delimiter are refused with
  the line and column. A file past a limit is refused whole.
- A reader of formulas that reads words, braces, numbers, operators and parentheses, or a structure, finds the metrics a formula
  names and the terms it adds, and never runs anything.
- Checks of the dictionary: `metric-duplicate-id`, `name-clash`, `metric-no-definition`, `definition-repeats-name`,
  `metric-no-formula`, `metric-no-unit`, `metric-no-grain`, `metric-no-owner`, `metric-no-source`, `metric-no-status`,
  `metric-no-period`, `formula-unit-mismatch`, `formula-unknown-metric` (with the nearest id), `metric-circular`,
  `grain-finer-than-input`, `active-uses-inactive`, `deprecated-no-replacement`, `replaced-by-invalid`, `formula-duplicate` and
  `ratio-parts-missing`.
- Checks of the reports against the dictionary: `report-unknown-metric`, `report-label-differs`, `report-shows-deprecated`,
  `report-label-clash` and `report-no-owner`.
- Checks of the files: `file-unreadable`, `field-invalid` and `field-unknown`, with the nearest name for a misspelt key or column.
- Twenty-eight checks in all, each marked as a check of a file, of the dictionary or of the reports, each a best practice of the
  tool and saying so; `--disable` leaves checks out and the report names them.
- A summary of the number of metrics for each status, owner and grain in every report, and what the reports show.
- Reports as text, markdown, JSON, SARIF 2.1.0 (with line and column) and JUnit XML (one test case for each check);
  `--min-severity`, `--fail-on`, `--list-checks` and `--explain <id>` with what a check looks at, why it exists, what to change and
  what it cannot see. Exit code `0` when no finding is at or above the fail-on level, `1` when one is, `2` for a usage or input
  error, with no report.
- Made-up examples: a shop dictionary in YAML with its reports in YAML and a subscription dictionary in JSON with its reports as a
  CSV table that pass every check at every level; dictionaries and reports with a mistake of every check, a dictionary with
  circles, and files that cannot be read; with their real output in all formats, the list of checks and the explanation of a check.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of the
  repository.
