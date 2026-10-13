import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS } from '../src/index.js';
import { ARGS, allowed, cli, csvOf, dictText, findingsOf, idsOf, metric, reportRows, reportsCsv, reportsText, run } from './helpers.js';

const dict = dictText();
const HEAD = 'report,owner,metric,label\n';

const timed = (fn, ms) => {
  const start = Date.now();
  const result = fn();
  const took = Date.now() - start;
  assert.ok(took < allowed(ms), `took ${took} ms, allowed ${allowed(ms)} ms`);
  return result;
};

// n metrics that hold only an id and a name, as JSON.
const bare = (n, fn = (i) => ({ id: `m${i}`, name: `n${i}` })) => JSON.stringify({ metrics: Array.from({ length: n }, (_, i) => fn(i)) });

test('hostile: a dictionary of 100000 metrics is checked in good time', () => {
  const found = timed(() => findingsOf(bare(100000), null), 10000);
  assert.ok(found.every((f) => f.id !== 'file-unreadable'));
});

test('hostile: the most metrics allowed are read; one more is refused whole', () => {
  const ok = timed(() => idsOf(bare(WORK_LIMITS.maxMetrics), null), 20000);
  assert.ok(!ok.includes('file-unreadable'));
  assert.deepEqual(idsOf(bare(WORK_LIMITS.maxMetrics + 1), null), ['file-unreadable']);
});

test('hostile: every metric naming a metric that does not exist is capped at 1000 findings and still counted', async () => {
  const files = { 'metrics.json': bare(50000, (i) => ({ id: `m${i}`, name: `n${i}`, formula: `{x${i}} + {y${i}}` })) };
  const start = Date.now();
  const r = await run(files, ['metrics.json', '--json']);
  assert.ok(Date.now() - start < allowed(20000));
  const report = JSON.parse(r.out);
  assert.equal(report.findings.filter((f) => f.id === 'formula-unknown-metric').length, 1000);
  assert.equal(report.rules.find((x) => x.id === 'formula-unknown-metric').findings, 100000);
  assert.ok(report.notes.some((n) => /99,000 more findings of formula-unknown-metric/.test(n)));
});

test('hostile: one name or one id on every metric is a finding for each later metric, capped, and not quadratic', () => {
  const same = timed(() => findingsOf(bare(100000, (i) => ({ id: `m${i}`, name: 'same', aliases: ['a', 'b'] })), null), 10000);
  assert.ok(same.filter((f) => f.id === 'name-clash').length <= 1000);
  const ids = timed(() => findingsOf(bare(100000, (i) => ({ id: 'm', name: `n${i}`, formula: '{m} + {m}' })), null), 10000);
  assert.equal(ids.filter((f) => f.id === 'metric-duplicate-id').length, 1000);
  assert.equal(ids.filter((f) => f.id === 'metric-circular').length, 1);
});

test('hostile: a chain of 100000 metrics is no circle and does not overflow the stack; closed into a ring it is one finding', () => {
  const chain = bare(100000, (i) => ({ id: `m${i}`, name: `n${i}`, formula: `{m${i + 1}} + 1` }));
  const found = timed(() => findingsOf(chain, null), 10000);
  assert.equal(found.filter((f) => f.id === 'metric-circular').length, 0);
  assert.equal(found.filter((f) => f.id === 'formula-unknown-metric').length, 1);
  const ring = bare(100000, (i) => ({ id: `m${i}`, name: `n${i}`, formula: `{m${(i + 1) % 100000}} + 1` }));
  const circle = timed(() => findingsOf(ring, null), 10000).filter((f) => f.id === 'metric-circular');
  assert.equal(circle.length, 1);
  assert.match(circle[0].message, /100,000 metrics depend on each other in a circle/);
});

test('hostile: metrics that refer to each other in many small circles, and to themselves, are found once each', () => {
  const n = 1600;
  const found = timed(() => findingsOf(bare(n, (i) => ({ id: `m${i}`, name: `n${i}`, formula: `{m${i % 2 === 0 ? i + 1 : i - 1}}` })), null), 10000);
  assert.equal(found.filter((f) => f.id === 'metric-circular').length, n / 2);
  const self = findingsOf(bare(2500, (i) => ({ id: `m${i}`, name: `n${i}`, formula: `{m${i}} * 2` })), null);
  assert.equal(self.filter((f) => f.id === 'metric-circular').length, 1000);
});

test('hostile: replaced_by that goes in a circle, and a deprecated metric that names itself, are findings and not a loop', () => {
  const text = JSON.stringify({ metrics: [
    metric('a', 'A', { status: 'deprecated', replaced_by: 'b' }),
    metric('b', 'B', { status: 'deprecated', replaced_by: 'a' }),
    metric('c', 'C', { status: 'deprecated', replaced_by: 'c' })
  ] });
  const ids = timed(() => idsOf(text, null), 3000);
  assert.equal(ids.filter((id) => id === 'replaced-by-invalid').length, 3);
});

