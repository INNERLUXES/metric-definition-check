# metric-definition-check: examples/bad/metrics.yaml \+ examples/bad/reports.csv

- Dictionary file: examples/bad/metrics.yaml \(yaml, 221 lines, 6,354 bytes\)
- Reports file: examples/bad/reports.csv \(csv, 8 lines, 346 bytes\)
- Dictionary: Online shop metric dictionary \(with mistakes\): 21 metrics
- Reports: 2 reports, 6 metrics shown, 6 different metrics; 15 metrics of the dictionary on no report
- Findings: 38 \(16 error, 22 warning\)
- Result: **FAIL - 16 findings at or above error \(16 error, 22 warning\)**

## Metrics for each status

| status | metrics |
| --- | --- |
| active | 15 |
| deprecated | 3 |
| \(not set\) | 2 |
| draft | 1 |

## Metrics for each owner

| owner | metrics |
| --- | --- |
| Finance | 9 |
| Marketing | 5 |
| Customer success | 3 |
| \(none\) | 2 |
| Logistics | 1 |
| Sales operations | 1 |

## Metrics for each grain

| grain | metrics |
| --- | --- |
| day | 15 |
| month | 4 |
| \(none\) | 1 |
| week | 1 |

## Checks

| check | level | kind | status | findings |
| --- | --- | --- | --- | --- |
| file-unreadable | error | file | pass | 0 |
| field-invalid | error | file | fail | 2 |
| field-unknown | warning | file | fail | 3 |
| metric-duplicate-id | error | dictionary | fail | 1 |
| name-clash | error | dictionary | fail | 1 |
| metric-no-definition | error | dictionary | fail | 2 |
| definition-repeats-name | warning | dictionary | fail | 1 |
| metric-no-formula | error | dictionary | fail | 1 |
| metric-no-unit | warning | dictionary | fail | 1 |
| metric-no-grain | warning | dictionary | fail | 1 |
| metric-no-owner | warning | dictionary | fail | 2 |
| metric-no-source | warning | dictionary | fail | 2 |
| metric-no-status | warning | dictionary | fail | 1 |
| metric-no-period | warning | dictionary | fail | 2 |
| formula-unit-mismatch | error | dictionary | fail | 1 |
| formula-unknown-metric | error | dictionary | fail | 1 |
| metric-circular | error | dictionary | fail | 1 |
| grain-finer-than-input | warning | dictionary | fail | 2 |
| active-uses-inactive | error | dictionary | fail | 2 |
| deprecated-no-replacement | warning | dictionary | fail | 1 |
| replaced-by-invalid | error | dictionary | fail | 2 |
| formula-duplicate | warning | dictionary | fail | 1 |
| ratio-parts-missing | warning | dictionary | fail | 1 |
| report-unknown-metric | error | reports | fail | 1 |
| report-label-differs | warning | reports | fail | 2 |
| report-shows-deprecated | warning | reports | fail | 1 |
| report-label-clash | error | reports | fail | 1 |
| report-no-owner | warning | reports | fail | 1 |

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| error | field-invalid | examples/bad/metrics.yaml:221 | The metric "Returns" has the status "retired"; it must be active, draft and deprecated. Fix: Write the value as docs/inputs.md says. A metric or a row with a value the tool cannot use is left out of the other checks where it matters, so fix it first. |
| error | field-invalid | examples/bad/reports.csv:8 | The row has 3 cells and the header has 5. Fix: Write the value as docs/inputs.md says. A metric or a row with a value the tool cannot use is left out of the other checks where it matters, so fix it first. |
| error | metric-duplicate-id | examples/bad/metrics.yaml:14 | The id "orders\_placed" is used by two metrics: "Orders placed" at line 3 and "Orders placed from the carrier feed" at line 14. Fix: Give each metric one id. If two entries describe the same measure, merge them; if they differ, name the difference in the id and in the name. |
| error | name-clash | examples/bad/metrics.yaml:47 | The name "Revenue" is used by two metrics: "Revenue" at line 36 and "Net revenue" at line 47 \(one of them as an alias\). Fix: Give each metric a name of its own that says what is different \(for example "Revenue \(booked\)" and "Revenue \(recognised\)"\), and remove the alias from the metric that does not own it. |
| error | formula-unknown-metric | examples/bad/metrics.yaml:52 | The metric "Net revenue" names the metric "refund", which is not in the dictionary. The nearest id is "refunds". Fix: Correct the id, add the metric to the dictionary, or write the part as a source field \(without braces\) if it is not a metric. |
| error | metric-no-definition | examples/bad/metrics.yaml:59 | The metric "Refunds" has no written definition, so nothing says in words what is counted or measured. Fix: Write the definition in the "definition" key in a sentence or two, in the words a reader of the report would use, and say what is in and what is out. |
| error | formula-unit-mismatch | examples/bad/metrics.yaml:70 | The metric "Revenue plus orders" adds or subtracts metrics of different units: "Revenue" in USD and "Orders placed" in count. Fix: Convert one side first \(for example with a price\) or use a different formula. If the two units are the same unit under two spellings, write them the same way. |
| error | active-uses-inactive | examples/bad/metrics.yaml:80 | The metric "Net sales" is active and is built on "Revenue \(legacy\)", which is deprecated \(replaced by "net\_revenu"\). Fix: Move the active metric to the active or replacing metric, or finish the draft before the active metric depends on it. |
| error | active-uses-inactive | examples/bad/metrics.yaml:80 | The metric "Net sales" is active and is built on "Weekly revenue forecast", which is draft. Fix: Move the active metric to the active or replacing metric, or finish the draft before the active metric depends on it. |
| error | metric-no-formula | examples/bad/metrics.yaml:108 | The metric "Customers in total" has no formula, so nothing says how the number is worked out. Fix: Write the formula in "formula" as text \(naming other metrics as \{metric\_id\}\) or as a structure with op and args. |
| error | metric-circular | examples/bad/metrics.yaml:147 | 2 metrics depend on each other in a circle: "Gross margin" and "Margin rate". Fix: Break the circle: one of the metrics in it must be worked out from source fields, not from the next one in the circle. |
| error | replaced-by-invalid | examples/bad/metrics.yaml:176 | The metric "Revenue \(legacy\)" is replaced by "net\_revenu", which is not in the dictionary. The nearest id is "net\_revenue". Fix: Point replaced\_by at an active metric of the dictionary, or at the last metric of the chain. |
| error | replaced-by-invalid | examples/bad/metrics.yaml:199 | The metric "Visits \(older\)" is replaced by "Visits \(old\)", which is deprecated too. Fix: Point replaced\_by at an active metric of the dictionary, or at the last metric of the chain. |
| error | metric-no-definition | examples/bad/metrics.yaml:211 | The metric "Returns" has no written definition, so nothing says in words what is counted or measured. Fix: Write the definition in the "definition" key in a sentence or two, in the words a reader of the report would use, and say what is in and what is out. |
| error | report-unknown-metric | examples/bad/reports.csv:3 | The report "Weekly sales summary" shows the metric "revenu", which is not in the dictionary. The nearest id is "revenue". Fix: Correct the id, add the metric to the dictionary, or take it off the report. If the report uses a name there, write the id. |
| error | report-label-clash | examples/bad/reports.csv:7 | The report "Finance pack" shows "Gross margin" under the label "Revenue", the label that Finance pack uses for "Revenue" \(line 5\). Fix: Give each metric one label of its own on every report, so a reader who sees the label in two places gets the same number. |
| warning | field-unknown | examples/bad/metrics.yaml:213 | The metric at line 211 has the key "defintion", which the tool does not read; nothing under it is checked. Did you mean "definition"? Fix: Correct the name to a key or column of docs/inputs.md, or take it out of the file. |
| warning | field-unknown | examples/bad/metrics.yaml:219 | The metric at line 211 has the key "ownr", which the tool does not read; nothing under it is checked. Did you mean "owner"? Fix: Correct the name to a key or column of docs/inputs.md, or take it out of the file. |
| warning | field-unknown | examples/bad/reports.csv:1 | The column "notes" is not one the tool reads; its cells are not read. Fix: Correct the name to a key or column of docs/inputs.md, or take it out of the file. |
| warning | formula-duplicate | examples/bad/metrics.yaml:29 | The metric "Order count" has the same formula as "Orders placed" at line 3 \("count\_distinct\(orders.order\_id\)"\) under another name. Fix: Keep one metric and make the other an alias, or write down what makes them different: a filter, a period, a source. |
| warning | definition-repeats-name | examples/bad/metrics.yaml:38 | The metric "Revenue" has a definition that is only its name said again \("Revenue"\). Fix: Say what is counted, for whom and over what period, and what is left out. A definition must tell a reader something the name does not. |
| warning | metric-no-source | examples/bad/metrics.yaml:59 | The metric "Refunds" has no source system, so nothing says where its data comes from. Fix: Write the system or systems in "source", for example the billing system or the order database. |
| warning | metric-no-unit | examples/bad/metrics.yaml:59 | The metric "Refunds" has no unit, such as a currency, count, percent or days. Fix: Write the unit in "unit", such as USD, count, percent or days. Use the same word for the same unit everywhere. |
| warning | grain-finer-than-input | examples/bad/metrics.yaml:82 | The metric "Net sales" has the grain "day", which is finer than "week" of "Weekly revenue forecast" that it is built on, and gives no "aggregation" note. Fix: Say in "aggregation" how the coarser input is spread down to the finer grain, or move the metric to the grain of its inputs. |
| warning | metric-no-period | examples/bad/metrics.yaml:87 | The metric "Active customers" looks like a rate, a ratio or a count \(its type is count\) and has no period or time window rule, so nothing says over what time it is measured. Fix: Write the period in "period", such as "calendar month", "trailing 28 days" or "as at the last day of the month", or set the type to snapshot if the metric is a point in time. |
| warning | ratio-parts-missing | examples/bad/metrics.yaml:97 | The metric "Churn rate" is a ratio and does not state the numerator and the denominator: write "numerator" and "denominator", or the division in the formula. Fix: Write the "numerator" and the "denominator" in words \(or as \{metric\_id\}\), or write the division in the formula. |
| warning | metric-no-grain | examples/bad/metrics.yaml:116 | The metric "Page visits" has no grain, so nothing says the level it is calculated at. Fix: Write the grain in "grain", such as order, day, customer or month: the thing that one row of the result stands for. |
| warning | metric-no-owner | examples/bad/metrics.yaml:116 | The metric "Page visits" has no owner, so nobody is named who decides its definition. Fix: Write the person, role or team in "owner". A role or a team is better than a person who may leave. |
| warning | metric-no-period | examples/bad/metrics.yaml:116 | The metric "Page visits" looks like a rate, a ratio or a count and has no period or time window rule, so nothing says over what time it is measured. Fix: Write the period in "period", such as "calendar month", "trailing 28 days" or "as at the last day of the month", or set the type to snapshot if the metric is a point in time. |
| warning | metric-no-source | examples/bad/metrics.yaml:116 | The metric "Page visits" has no source system, so nothing says where its data comes from. Fix: Write the system or systems in "source", for example the billing system or the order database. |
| warning | metric-no-status | examples/bad/metrics.yaml:116 | The metric "Page visits" has no status \(active, draft or deprecated\); it is read as active. Fix: Write the status in "status": active, draft or deprecated. |
| warning | grain-finer-than-input | examples/bad/metrics.yaml:138 | The metric "Daily signup share" has the grain "day", which is finer than "month" of "Monthly signups" that it is built on, and gives no "aggregation" note. Fix: Say in "aggregation" how the coarser input is spread down to the finer grain, or move the metric to the grain of its inputs. |
| warning | deprecated-no-replacement | examples/bad/metrics.yaml:187 | The metric "Visits \(old\)" is deprecated and has no "replaced\_by", so a reader of a report that still shows it is not told what to use. Fix: Name the metric that replaces it in "replaced\_by", or say in "note" that nothing does. |
| warning | metric-no-owner | examples/bad/metrics.yaml:211 | The metric "Returns" has no owner, so nobody is named who decides its definition. Fix: Write the person, role or team in "owner". A role or a team is better than a person who may leave. |
| warning | report-label-differs | examples/bad/reports.csv:4 | The report "Weekly sales summary" shows "Net revenue" as "Sales", which is not its name or one of its aliases. Fix: Use the name of the dictionary on the report, or add the label to the aliases of that metric \(and see that it belongs to no other\). |
| warning | report-no-owner | examples/bad/reports.csv:5 | The report "Finance pack" has no owner, so nobody is named who can answer for its numbers. Fix: Write the person, role or team that answers for the report in "owner". |
| warning | report-shows-deprecated | examples/bad/reports.csv:6 | The report "Finance pack" shows "Revenue \(legacy\)", which is deprecated \(replaced by "net\_revenu"\). Fix: Move the report to the metric named in replaced\_by, or keep it on purpose and say why in the note of the metric. |
| warning | report-label-differs | examples/bad/reports.csv:7 | The report "Finance pack" shows "Gross margin" as "Revenue", which is not its name or one of its aliases. Fix: Use the name of the dictionary on the report, or add the label to the aliases of that metric \(and see that it belongs to no other\). |

This report reads the dictionary file and the reports file and nothing else. It never connects to data and never runs a formula. A clean result means that none of the problems of its checks were found in them; it is not a statement that the definitions are right, that the numbers are correct or that the reports show what they say.
