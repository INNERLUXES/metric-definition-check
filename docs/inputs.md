# Inputs

metric-definition-check reads one dictionary file and, if you give it with `--reports`, one reports file. It reads the text of the
two files and nothing else: it never connects to a database or a BI tool, it never runs a formula, and it does not open anything a
file names. This document is the format of the dictionary, the formula notation, the small subset of YAML the tool reads, and the
format of the reports file in its two forms.

## The dictionary, in YAML or JSON

A dictionary is a list of **metrics**. The file is read as JSON when its first character (after white space) is `{` or `[`, and as
the YAML subset below otherwise. The two forms mean the same thing.

```yaml
name: Shop metrics                     # optional, shown in the report
description: Definitions of the shop.  # optional, not read further
metrics:                               # required: a list, not empty
  - id: orders
    name: Orders
    definition: The orders a customer finished checkout for.
    formula: count_distinct(orders.order_id)
    unit: count
    grain: day
    ...
```

The keys at the top level:

| Key | Meaning |
| --- | --- |
| `name` | A title for the report. Optional text. |
| `description` | Free text, read as text and otherwise ignored. |
| `metrics` | A list of metrics. Required, and not empty. At most 200,000 metrics. |

The keys of a metric. Every key is optional for the reader; the checks say what a metric should have. Keys are read without case,
and a space or a hyphen in a key is read as an underscore.

| Key | Meaning |
| --- | --- |
| `id` | The id that formulas, reports and `replaced_by` use to point at the metric. Compared without case and extra spaces. |
| `name` | The name a reader sees. Compared without case and extra spaces, together with the aliases, to find a name used twice. |
| `aliases` | Other names the metric is known by, as a text or a list of texts (up to 200). Also read from `alias`. |
| `definition` | What is counted or measured, in words, and what is in and what is out. |
| `formula` | How the number is worked out: text or a structure, see below. |
| `unit` | The unit: a currency, `count`, `percent`, `days` and so on. Compared without case when units are added. |
| `grain` | The level the metric is calculated at: `order`, `day`, `customer`, `month`. |
| `period` | The time window rule: `calendar month`, `trailing 28 days`, `as at the last day of the month`. Also read from `window`, `time_window` and `time_period`. |
| `owner` | The person, role or team that decides the definition. |
| `source` | The source system or systems, as a text or a list of texts. Also read from `sources`, `source_system` and `source_systems`. |
| `status` | `active`, `draft` or `deprecated`, in any case. A metric with no status is read as active. |
| `replaced_by` | The id of the metric that replaces a deprecated one. |
| `filters` | What is left in or out, as a text or a list of texts. Also read from `exclusions`, `exclusion` and `filter`. Two metrics with one formula are only told apart by their filters. |
| `aggregation` | A note on how a coarser input is spread down to a finer grain. Its presence stops the grain check. |
| `type` | `count`, `distinct_count`, `sum`, `average`, `ratio`, `rate`, `snapshot` or `other`. Says what kind of measure it is. Optional, see below. |
| `numerator` | The top part of a ratio, in words or as `{metric_id}`. |
| `denominator` | The bottom part of a ratio, in words or as `{metric_id}`. |
| `note` | Free text, not read further. |

A key the tool does not know, at the top level or in a metric, is reported as `field-unknown` with the nearest name, and nothing under
it is checked. A key written twice, or the same key under two of its names, is an error.

### The type of a metric

`type` is optional. When it is there, it decides whether the metric is read as a rate, a ratio or a count (`count`,
`distinct_count`, `ratio` and `rate` need a period; `ratio` and `rate` also need their two parts) or not (`sum`, `average`,
`snapshot` and `other` do not). When it is not there, the tool reads the metric as a ratio or a rate when its name or id holds a
word such as rate, ratio, share, percentage, churn, retention, conversion or margin, when its unit is percent, or when its formula
divides one thing by another; and as a count when the name or id holds a word such as count, number, active, new, signups, visits
or visitors. Set `type: snapshot` for a point-in-time figure that needs no period.

### Formulas

A formula is **text** or a **structure**. Neither is ever run.

In text, a metric is written in braces by its id, and everything else is read as plain words, numbers and operators:

```yaml
formula: "{gross_revenue} - {refunds}"
formula: "{orders_delivered_on_time} / {orders_delivered}"
formula: count_distinct(orders.order_id)
formula: sum(order_lines.unit_price * order_lines.quantity)
```

A formula that starts with a brace must be in quotes in YAML. Words without braces, such as `orders.order_id`, are source fields and
are not looked up. A `{` that is never closed, an empty pair of braces, a stray `}` and parentheses that do not match are reported
as `field-invalid`. Metrics named in `numerator` and `denominator` in braces count the same way.

As a structure, a formula is a mapping with `op` and `args`, or a leaf: `metric` (the id of a metric), `field` (a source field)
or `value` (a number):

```yaml
formula:
  op: divide
  args:
    - metric: churned_customers
    - metric: customers_at_start
```

The operations are `add`, `subtract`, `multiply`, `divide` (exactly two args), `sum`, `count`, `count_distinct`, `avg`, `min` and
`max`. An arg may also be a bare number, a bare `{metric_id}` or a bare field name. A structure may nest to 30 levels and hold
1,000 parts.