test('hostile: formulas of nested brackets, parentheses and braces are refused or read, quickly', () => {
  const nested = `{"metrics": [{"id": "a", "name": "A", "formula": ${'{"op": "add", "args": ['.repeat(100000)}`;
  assert.deepEqual(timed(() => idsOf(nested, null), 3000), ['file-unreadable']);
  const depth = (n) => `{"metrics": [{"id": "a", "name": "A", "formula": ${'{"op": "add", "args": ['.repeat(n)}1${']}'.repeat(n)}}]}`;
  assert.ok(!idsOf(depth(15), null).includes('field-invalid'));
  assert.deepEqual(idsOf(depth(WORK_LIMITS.maxFormulaDepth), null), ['file-unreadable']);
  const parens = JSON.stringify({ metrics: [metric('a', 'A', { formula: `${'('.repeat(9000)}{a}${')'.repeat(9000)}` })] });
  assert.ok(timed(() => idsOf(parens, null), 3000).includes('metric-circular'));
  const braces = JSON.stringify({ metrics: [metric('a', 'A', { formula: '{'.repeat(19000) })] });
  assert.ok(timed(() => idsOf(braces, null), 3000).includes('field-invalid'));
  const many = JSON.stringify({ metrics: [metric('a', 'A', { formula: Array.from({ length: 1500 }, (_, i) => `{m${i}}`).join(' + ') })] });
  assert.equal(timed(() => idsOf(many, null), 5000).filter((id) => id === 'formula-unknown-metric').length, 1000);
});

test('hostile: a formula with more parts than the limit is refused with a finding', () => {
  const args = Array.from({ length: WORK_LIMITS.maxFormulaNodes + 5 }, () => 1);
  const text = JSON.stringify({ metrics: [metric('a', 'A', { formula: { op: 'add', args } })] });
  const found = findingsOf(text, null);
  assert.deepEqual(found.map((f) => f.id), ['field-invalid']);
  assert.match(found[0].message, /more than 1000 parts/);
});

test('hostile: a dictionary of nested brackets is refused with a finding, quickly', () => {
  const text = `{"metrics": ${'['.repeat(100000)}}`;
  assert.deepEqual(timed(() => idsOf(text, null), 3000), ['file-unreadable']);
});

test('hostile: a deeply nested YAML dictionary is refused with a finding, quickly', () => {
  let text = 'metrics:\n';
  for (let i = 0; i < 3000; i += 1) text += `${' '.repeat(2 + i)}k${i}:\n`;
  assert.deepEqual(timed(() => idsOf(text, null), 3000), ['file-unreadable']);
});

test('hostile: a YAML dictionary of 200000 lines is read in good time', () => {
  let text = 'metrics:\n';
  for (let i = 0; i < 20000; i += 1) text += `  - id: m${i}\n    name: n${i}\n    definition: What the measure ${i} counts in the day.\n    formula: sum(t${i}.x)\n    unit: USD\n    grain: day\n    owner: Finance\n    source: db\n    status: active\n    type: sum\n`;
  assert.deepEqual(timed(() => idsOf(text, null), 15000), []);
});

test('hostile: a long line of one character does not hang the readers', () => {
  assert.deepEqual(timed(() => idsOf(`metrics:\n  - id: a\n    name: ${'"'.repeat(100000)}\n`, null), 3000), ['file-unreadable']);
  assert.deepEqual(timed(() => idsOf(`{"a": "${'\\'.repeat(100000)}`, null), 3000), ['file-unreadable']);
  assert.deepEqual(timed(() => idsOf(dict, `${HEAD}${'"'.repeat(100000)}`, {}, 'csv'), 3000), ['file-unreadable']);
  assert.deepEqual(timed(() => idsOf(dict, `${HEAD}a,${'x'.repeat(100000)},orders,\n`, {}, 'csv'), 3000), ['file-unreadable']);
});

test('hostile: CSV quote tricks are refused with a finding that names the line, and never shift a column', () => {
  const tricks = [
    ['"Daily,Sales,orders,\n', 2],
    ['Dai"ly,Sales,orders,\n', 2],
    ['"Daily"junk,Sales,orders,\n', 2],
    ['Daily,"Sales,orders,\nB,x,orders,\n', 2],
    ['Daily,Sales,"orders"x,\n', 2],
    ['Daily,Sales,orders,"label\n', 2]
  ];
  for (const [rest, line] of tricks) {
    const found = findingsOf(dict, HEAD + rest, {}, 'csv');
    assert.deepEqual(found.map((f) => f.id), ['file-unreadable'], rest);
    assert.equal(found[0].line, line, rest);
  }
});

