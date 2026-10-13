# metric-definition-check: examples/good/metrics.yaml \+ examples/good/reports.yaml

- Dictionary file: examples/good/metrics.yaml \(yaml, 174 lines, 6,067 bytes\)
- Reports file: examples/good/reports.yaml \(yaml, 23 lines, 577 bytes\)
- Dictionary: Online shop metric dictionary: 14 metrics
- Reports: 3 reports, 8 metrics shown, 8 different metrics; 6 metrics of the dictionary on no report
- Findings: 0
- Result: **PASS - no finding at or above error**

## Metrics for each status

| status | metrics |
| --- | --- |
| active | 12 |
| deprecated | 1 |
| draft | 1 |

## Metrics for each owner

| owner | metrics |
| --- | --- |
| Customer success | 5 |
| Finance | 4 |
| Logistics | 3 |
| Sales operations | 2 |

## Metrics for each grain

| grain | metrics |
| --- | --- |
| day | 8 |
| month | 5 |
| quarter | 1 |

## Checks

| check | level | kind | status | findings |
| --- | --- | --- | --- | --- |
| file-unreadable | error | file | pass | 0 |
| field-invalid | error | file | pass | 0 |
| field-unknown | warning | file | pass | 0 |
| metric-duplicate-id | error | dictionary | pass | 0 |
| name-clash | error | dictionary | pass | 0 |
| metric-no-definition | error | dictionary | pass | 0 |
| definition-repeats-name | warning | dictionary | pass | 0 |
| metric-no-formula | error | dictionary | pass | 0 |
| metric-no-unit | warning | dictionary | pass | 0 |
| metric-no-grain | warning | dictionary | pass | 0 |
| metric-no-owner | warning | dictionary | pass | 0 |
| metric-no-source | warning | dictionary | pass | 0 |
| metric-no-status | warning | dictionary | pass | 0 |
| metric-no-period | warning | dictionary | pass | 0 |
| formula-unit-mismatch | error | dictionary | pass | 0 |
| formula-unknown-metric | error | dictionary | pass | 0 |
| metric-circular | error | dictionary | pass | 0 |
| grain-finer-than-input | warning | dictionary | pass | 0 |
| active-uses-inactive | error | dictionary | pass | 0 |
| deprecated-no-replacement | warning | dictionary | pass | 0 |
| replaced-by-invalid | error | dictionary | pass | 0 |
| formula-duplicate | warning | dictionary | pass | 0 |
| ratio-parts-missing | warning | dictionary | pass | 0 |
| report-unknown-metric | error | reports | pass | 0 |
| report-label-differs | warning | reports | pass | 0 |
| report-shows-deprecated | warning | reports | pass | 0 |
| report-label-clash | error | reports | pass | 0 |
| report-no-owner | warning | reports | pass | 0 |

## Findings

None.

This report reads the dictionary file and the reports file and nothing else. It never connects to data and never runs a formula. A clean result means that none of the problems of its checks were found in them; it is not a statement that the definitions are right, that the numbers are correct or that the reports show what they say.
