import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, keyOf, normalize, parseJson, parseYaml, readDictionary, statusOf, wordsOf } from '../src/index.js';
import { WORK_LIMITS } from '../src/index.js';
import { dictText, findingsOf, lineOf, metric, runOf } from './helpers.js';

const model = (text) => runOf(text, null).model;
const read = (text) => {
  const found = [];
  const root = /^\s*[{[]/.test(text) ? parseJson(text) : parseYaml(text);
  const m = readDictionary(root, (id, where, message) => found.push({ id, where, message }), WORK_LIMITS);
  return { m, found };
};

test('normalize, wordsOf and keyOf: how names, words and keys are compared', () => {
  assert.equal(normalize('  Net   REVENUE\n'), 'net revenue');
  assert.deepEqual(wordsOf('Net-revenue (USD), per_day'), ['net', 'revenue', 'usd', 'per', 'day']);
  assert.deepEqual(wordsOf(''), []);
  assert.equal(keyOf(' Time-Window '), 'time_window');
  assert.equal(keyOf('time window'), 'time_window');
});

test('detectFormat: JSON when the first character opens a mapping or a list, otherwise YAML', () => {
  assert.equal(detectFormat('  \n {"a": 1}'), 'json');
  assert.equal(detectFormat('[1]'), 'json');
  assert.equal(detectFormat('metrics:\n'), 'yaml');
  assert.equal(detectFormat(''), 'yaml');
  assert.equal(detectFormat('   '), 'yaml');
});

test('statusOf: a metric with no status is read as active', () => {
  assert.equal(statusOf({ status: '' }), 'active');
  assert.equal(statusOf({ status: 'draft' }), 'draft');
});

test('readDictionary: every field of a metric is read, with the other names of the keys', () => {
  const { m, found } = read(JSON.stringify({
    name: 'Dictionary',
    metrics: [{
      id: ' m1 ', name: 'Metric one', definition: 'One.', formula: '{m2} + 1', unit: 'USD', grain: 'day', window: 'week', owner: 'Ann',
      sources: ['a', 'b'], status: 'DRAFT', replaced_by: 'm3', alias: 'First', exclusions: ['x'], aggregation: 'spread', type: 'Sum', numerator: '{m4}', denominator: 'all', note: 'n'
    }]
  }));
  assert.deepEqual(found, []);
  const x = m.metrics[0];
  assert.equal(m.name, 'Dictionary');
  assert.equal(x.id, 'm1');
  assert.equal(x.period, 'week');
  assert.deepEqual(x.sources, ['a', 'b']);
  assert.equal(x.status, 'draft');
  assert.equal(x.type, 'sum');
  assert.deepEqual(x.aliases, ['First']);
  assert.deepEqual(x.filters, ['x']);
  assert.deepEqual(x.refs.map((r) => r.id), ['m2', 'm4']);
  assert.equal(x.formula.kind, 'text');
  assert.equal(x.index, 0);
});

test('readDictionary: numbers are text, null is empty, and a metric with a problem is still read as far as it can be', () => {
  const { m, found } = read('{"metrics": [{"id": 7, "name": "Seven", "unit": null, "owner": false, "grain": 30}]}');
  assert.equal(m.metrics[0].id, '7');
  assert.equal(m.metrics[0].unit, '');
  assert.equal(m.metrics[0].owner, '');
  assert.equal(m.metrics[0].grain, '30');
  assert.deepEqual(found.map((f) => f.id), ['field-invalid']);
});

test('readDictionary: the formula as text, as a structure, empty or invalid', () => {
  const kinds = (formula) => read(JSON.stringify({ metrics: [{ id: 'a', name: 'A', formula }] })).m.metrics[0].formula.kind;
  assert.equal(kinds('1 + 1'), 'text');
  assert.equal(kinds({ op: 'add', args: [1, 2] }), 'tree');
  assert.equal(kinds(''), 'none');
  assert.equal(kinds(null), 'none');
  assert.equal(kinds([1]), 'invalid');
  assert.equal(kinds(true), 'invalid');
  assert.equal(kinds('{x'), 'invalid');
  assert.equal(kinds({ op: 'nope', args: [1] }), 'invalid');
  assert.equal(read('{"metrics": [{"id": "a", "name": "A"}]}').m.metrics[0].formula.kind, 'none');
});

test('readDictionary: the YAML form reads to the same model as the JSON form', () => {
  const yaml = 'name: D\nmetrics:\n  - id: a\n    name: A\n    formula: "{b} + 1"\n    aliases:\n      - Alpha\n      - First\n    status: active\n  - id: b\n    name: B\n    formula: count(x)\n';
  const json = JSON.stringify({ name: 'D', metrics: [{ id: 'a', name: 'A', formula: '{b} + 1', aliases: ['Alpha', 'First'], status: 'active' }, { id: 'b', name: 'B', formula: 'count(x)' }] });
  const a = read(yaml).m;
  const b = read(json).m;
  for (const key of ['id', 'name', 'status', 'aliases']) assert.deepEqual(a.metrics.map((x) => x[key]), b.metrics.map((x) => x[key]));
  assert.equal(a.metrics[0].formula.canonical, b.metrics[0].formula.canonical);
});

test('readDictionary: the line and column of the metric and of its keys are kept', () => {
  const text = 'metrics:\n  - id: a\n    name: A\n    unit: USD\n';
  const { m } = read(text);
  assert.equal(m.metrics[0].line, lineOf(text, '- id: a'));
  assert.equal(m.metrics[0].fields.get('unit').line, lineOf(text, 'unit:'));
  assert.equal(m.metricsLine, 1);
});

test('readDictionary: the mapping at the top, the list of metrics and its size are checked', () => {
  assert.equal(read('[1]').m, null);
  assert.equal(read('{"metrics": "x"}').m, null);
  assert.equal(read('{"metrics": {}}').m, null);
  assert.equal(read('{"metrics": []}').m, null);
  assert.equal(read('{"metrics": [5]}').m, null);
  assert.match(read('{"metrics": []}').found[0].message, /empty/);
  const tiny = { ...WORK_LIMITS, maxMetrics: 2 };
  const found = [];
  const three = readDictionary(parseJson('{"metrics": [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}, {"id": "c", "name": "C"}]}'), (id, w, message) => found.push(message), tiny);
  assert.equal(three, null);
  assert.match(found[0], /more than 2 metrics/);
});

test('readDictionary: the keys and values that are written twice, in JSON and in YAML, are refused by the readers', () => {
  assert.equal(findingsOf('{"metrics": [{"id": "a", "id": "b", "name": "A"}]}', null)[0].id, 'file-unreadable');
  assert.equal(findingsOf('metrics:\n  - id: a\n    id: b\n    name: A\n', null)[0].id, 'file-unreadable');
});

test('the model keeps the order of the metrics and numbers them from zero', () => {
  const m = model(dictText());
  assert.deepEqual(m.metrics.map((x) => x.id), ['orders', 'revenue', 'refunds', 'net_revenue', 'aov']);
  assert.deepEqual(m.metrics.map((x) => x.index), [0, 1, 2, 3, 4]);
  assert.equal(m.name, 'Test dictionary');
  assert.equal(metric('x', 'X').status, 'active');
});

test('names, ids and keys named like object properties are only names', () => {
  const text = JSON.stringify({ metrics: [metric('__proto__', 'constructor', { aliases: ['toString', 'hasOwnProperty'] }), metric('prototype', 'valueOf', { formula: '{__proto__} + 1' })] });
  const run = runOf(text, null);
  assert.deepEqual(run.findings.map((f) => f.id), []);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys({}).length, 0);
  const raw = '{"metrics": [{"id": "a", "name": "A", "__proto__": {"polluted": "yes"}, "constructor": 1}]}';
  assert.ok(findingsOf(raw, null).some((f) => f.id === 'field-unknown'));
  assert.equal({}.polluted, undefined);
});