### What the formula notation is used for

- The metrics a formula names are the dependencies of the metric: they are looked up (`formula-unknown-metric`), followed for
  circles (`metric-circular`), and compared with it for status (`active-uses-inactive`) and grain (`grain-finer-than-input`).
- Terms that are added or subtracted and are each exactly one metric are compared for their declared unit (`formula-unit-mismatch`).
- A division with something on each side is a ratio with both parts (`ratio-parts-missing`).
- The formula without case and spaces is compared with the formula of every other metric (`formula-duplicate`).

### The grains the tool knows

A grain is only compared with another on the same ladder, from the finest to the coarsest: `second`, `minute`, `hour`, `day`,
`week`, `month`, `quarter`, `year`; and `event`, `line_item`, `order`, `customer`, `account`, `region`, `company`. A few other ways
to write them are read too: `daily`, `monthly`, `per day`, `by month`, `order line`, `customers`, `user`. A grain that is not on a
ladder is not compared.

## The YAML subset

The dictionary and the reports file are read by a reader written for this tool. It reads:

- mappings and lists by indentation with spaces, and lists of scalars in square brackets on one line;
- plain, single-quoted and double-quoted scalars; `true`, `false`, `null` and whole numbers (`yes`, `no` and dates stay text);
- the empty `{}` and `[]`, comments, and the block scalars `|` and `>`.

It refuses, with the line and column: anchors, aliases, tags, merge keys, several documents, tabs in the indentation, text over
several lines outside a block scalar, mappings in braces, a plain value that holds a colon and a space (put it in quotes), and a key
written twice in one mapping. Nothing it reads is evaluated.

## A short dictionary

This dictionary passes every check at every level.

```yaml
name: Shop metrics
metrics:
  - id: orders
    name: Orders
    aliases: [Order count]
    definition: The orders a customer finished checkout for, counted on the day of checkout.
    type: count
    formula: count_distinct(orders.order_id)
    unit: count
    grain: day
    period: calendar day
    owner: Sales operations
    source: orders database
    status: active
    filters:
      - test orders
  - id: gross_revenue
    name: Gross revenue
    definition: The value of the goods on the orders of the day, before refunds.
    type: sum
    formula: sum(order_lines.amount)
    unit: USD
    grain: day
    period: calendar day
    owner: Finance
    source: orders database
    status: active
  - id: refunds
    name: Refunds
    definition: The value paid back to customers in the day.
    type: sum
    formula: sum(payments.refund)
    unit: USD
    grain: day
    period: calendar day
    owner: Finance
    source: payment export
    status: active
  - id: net_revenue
    name: Net revenue
    aliases: [Revenue]
    definition: Gross revenue less the refunds paid in the same day.
    type: sum
    formula: "{gross_revenue} - {refunds}"
    unit: USD
    grain: day
    period: calendar day
    owner: Finance
    source: [orders database, payment export]
    status: active
  - id: average_order_value
    name: Average order value
    definition: Net revenue per order placed in the day.
    type: ratio
    formula: "{net_revenue} / {orders}"
    unit: USD
    grain: day
    period: calendar day
    owner: Sales operations
    source: orders database
    status: active
```

## The reports file

The reports file lists each report or dashboard, who owns it, and the metrics it shows. It has two forms.

**YAML or JSON.** A mapping with a `reports` list. A report has a `name` (or an `id`), an `owner`, a `note` and `metrics`, a list in
which each entry is a metric id or a mapping with `metric` and, if the report calls it something else, `label`. A report named twice
(without case) is one report. A reports file read as YAML or JSON can be called anything that does not end in `.csv` or `.tsv`.

**A table.** A file whose name ends in `.csv` or `.tsv`, with a comma or a tab as the delimiter and one row for each metric shown.
The header names the columns, in any order: `report` (also `report_name`, `dashboard`, `report_id`), `metric` (also `metric_id`,
`id`), and, if you have them, `owner` (also `report_owner`, `maintainer`) and `label` (also `shown_as`, `displayed_as`,
`name_label`, `title`). The report and the metric are required. The owner of a report may be on any one of its rows. A table with no
`owner` column is not asked for owners.

## A short reports file

This reports file passes every check against the short dictionary above.

```yaml
reports:
  - name: Daily sales
    owner: Sales operations
    metrics:
      - orders
      - metric: net_revenue
        label: Revenue
      - average_order_value
```

## A short reports table

The same reports as a table.

```
report,owner,metric,label
Daily sales,Sales operations,orders,Orders
Daily sales,Sales operations,net_revenue,Revenue
Daily sales,Sales operations,average_order_value,
```

A quote that is never closed, text after a closing quote, a quote inside a cell that does not start with one, a missing required
column and a semicolon as the delimiter are refused with the line and column. A row with the wrong number of cells, no report or no
metric is a `field-invalid` finding and is left out.

## Labels

A label is what the report calls the metric. If it is left out, the report shows the name of the dictionary. A label is right when
it is the name of the metric or one of its aliases, compared without case and extra spaces. A label that is neither is
`report-label-differs`; the same label for two metrics is `report-label-clash`.
