import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS, isTable, parseJson, parseYaml, readReportsTable, readReportsTree } from '../src/index.js';
import { csvOf, lineOf, reportRows, reportsBase } from './helpers.js';

const tree = (text, limits = WORK_LIMITS) => {
  const found = [];
  const root = /^\s*[{[]/.test(text) ? parseJson(text) : parseYaml(text);
  const m = readReportsTree(root, (id, where, message) => found.push({ id, where, message }), limits);
  return { m, found };
};
const table = (text, limits = WORK_LIMITS) => {
  const found = [];
  const m = readReportsTable(text, (id, where, message) => found.push({ id, where, message }), limits);
  return { m, found };
};

test('isTable: a name that ends in .csv or .tsv is a table', () => {
  assert.equal(isTable('reports.csv'), true);
  assert.equal(isTable('a/b/Reports.TSV'), true);
  assert.equal(isTable('reports.json'), false);
  assert.equal(isTable('reports.yaml'), false);
  assert.equal(isTable('reports.csv.bak'), false);
});

test('readReportsTree: reports, owners, metrics as ids and as mappings with a label', () => {
  const { m, found } = tree(JSON.stringify(reportsBase()));
  assert.deepEqual(found, []);
  assert.deepEqual(m.reports.map((r) => r.name), ['Daily sales', 'Finance pack']);
  assert.deepEqual(m.reports.map((r) => r.owner), ['Sales', 'Finance']);
  assert.equal(m.rows, 6);
  assert.deepEqual(m.items.map((i) => i.metric), ['orders', 'net_revenue', 'aov', 'revenue', 'refunds', 'net_revenue']);
  assert.deepEqual(m.items.map((i) => i.label), ['', 'Revenue', '', '', '', 'Net revenue']);
  assert.equal(m.ownerColumn, true);
});

test('readReportsTree: the YAML form reads like the JSON form, with lines and columns', () => {
  const text = 'name: R\nreports:\n  - name: Daily sales\n    owner: Sales\n    metrics:\n      - orders\n      - metric: net_revenue\n        label: Revenue\n';
  const { m, found } = tree(text);
  assert.deepEqual(found, []);
  assert.deepEqual(m.items.map((i) => [i.metric, i.label]), [['orders', ''], ['net_revenue', 'Revenue']]);
  assert.equal(m.items[0].line, lineOf(text, '- orders'));
  assert.equal(m.items[1].labelPlace.line, lineOf(text, 'label:'));
  assert.equal(m.reports[0].ownerPlace.line, lineOf(text, 'owner:'));
});

test('readReportsTree: a report may use "id" in place of "name", and a report named twice is one report', () => {
  const { m } = tree('{"reports": [{"id": "r1", "metrics": ["a"]}, {"name": "R1", "metrics": ["b"]}, {"name": "r1", "owner": "Ann"}]}');
  assert.equal(m.reports.length, 1);
  assert.equal(m.reports[0].items.length, 2);
  assert.equal(m.reports[0].owner, 'Ann');
});

test('readReportsTree: what cannot be used is a finding and is left out', () => {
  const ids = (text) => tree(text).found.map((f) => f.id);
  assert.deepEqual(ids('{"reports": [{"metrics": ["a"]}]}'), ['field-invalid']);
  assert.deepEqual(ids('{"reports": [3]}'), ['field-invalid']);
  assert.deepEqual(ids('{"reports": [{"name": "r", "metrics": 3}]}'), ['field-invalid']);
  assert.deepEqual(ids('{"reports": [{"name": "r", "metrics": [null, true, [], {"label": "x"}, ""]}]}'), ['field-invalid', 'field-invalid', 'field-invalid', 'field-invalid', 'field-invalid']);
  assert.deepEqual(ids('{"reports": [{"name": "r", "metrics": [{"metric": "a", "lable": "x"}]}]}'), ['field-unknown']);
  assert.deepEqual(ids('{"reports": [{"name": "r"}]}'), []);
  assert.equal(tree('{"reports": [{"name": "r"}]}').m.items.length, 0);
});

test('readReportsTree: the mapping at the top, the list of reports and its size are checked', () => {
  assert.equal(tree('[1]').m, null);
  assert.equal(tree('{"x": 1}').m, null);
  assert.equal(tree('{"reports": 4}').m, null);
  assert.deepEqual(tree('{"reports": []}').m.reports, []);
  const found = [];
  assert.equal(readReportsTree(parseJson('{"reports": [{"name": "a"}, {"name": "b"}]}'), (id, w, message) => found.push(message), { ...WORK_LIMITS, maxReports: 1 }), null);
  assert.match(found[0], /more than 1 reports/);
  const many = [];
  assert.equal(readReportsTree(parseJson('{"reports": [{"name": "a", "metrics": ["x", "y"]}]}'), (id, w, message) => many.push(message), { ...WORK_LIMITS, maxMetrics: 1 }), null);
  assert.match(many[0], /shows more than 1 metrics/);
});

test('readReportsTable: one row for each metric shown, grouped by report name without case', () => {
  const { m, found } = table(csvOf(reportRows()));
  assert.deepEqual(found, []);
  assert.deepEqual(m.reports.map((r) => r.name), ['Daily sales', 'Finance pack']);
  assert.equal(m.rows, 6);
  assert.deepEqual(m.reports.map((r) => r.items.length), [3, 3]);
  assert.equal(m.ownerColumn, true);
  assert.equal(table('report,metric\nA,x\na,y\n').m.reports.length, 1);
});

test('readReportsTable: the columns may have other names, any order and tabs; the owner may be on any row', () => {
  const { m, found } = table('Metric_ID\tDashboard\tOwner\nx\tA\t\ny\tA\tAnn\n');
  assert.deepEqual(found, []);
  assert.equal(m.reports[0].owner, 'Ann');
  assert.deepEqual(m.items.map((i) => i.metric), ['x', 'y']);
  assert.equal(table('report,metric\nA,x\n').m.ownerColumn, false);
});

test('readReportsTable: a header without its columns, two columns for one thing and a table with no rows', () => {
  assert.equal(table('owner,label\na,b\n').m, null);
  assert.match(table('owner,label\na,b\n').found[0].message, /no column for the name of the report or the metric id/);
  assert.equal(table('report,dashboard,metric\na,b,c\n').m, null);
  assert.match(table('report,dashboard,metric\na,b,c\n').found[0].message, /Two columns are the name of the report/);
  assert.deepEqual(table('report,metric\n').m.reports, []);
});

test('readReportsTable: a row with the wrong number of cells, no report or no metric is a finding and is left out', () => {
  const { m, found } = table('report,metric,label\nA,x,X\nA,y\n,z,Z\nB,,W\nB,w,W\n');
  assert.deepEqual(found.map((f) => f.id), ['field-invalid', 'field-invalid', 'field-invalid']);
  assert.deepEqual(m.items.map((i) => i.metric), ['x', 'w']);
  assert.deepEqual(found.map((f) => f.where.line), [3, 4, 5]);
});

test('readReportsTable: a quoted cell may hold a comma and a line end, and the rows after it keep their own lines', () => {
  const { m, found } = table('report,metric,label\nA,x,"One, two\nthree"\nA,y,Y\n');
  assert.deepEqual(found, []);
  assert.equal(m.items[0].label, 'One, two\nthree');
  assert.equal(m.items[1].line, 4);
});

test('readReportsTable: a table that cannot be followed is a file-unreadable finding with the line', () => {
  const { m, found } = table('report,metric\nA,"x\n');
  assert.equal(m, null);
  assert.equal(found[0].id, 'file-unreadable');
  assert.equal(found[0].where.line, 2);
  assert.match(found[0].message, /^The reports file cannot be read as CSV: the quote/);
});
