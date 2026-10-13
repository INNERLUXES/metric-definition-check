// The model of a reports file: each report or dashboard with its owner and the metrics it shows, each under the label it uses. The
// file is YAML or JSON (a "reports" list) or a CSV table with one row for each metric shown. A value that cannot be used is a
// finding and is left out; a file that cannot be followed at all is a file-unreadable finding.

import { show } from './collect.js';
import { COLUMNS, REPORTS_KEYS, REPORT_KEYS, REQUIRED_COLUMNS, SHOWN_KEYS } from './data.js';
import { CsvError, cellAt, readTable } from './csv.js';
import { keyOf, keysOf, normalize, textOf } from './dictionary.js';
import { nearest } from './fields.js';
import { describe } from './nodes.js';

const at = (line, column) => ({ file: 'reports', line, column });

const FIELD_NAMES = new Map(Object.entries(COLUMNS).flatMap(([field, names]) => names.map((n) => [n, field])));
const ALL_NAMES = [...FIELD_NAMES.keys()];
const WHAT = { report: 'the name of the report', owner: 'the owner', metric: 'the metric id', label: 'the label' };

// Adds a report to the model, or finds the one of that name already there. Reports are told apart by name without case.
function reportFor(model, name, line, column) {
  const key = normalize(name);
  let report = model.byName.get(key);
  if (report === undefined) {
    report = { index: model.reports.length, name, line, column, owner: '', ownerPlace: null, items: [] };
    model.byName.set(key, report);
    model.reports.push(report);
  }
  return report;
}

// Reads the reports from the tree of a YAML or JSON file. Returns { reports, items, rows, ownerColumn } or null after a
// file-unreadable finding. An item is { report, metric, label, line, column, labelPlace }.
export function readReportsTree(root, add, limits) {
  if (root.t !== 'm') {
    add('file-unreadable', at(root.line, root.col), 'The reports file must be a mapping with a "reports" list, written as docs/inputs.md shows.');
    return null;
  }
  const top = keysOf(root, REPORTS_KEYS, new Map(), 'The reports file', add, 'reports');
  const entry = top.get('reports');
  if (entry === undefined) {
    add('file-unreadable', at(root.line, root.col), 'The reports file has no "reports" list.');
    return null;
  }
  if (entry.node.t !== 'q') {
    add('file-unreadable', at(entry.line, entry.col), `"reports" must be a list of reports, not ${describe(entry.node)}.`);
    return null;
  }
  if (entry.node.items.length > limits.maxReports) {
    add('file-unreadable', at(entry.line, entry.col), `The reports file has more than ${limits.maxReports} reports.`);
    return null;
  }
  const model = { byName: new Map(), reports: [], items: [], rows: 0, ownerColumn: true };
  for (const [index, node] of entry.node.items.entries()) {
    if (node.t !== 'm') {
      add('field-invalid', at(node.line, node.col), `Item ${index + 1} of "reports" must be a mapping with the keys of a report, not ${describe(node)}.`);
      continue;
    }
    const what = `The report at line ${node.line}`;
    const fields = keysOf(node, REPORT_KEYS, new Map(), what, add, 'reports');
    const name = textOf(fields, 'name', what, add, limits, 'reports') || textOf(fields, 'id', what, add, limits, 'reports') || '';
    if (name === '') {
      add('field-invalid', at(node.line, node.col), `${what} has no "name" or "id"; a finding about a report needs a name to call it by.`);
      continue;
    }
    const report = reportFor(model, name, node.line, node.col);
    const label = `The report "${show(name, 60)}"`;
    const owner = textOf(fields, 'owner', label, add, limits, 'reports') ?? '';
    if (owner !== '' && report.owner === '') {
      report.owner = owner;
      report.ownerPlace = at(fields.get('owner').line, fields.get('owner').col);
    }
    const shown = fields.get('metrics');
    if (shown === undefined) continue;
    if (shown.node.t !== 'q') {
      add('field-invalid', at(shown.line, shown.col), `${label}: "metrics" must be a list, not ${describe(shown.node)}.`, 'metrics');
      continue;
    }
    if (shown.node.items.length > limits.maxMetrics) {
      add('file-unreadable', at(shown.line, shown.col), `${label} shows more than ${limits.maxMetrics} metrics.`);
      return null;
    }
    for (const item of shown.node.items) {
      let metric = '';
      let shownLabel = '';
      let labelPlace = at(item.line, item.col);
      if (item.t === 's') {
        if (item.v === null || typeof item.v === 'boolean') {
          add('field-invalid', at(item.line, item.col), `${label}: an entry of "metrics" must be a metric id or a mapping with "metric" and "label", not ${describe(item)}.`, 'metrics');
          continue;
        }
        metric = String(item.v).trim();
      } else if (item.t === 'm') {
        const f = keysOf(item, SHOWN_KEYS, new Map(), `${label}, an entry of "metrics"`, add, 'reports');
        metric = textOf(f, 'metric', label, add, limits, 'reports') ?? '';
        shownLabel = textOf(f, 'label', label, add, limits, 'reports') ?? '';
        if (f.get('label')) labelPlace = at(f.get('label').line, f.get('label').col);
      } else {
        add('field-invalid', at(item.line, item.col), `${label}: an entry of "metrics" must be a metric id or a mapping with "metric" and "label", not ${describe(item)}.`, 'metrics');
        continue;
      }
      if (metric === '') {
        add('field-invalid', at(item.line, item.col), `${label}: an entry of "metrics" names no metric.`, 'metrics');
        continue;
      }
      if (metric.length > limits.maxTextLength) {
        add('field-invalid', at(item.line, item.col), `${label}: a metric id is longer than ${limits.maxTextLength} characters.`, 'metrics');
        continue;
      }
      model.rows += 1;
      const it = { report, metric, label: shownLabel, line: item.line, column: item.col, labelPlace };
      report.items.push(it);
      model.items.push(it);
    }
  }
  return model;
}