test('hostile: a quoted cell may hold a line end and a comma; the rows after it keep their own lines', () => {
  const found = findingsOf(dict, `${HEAD}"Daily\nsales",Sales,orders,\nB,x,"or,ders",\nC,x,nope1,\n`, {}, 'csv');
  const unknown = found.filter((f) => f.id === 'report-unknown-metric');
  assert.deepEqual(unknown.map((f) => f.line), [4, 5]);
});

test('hostile: a spreadsheet formula in a cell is only text, and is shown as text', async () => {
  const files = { 'metrics.json': dict, 'reports.csv': `${HEAD}=HYPERLINK("http://example.org"),Sales,orders,\n+cmd|' /C calc'!A0,Sales,@SUM(1),\n` };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const r = await run(files, ['metrics.json', '--reports', 'reports.csv', '--format', format]);
    assert.ok(r.out.length > 0, format);
    assert.equal(r.err, '');
  }
});

test('hostile: too many columns and a header of thousands of names are refused', () => {
  const wide = `${Array.from({ length: WORK_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`).join(',')}\n`;
  assert.deepEqual(idsOf(dict, wide, {}, 'csv'), ['file-unreadable']);
  const cells = `${HEAD}${'A,Sales,orders,\n'.repeat(10)}`;
  assert.deepEqual(idsOf(dict, cells, {}, 'csv').filter((id) => id === 'file-unreadable'), []);
});

test('hostile: a semicolon-separated table is refused, not read as one column', () => {
  assert.deepEqual(idsOf(dict, 'report;owner;metric;label\nA;Sales;orders;\n', {}, 'csv'), ['file-unreadable']);
});

test('hostile: a reports table of 500000 rows is read in good time; one more is refused whole', () => {
  const full = `report,metric\n${'A,orders\n'.repeat(WORK_LIMITS.maxRows)}`;
  const ok = timed(() => idsOf(dict, full, {}, 'csv'), 20000);
  assert.ok(!ok.includes('file-unreadable'));
  assert.deepEqual(idsOf(dict, `${full}A,orders\n`, {}, 'csv').filter((id) => id === 'file-unreadable'), ['file-unreadable']);
});

test('hostile: 100000 reports with 5 metrics each are checked in good time', () => {
  const reports = JSON.stringify({ reports: Array.from({ length: 100000 }, (_, i) => ({ name: `r${i}`, owner: 'Ann', metrics: ['orders', 'revenue', { metric: 'refunds', label: `l${i}` }, `unknown${i}`, 'aov'] })) });
  const found = timed(() => findingsOf(dict, reports), 20000);
  assert.ok(found.filter((f) => f.id === 'report-unknown-metric').length <= 1000);
});

test('hostile: one label on every row for different metrics is capped and not quadratic', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => ({ report: `r${i % 50}`, owner: 'Ann', metric: ['orders', 'revenue', 'refunds'][i % 3], label: 'Same' }));
  const found = timed(() => findingsOf(dict, csvOf(rows), {}, 'csv'), 15000);
  assert.ok(found.filter((f) => f.id === 'report-label-clash').length <= 1000);
});

test('hostile: metrics, aliases, reports, labels and ids named like object properties are only names', () => {
  const names = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf'];
  const text = JSON.stringify({ metrics: names.map((n, i) => metric(n, `${n} measure`, { aliases: [names[(i + 1) % names.length]], formula: `sum(${n}.x)` })) });
  const run1 = findingsOf(text, null);
  assert.deepEqual(run1.filter((f) => f.id === 'name-clash'), []);
  const reports = JSON.stringify({ reports: names.map((n) => ({ name: n, owner: n, metrics: [n, { metric: n, label: n }] })) });
  const found = findingsOf(text, reports);
  assert.equal(found.filter((f) => f.id === 'report-unknown-metric').length, 0);
  assert.equal(found.filter((f) => f.id === 'report-label-differs').length, names.length);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys({}).length, 0);
  assert.equal(({}).constructor, Object);
  const raw = '{"metrics": [{"id": "a", "name": "A", "__proto__": {"polluted": "yes"}, "constructor": 1}], "__proto__": 5}';
  assert.ok(idsOf(raw, null).includes('field-unknown'));
  assert.equal({}.polluted, undefined);
});

test('hostile: names, labels and reports with control and direction characters are cleaned in every report', async () => {
  const bad = `a${String.fromCharCode(27)}[31m${String.fromCharCode(0x202e)}b`;
  const text = dictText((d) => { d.metrics[1].name = bad; d.metrics[2].owner = bad; delete d.metrics[1].definition; });
  const rows = reportRows();
  rows[0].report = bad;
  rows[1].label = bad;
  rows[2].metric = bad;
  const files = { 'metrics.json': text, 'reports.csv': csvOf(rows) };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const r = await run(files, ['metrics.json', '--reports', 'reports.csv', '--format', format]);
    assert.equal(r.code, 1);
    assert.ok(!r.out.includes(String.fromCharCode(27)), format);
    assert.ok(!r.out.includes(String.fromCharCode(0x202e)), format);
    assert.ok(!r.out.includes(String.fromCharCode(0)), format);
  }
});

test('hostile: binary-looking files are not read as a dictionary or a table', async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const r = await run({ 'metrics.json': bytes, 'reports.csv': 'x' }, ['metrics.json', '--reports', 'reports.csv']);
  assert.equal(r.code, 2);
  assert.match(r.err, /holds a null byte/);
  const invalid = await run({ 'metrics.json': Buffer.from([0x7b, 0xff, 0xfe, 0x7d, 0x41]), 'reports.csv': 'x' }, ['metrics.json', '--reports', 'reports.csv']);
  assert.equal(invalid.code, 2);
  assert.match(invalid.err, /is not valid UTF-8/);
});

test('hostile: the same input gives the same report every time', async () => {
  const files = { 'metrics.json': bare(1500, (i) => ({ id: `m${i}`, name: `n${i % 40}`, formula: `{m${(i * 7) % 1500}}` })), 'reports.csv': reportsCsv() };
  const a = await run(files, ['metrics.json', '--reports', 'reports.csv', '--json']);
  const b = await run(files, ['metrics.json', '--reports', 'reports.csv', '--json']);
  assert.equal(a.out, b.out);
});

test('hostile: a file past the size limit is refused whole, and one at the limit is read', async () => {
  const limit = 16 * 1024 * 1024;
  const over = await run({ 'metrics.json': dict, 'reports.csv': Buffer.alloc(limit + 1, 0x20) }, ['metrics.json', '--reports', 'reports.csv']);
  assert.equal(over.code, 2);
  assert.match(over.err, /reports\.csv: is larger than 16777216 bytes/);
  const exact = await run({ 'metrics.json': Buffer.concat([Buffer.from(dict), Buffer.alloc(limit - dict.length, 0x20)]) }, ['metrics.json']);
  assert.notEqual(exact.code, 2);
});

test('hostile: a flood of unknown keys and columns is reported without a flood of findings in the other checks', () => {
  const header = Array.from({ length: 40 }, (_, i) => `extra${i}`).join(',');
  const found = findingsOf(dict, `report,metric,${header}\n`, {}, 'csv');
  assert.equal(found.filter((f) => f.id === 'field-unknown').length, 40);
  assert.equal(found.length, 40);
  const keys = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`key${i}`, 1]));
  const many = findingsOf(JSON.stringify({ metrics: [metric('a', 'A', keys)] }), null);
  assert.equal(many.filter((f) => f.id === 'field-unknown').length, 500);
});

test('hostile: a cell and a text of the longest length are read; one character more is refused', () => {
  const ok = findingsOf(JSON.stringify({ metrics: [metric('a', 'A', { definition: 'x'.repeat(WORK_LIMITS.maxTextLength) })] }), null);
  assert.deepEqual(ok, []);
  const long = findingsOf(JSON.stringify({ metrics: [metric('a', 'A', { definition: 'x'.repeat(WORK_LIMITS.maxTextLength + 1) })] }), null);
  assert.ok(long.some((f) => f.id === 'field-invalid'));
  assert.deepEqual(idsOf(dict, `${HEAD}A,Sales,orders,${'x'.repeat(WORK_LIMITS.maxCellLength + 1)}\n`, {}, 'csv'), ['file-unreadable']);
});

test('hostile: the command line with a very long argument is refused or cleaned, not echoed whole', async () => {
  const r = await cli(['--explain', 'x'.repeat(100000)], '/');
  assert.equal(r.code, 2);
  assert.ok(r.err.length < 5000);
  const s = await cli(['--bogus'.padEnd(5000, 'x')], '/');
  assert.equal(s.code, 2);
  assert.ok(s.err.length < 5000);
});

test('hostile: the dictionary named twice, or a reports file with the dictionary in it, never loops', async () => {
  const r = await run({ 'metrics.json': dict }, ['metrics.json', '--reports', 'metrics.json']);
  assert.equal(r.code, 2);
  const s = await run({ 'metrics.json': dict, 'reports.json': dict }, ARGS);
  assert.equal(s.code, 1);
  assert.match(s.out, /file-unreadable/);
  const t = await run({ 'metrics.json': reportsText(), 'reports.json': reportsText() }, ARGS);
  assert.equal(t.code, 1);
});
