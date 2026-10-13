// Shared test helpers: dictionaries and reports built inline as objects or as text, checked in memory or written into a temporary
// folder that is removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux,
// macOS and Windows. The line a test expects is found with lineOf(), which counts lines the way the readers do, so a test never holds
// a line number worked out by hand for one system only. No test reads the clock, the time zone or the locale. Every metric, report
// and owner in the tests is made up.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkText, main, readOptions } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'metric-definition-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

// A metric that passes every check, with the fields changed by `over`.
export function metric(id, name, over = {}) {
  return {
    id,
    name,
    definition: `What the metric ${name} counts, in words that say more than its name.`,
    type: 'sum',
    formula: `sum(${id}.amount)`,
    unit: 'USD',
    grain: 'day',
    period: 'calendar day',
    owner: 'Finance',
    source: 'orders database',
    status: 'active',
    ...over
  };
}

// A small dictionary that passes every check: orders, revenue, refunds, net revenue (a sum of two amounts in one unit) and a ratio.
export function base() {
  return {
    name: 'Test dictionary',
    metrics: [
      metric('orders', 'Orders', { aliases: ['Order count'], definition: 'The orders a customer finished checkout for, counted on the day of checkout.', type: 'count', formula: 'count_distinct(orders.order_id)', unit: 'count', owner: 'Sales' }),
      metric('revenue', 'Gross revenue', { definition: 'The value of the goods on the orders of the day before refunds.', formula: 'sum(order_lines.amount)' }),
      metric('refunds', 'Refunds', { definition: 'The value paid back to customers in the day.', formula: 'sum(payments.refund)', source: 'payment export' }),
      metric('net_revenue', 'Net revenue', { aliases: ['Revenue'], definition: 'Gross revenue less the refunds of the same day.', formula: '{revenue} - {refunds}' }),
      metric('aov', 'Average order value', { definition: 'Net revenue per order placed in the day.', type: 'ratio', formula: '{net_revenue} / {orders}', owner: 'Sales' })
    ]
  };
}

// The text (JSON) of the base dictionary after change(dictionary) has edited a copy of it.
export function dictText(change = () => {}) {
  const dictionary = base();
  change(dictionary);
  return JSON.stringify(dictionary, null, 2);
}

// The base dictionary after a change to one metric, by id.
export function withMetric(id, over) {
  return dictText((d) => {
    const m = d.metrics.find((x) => x.id === id);
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) delete m[k];
      else m[k] = v;
    }
  });
}

// Reports that pass every check against the base dictionary.
export function reportsBase() {
  return {
    reports: [
      { name: 'Daily sales', owner: 'Sales', metrics: ['orders', { metric: 'net_revenue', label: 'Revenue' }, 'aov'] },
      { name: 'Finance pack', owner: 'Finance', metrics: ['revenue', 'refunds', { metric: 'net_revenue', label: 'Net revenue' }] }
    ]
  };
}

// The text (JSON) of the base reports after change(reports) has edited a copy.
export function reportsText(change = () => {}) {
  const reports = reportsBase();
  change(reports);
  return JSON.stringify(reports, null, 2);
}

// The rows of the base reports as a table, one row for each metric shown.
export function reportRows() {
  const out = [];
  for (const r of reportsBase().reports) {
    for (const item of r.metrics) out.push({ report: r.name, owner: r.owner, metric: typeof item === 'string' ? item : item.metric, label: typeof item === 'string' ? '' : item.label });
  }
  return out;
}

const COLUMNS = ['report', 'owner', 'metric', 'label'];

// CSV text for rows, with the columns given (all four by default).
export function csvOf(list, columns = COLUMNS) {
  const quote = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return `${[columns.join(','), ...list.map((r) => columns.map((c) => quote(String(r[c] ?? ''))).join(','))].join('\n')}\n`;
}

// The CSV text of the base report rows after change(rows) has edited them.
export function reportsCsv(change = () => {}, columns = COLUMNS) {
  const list = reportRows();
  change(list);
  return csvOf(list, columns);
}

// The whole run in memory. `as` is 'csv' when the reports are a table.
export const runOf = (dictionary, reports = null, options = {}, as = 'data') => checkText(dictionary, reports, { options: readOptions(options), reportsAs: as });

// The findings of a run in memory.
export const findingsOf = (dictionary, reports, options, as) => runOf(dictionary, reports, options, as).findings;

// The ids of the findings of a run.
export const idsOf = (dictionary, reports, options, as) => findingsOf(dictionary, reports, options, as).map((f) => f.id);

// The findings of one check.
export const ofCheck = (dictionary, reports, id, options, as) => findingsOf(dictionary, reports, options, as).filter((f) => f.id === id);

// The ids of the findings of the base dictionary after a change to a metric, and of the base reports after a change.
export const idsAfterMetric = (id, over, options) => idsOf(withMetric(id, over), null, options).sort();
export const idsAfterReports = (change, options) => idsOf(dictText(), reportsText(change), options).sort();
export const idsAfterRows = (change, options) => idsOf(dictText(), reportsCsv(change), options, 'csv').sort();

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base2) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base2);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

export const GOOD = { 'metrics.json': dictText(), 'reports.json': reportsText() };
export const ARGS = ['metrics.json', '--reports', 'reports.json'];

// A tree as plain data, for tests of the readers.
export function dump(node) {
  const done = [];
  const todo = [[node, (v) => done.push(v)]];
  while (todo.length) {
    const [n, set] = todo.pop();
    if (n.t === 's') set(n.v);
    else if (n.t === 'q') {
      const arr = [];
      set(arr);
      [...n.items.entries()].reverse().forEach(([i, item]) => todo.push([item, (v) => { arr[i] = v; }]));
    } else {
      const obj = Object.create(null);
      set(obj);
      for (const [k, e] of [...n.entries].reverse()) todo.push([e.node, (v) => { obj[k] = v; }]);
    }
  }
  return done[0];
}

// A tree as a plain object, for deepStrictEqual.
export const plain = (node) => JSON.parse(JSON.stringify(dump(node)));

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