// Reads the reports from the text of a CSV file with one row for each metric shown.
export function readReportsTable(text, add, limits) {
  let table;
  try {
    table = readTable(text, { limits });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    add('file-unreadable', at(error.line, error.column), `The reports file cannot be read as CSV: ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}.`);
    return null;
  }
  const columns = {};
  const header = table.header;
  for (const [i, cell] of header.cells.entries()) {
    const key = keyOf(cell);
    const field = FIELD_NAMES.get(key);
    const where = cellAt(header, i);
    if (field === undefined) {
      const near = key === '' ? null : nearest(key, ALL_NAMES, key.length < 5 ? 1 : 2);
      add('field-unknown', at(where.line, where.column), key === '' ? 'A column has no name; its cells are not read.' : `The column "${show(cell, 40)}" is not one the tool reads; its cells are not read.${near ? ` Did you mean "${near}"?` : ''}`, cell);
    } else if (columns[field] !== undefined) {
      add('file-unreadable', at(where.line, where.column), `Two columns are ${WHAT[field]} ("${show(header.cells[columns[field]], 40)}" and "${show(cell, 40)}"); give one.`);
      return null;
    } else columns[field] = i;
  }
  const missing = REQUIRED_COLUMNS.filter((f) => columns[f] === undefined);
  if (missing.length > 0) {
    add('file-unreadable', at(header.line, 1), `The reports table has no column for ${missing.map((f) => WHAT[f]).join(' or ')}; the header needs ${REQUIRED_COLUMNS.map((f) => COLUMNS[f][0]).join(' and ')}.`);
    return null;
  }
  const model = { byName: new Map(), reports: [], items: [], rows: 0, ownerColumn: columns.owner !== undefined };
  for (const row of table.rows) {
    if (row.cells.length !== header.cells.length) {
      add('field-invalid', at(row.line, 1), `The row has ${row.cells.length} cells and the header has ${header.cells.length}.`, 'row');
      continue;
    }
    const cell = (f) => (columns[f] === undefined ? '' : row.cells[columns[f]].trim());
    const place = (f) => {
      const w = cellAt(row, columns[f] ?? 0);
      return at(w.line, w.column);
    };
    const name = cell('report');
    const metric = cell('metric');
    if (name === '') {
      add('field-invalid', place('report'), 'The row names no report.', 'report');
      continue;
    }
    if (metric === '') {
      add('field-invalid', place('metric'), `The row of the report "${show(name, 60)}" names no metric.`, 'metric');
      continue;
    }
    const where = place('report');
    const report = reportFor(model, name, where.line, where.column);
    const owner = cell('owner');
    if (owner !== '' && report.owner === '') {
      report.owner = owner;
      report.ownerPlace = place('owner');
    }
    if (report.ownerPlace === null && columns.owner !== undefined) report.ownerPlace = place('owner');
    model.rows += 1;
    const w = place('metric');
    const it = { report, metric, label: cell('label'), line: w.line, column: w.column, labelPlace: columns.label === undefined ? w : place('label') };
    report.items.push(it);
    model.items.push(it);
  }
  return model;
}

