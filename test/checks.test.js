import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base, dictText, findingsOf, idsAfterMetric, idsAfterReports, idsAfterRows, idsOf, lineOf, metric, ofCheck, reportsBase, reportsCsv, reportsText, withMetric } from './helpers.js';

const only = (id, over) => idsAfterMetric(id, over);

test('the base dictionary and the base reports pass every check, as JSON and as a table', () => {
  assert.deepEqual(idsOf(dictText(), reportsText()), []);
  assert.deepEqual(idsOf(dictText(), reportsCsv(), {}, 'csv'), []);
  assert.deepEqual(idsOf(dictText(), null), []);
});

test('file-unreadable: a syntax error, a dictionary that is not a mapping, with no metrics or with an empty list', () => {
  for (const text of ['{', '{"metrics": [}', '[]', '"text"', '{"name": "x"}', '{"metrics": []}', '{"metrics": 5}', '{"metrics": [1, 2]}']) {
    assert.ok(idsOf(text, null).includes('file-unreadable') || text === '{"metrics": [1, 2]}', text);
  }
  assert.deepEqual(idsOf('{"metrics": [1, 2]}', null), ['field-invalid', 'field-invalid', 'file-unreadable']);
  assert.deepEqual(idsOf('{"metrics": []}', null), ['file-unreadable']);
  const found = findingsOf('{\n  "metrics": [\n    {"id": "a",,}\n  ]\n}', null);
  assert.equal(found[0].id, 'file-unreadable');
  assert.equal(found[0].line, 3);
  assert.deepEqual(idsOf('metrics:\n  - id: a\n    name: A: B\n', null), ['file-unreadable']);
});

test('file-unreadable: the reports file, as a list, a table without its columns, or with a quote that never closes', () => {
  assert.ok(idsOf(dictText(), '[1]').includes('file-unreadable'));
  assert.ok(idsOf(dictText(), '{"name": "x"}').includes('file-unreadable'));
  assert.ok(idsOf(dictText(), '{"reports": 5}').includes('file-unreadable'));
  assert.deepEqual(idsOf(dictText(), 'report,owner\nA,B\n', {}, 'csv'), ['file-unreadable']);
  assert.deepEqual(idsOf(dictText(), 'report,metric\n"A,orders\n', {}, 'csv'), ['file-unreadable']);
  assert.deepEqual(idsOf(dictText(), 'report,metric,report\nA,orders,B\n', {}, 'csv'), ['file-unreadable']);
  assert.deepEqual(idsOf(dictText(), 'report;metric\nA;orders\n', {}, 'csv'), ['file-unreadable']);
});

test('field-invalid: a metric with no id or no name, a status or a type that is not allowed', () => {
  assert.deepEqual(only('aov', { id: undefined }), ['field-invalid']);
  assert.deepEqual(only('orders', { id: undefined }), ['field-invalid', 'formula-unknown-metric']);
  assert.deepEqual(only('aov', { name: undefined }), ['field-invalid']);
  assert.deepEqual(only('aov', { name: '' }), ['field-invalid']);
  assert.deepEqual(only('orders', { status: 'retired' }), ['field-invalid']);
  assert.deepEqual(only('orders', { type: 'volume' }), ['field-invalid']);
  assert.deepEqual(only('aov', { status: 'Deprecated', replaced_by: 'revenue' }), []);
  assert.deepEqual(only('orders', { type: 'COUNT' }), []);
});

test('field-invalid: a value that is not text, a formula that cannot be followed, a list that is too long', () => {
  assert.deepEqual(only('orders', { definition: ['a'] }), ['field-invalid', 'metric-no-definition']);
  assert.deepEqual(only('orders', { unit: true }), ['field-invalid', 'metric-no-unit']);
  assert.deepEqual(only('orders', { owner: { a: 1 } }), ['field-invalid', 'metric-no-owner']);
  assert.deepEqual(only('orders', { formula: ['a'] }), ['field-invalid']);
  assert.deepEqual(only('orders', { formula: 'count({x)' }), ['field-invalid']);
  assert.deepEqual(only('orders', { formula: 'count(x) + {}' }), ['field-invalid']);
  assert.deepEqual(only('orders', { formula: 'count(x))' }), ['field-invalid']);
  assert.deepEqual(only('orders', { formula: 'count((x)' }), ['field-invalid']);
  assert.deepEqual(only('orders', { formula: 'count(x) }' }), ['field-invalid']);
  assert.deepEqual(only('orders', { aliases: Array.from({ length: 201 }, (_, i) => `alias ${i}`) }), ['field-invalid']);
  assert.deepEqual(only('orders', { aliases: [1, 'Order total'] }), []);
  assert.deepEqual(only('orders', { source: [['x']] }), ['field-invalid', 'metric-no-source']);
  assert.deepEqual(only('orders', { definition: 'x'.repeat(20001) }), ['field-invalid', 'metric-no-definition']);
  assert.deepEqual(only('orders', { formula: 'x'.repeat(20001) }), ['field-invalid']);
});

test('field-invalid: an item of metrics that is not a mapping', () => {
  const found = findingsOf('{"metrics": ["a", {"id": "b", "name": "B"}]}', null);
  assert.equal(found.filter((f) => f.id === 'field-invalid').length, 1);
  assert.match(found.find((f) => f.id === 'field-invalid').message, /Item 1 of "metrics" must be a mapping/);
});

test('field-unknown: a misspelt key is named with the nearest key, and nothing under it is read', () => {
  const found = ofCheck(dictText((d) => { d.metrics[0].defintion = d.metrics[0].definition; delete d.metrics[0].definition; }), null, 'field-unknown');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /Did you mean "definition"\?/);
  assert.deepEqual(only('orders', { ownr: 'Sales', owner: undefined }), ['field-unknown', 'metric-no-owner']);
  assert.deepEqual(ofCheck(dictText((d) => { d.extra = 1; }), null, 'field-unknown').length, 1);
  assert.deepEqual(only('orders', { colour: 'blue' }), ['field-unknown']);
});

test('field-unknown: other names of a key are read, in any case, and a key given under two names is an error', () => {
  assert.deepEqual(only('orders', { window: 'calendar day', period: undefined }), []);
  assert.deepEqual(only('orders', { time_window: 'calendar day', period: undefined }), []);
  assert.deepEqual(only('orders', { Source_System: 'orders database', source: undefined }), []);
  assert.deepEqual(only('orders', { Owner: 'Sales', owner: undefined }), []);
  assert.deepEqual(only('orders', { 'time-window': 'calendar day', period: undefined }), []);
  assert.deepEqual(only('orders', { window: 'calendar week' }), ['field-invalid']);
  assert.deepEqual(only('orders', { exclusions: ['staff'] }), []);
});

test('metric-duplicate-id: the same id twice, without case and extra spaces, is an error; two ids are fine', () => {
  const twice = (id) => dictText((d) => { d.metrics.push(metric(id, 'Orders (copy)', { formula: 'count(copy.id)' })); });
  assert.deepEqual(idsOf(twice('orders'), null), ['metric-duplicate-id']);
  assert.deepEqual(idsOf(twice('ORDERS'), null), ['metric-duplicate-id']);
  assert.deepEqual(idsOf(twice(' orders '), null), ['metric-duplicate-id']);
  assert.deepEqual(idsOf(twice('orders_2'), null), []);
  const f = ofCheck(twice('orders'), null, 'metric-duplicate-id')[0];
  assert.match(f.message, /used by two metrics/);
});

test('name-clash: a name used by two metrics, as a name or as an alias', () => {
  const rename = (name, aliases) => dictText((d) => { d.metrics[1].name = name; if (aliases) d.metrics[1].aliases = aliases; });
  assert.deepEqual(idsOf(rename('Net revenue'), null), ['name-clash']);
  assert.deepEqual(idsOf(rename('  net   REVENUE '), null), ['name-clash']);
  assert.deepEqual(idsOf(rename('Gross revenue', ['Order count']), null), ['name-clash']);
  assert.deepEqual(idsOf(rename('Gross revenue', ['Revenue']), null), ['name-clash']);
  assert.deepEqual(idsOf(rename('Gross revenue', ['Gross revenue', 'Sales']), null), []);
  assert.deepEqual(idsOf(rename('Gross revenue', ['Sales', 'sales']), null), []);
  assert.match(ofCheck(rename('Gross revenue', ['Revenue']), null, 'name-clash')[0].message, /as an alias/);
});

test('name-clash: a deprecated metric that names the other in replaced_by may keep the name; one that does not may not', () => {
  const old = (replaced) => dictText((d) => { d.metrics.push(metric('net_revenue_old', 'Net revenue', { status: 'deprecated', replaced_by: replaced, formula: 'sum(old.amount)' })); });
  assert.deepEqual(idsOf(old('net_revenue'), null), []);
  assert.deepEqual(idsOf(old('revenue'), null), ['name-clash']);
  assert.deepEqual(idsOf(old(undefined), null).sort(), ['deprecated-no-replacement', 'name-clash']);
});

test('metric-no-definition and definition-repeats-name: a definition has to say more than the name', () => {
  assert.deepEqual(only('orders', { definition: undefined }), ['metric-no-definition']);
  assert.deepEqual(only('orders', { definition: '   ' }), ['metric-no-definition']);
  assert.deepEqual(only('orders', { definition: 'Orders' }), ['definition-repeats-name']);
  assert.deepEqual(only('orders', { definition: 'orders.' }), ['definition-repeats-name']);
  assert.deepEqual(only('orders', { definition: 'The number of orders' }), ['definition-repeats-name']);
  assert.deepEqual(only('revenue', { definition: 'Total gross revenue' }), ['definition-repeats-name']);
  assert.deepEqual(only('net_revenue', { definition: 'net revenue' }), ['definition-repeats-name']);
  assert.deepEqual(only('orders', { definition: 'Orders paid for' }), []);
  assert.deepEqual(only('orders', { definition: 'The number of orders, test orders left out' }), []);
});

test('metric-no-formula, -no-unit, -no-grain, -no-owner, -no-source, -no-status: each asks for its key', () => {
  assert.deepEqual(only('orders', { formula: undefined }), ['metric-no-formula']);
  assert.deepEqual(only('orders', { formula: '' }), ['metric-no-formula']);
  assert.deepEqual(only('orders', { unit: undefined }), ['metric-no-unit']);
  assert.deepEqual(only('orders', { grain: undefined }), ['metric-no-grain']);
  assert.deepEqual(only('orders', { owner: undefined }), ['metric-no-owner']);
  assert.deepEqual(only('orders', { owner: ' ' }), ['metric-no-owner']);
  assert.deepEqual(only('orders', { source: undefined }), ['metric-no-source']);
  assert.deepEqual(only('orders', { source: [] }), ['metric-no-source']);
  assert.deepEqual(only('orders', { source: ['a', 'b'] }), []);
  assert.deepEqual(only('orders', { status: undefined }), ['metric-no-status']);
  assert.deepEqual(only('orders', { status: '' }), ['metric-no-status']);
  assert.deepEqual(only('aov', { status: 'draft' }), []);
});

test('metric-no-period: a rate, a ratio or a count needs a period; a sum, an average and a snapshot do not', () => {
  assert.deepEqual(only('orders', { period: undefined }), ['metric-no-period']);
  assert.deepEqual(only('orders', { period: undefined, type: 'distinct_count' }), ['metric-no-period']);
  assert.deepEqual(only('orders', { period: undefined, type: 'snapshot' }), []);
  assert.deepEqual(only('orders', { period: undefined, type: 'sum' }), []);
  assert.deepEqual(only('orders', { period: undefined, type: 'average' }), []);
  assert.deepEqual(only('aov', { period: undefined }), ['metric-no-period']);
  assert.deepEqual(only('revenue', { period: undefined }), []);
  const ratio = (over) => idsOf(dictText((d) => { d.metrics.push(metric('x', 'Churn rate', { type: undefined, period: undefined, formula: '{refunds} / {orders}', ...over })); }), null).sort();
  assert.deepEqual(ratio({}), ['metric-no-period']);
  assert.deepEqual(ratio({ name: 'Weekly refunds', formula: 'sum(a.b)', unit: 'percent' }), ['metric-no-period', 'ratio-parts-missing']);
  assert.deepEqual(ratio({ name: 'Weekly refunds', formula: 'sum(a.b)', unit: 'USD' }), []);
  assert.deepEqual(ratio({ name: 'Weekly refunds', formula: '{refunds} / {orders}', unit: 'USD' }), ['metric-no-period']);
  assert.deepEqual(ratio({ name: 'Active users', formula: 'sum(a.b)', unit: 'count' }), ['metric-no-period']);
  assert.deepEqual(ratio({ name: 'Weekly refunds', formula: 'sum(a.b)', unit: 'USD', type: 'snapshot' }), []);
  assert.deepEqual(ratio({ period: 'calendar month' }), []);
});

test('formula-unit-mismatch: a sum of terms with different declared units is an error, a sum of one unit is not', () => {
  const sum = (formula, over = {}) => dictText((d) => { d.metrics[3].formula = formula; Object.assign(d.metrics[3], over); });
  assert.deepEqual(idsOf(sum('{revenue} + {orders}'), null), ['formula-unit-mismatch']);
  assert.deepEqual(idsOf(sum('{revenue} - {orders}'), null), ['formula-unit-mismatch']);
  assert.deepEqual(idsOf(sum('{revenue} + {refunds}'), null), []);
  assert.deepEqual(idsOf(sum('{revenue} + {refunds} - {orders}'), null), ['formula-unit-mismatch']);
  assert.deepEqual(idsOf(sum('({revenue} + {orders}) * 2'), null), ['formula-unit-mismatch']);
  assert.deepEqual(idsOf(sum('{revenue} * {orders}'), null), []);
  assert.deepEqual(idsOf(sum('{revenue} / {orders}'), null), []);
  assert.deepEqual(idsOf(sum('{revenue} + 100'), null), []);
  assert.deepEqual(idsOf(sum('{revenue} + {orders} * 2'), null), []);
  assert.deepEqual(idsOf(sum('-{revenue} + {refunds}'), null), []);
  assert.match(ofCheck(sum('{revenue} + {orders}'), null, 'formula-unit-mismatch')[0].message, /"Gross revenue" in USD and "Orders" in count/);
});

test('formula-unit-mismatch: units are compared without case; a unit that is not declared is not compared', () => {
  const sum = (change) => dictText((d) => { d.metrics[3].formula = '{revenue} + {refunds}'; change(d); });
  assert.deepEqual(idsOf(sum((d) => { d.metrics[1].unit = 'usd'; }), null), []);
  assert.deepEqual(idsOf(sum((d) => { d.metrics[1].unit = ' USD '; }), null), []);
  assert.deepEqual(idsOf(sum((d) => { delete d.metrics[1].unit; }), null), ['metric-no-unit']);
  assert.deepEqual(idsOf(sum((d) => { d.metrics[1].unit = 'EUR'; }), null), ['formula-unit-mismatch']);
});

test('formula-unit-mismatch: a formula written as a structure is checked the same way', () => {
  const tree = (op, a, b) => dictText((d) => { d.metrics[3].formula = { op, args: [{ metric: a }, { metric: b }] }; });
  assert.deepEqual(idsOf(tree('add', 'revenue', 'orders'), null), ['formula-unit-mismatch']);
  assert.deepEqual(idsOf(tree('subtract', 'revenue', 'refunds'), null), []);
  assert.deepEqual(idsOf(tree('multiply', 'revenue', 'orders'), null), []);
  assert.deepEqual(idsOf(tree('sum', 'revenue', 'orders'), null), []);
  const nested = dictText((d) => { d.metrics[3].formula = { op: 'multiply', args: [{ op: 'add', args: [{ metric: 'revenue' }, { metric: 'orders' }] }, { value: 2 }] }; });
  assert.deepEqual(idsOf(nested, null), ['formula-unit-mismatch']);
  const withField = dictText((d) => { d.metrics[3].formula = { op: 'add', args: [{ metric: 'revenue' }, { field: 'adjustments.amount' }] }; });
  assert.deepEqual(idsOf(withField, null), []);
});

test('formula-unknown-metric: a metric in braces that is not there, once for each metric and id, with the nearest id', () => {
  const f = (formula, over = {}) => dictText((d) => { d.metrics[3].formula = formula; Object.assign(d.metrics[3], over); });
  assert.deepEqual(idsOf(f('{revenue} - {refund}'), null), ['formula-unknown-metric']);
  assert.match(ofCheck(f('{revenue} - {refund}'), null, 'formula-unknown-metric')[0].message, /The nearest id is "refunds"/);
  assert.doesNotMatch(ofCheck(f('{revenue} - {something_else_entirely}'), null, 'formula-unknown-metric')[0].message, /nearest/);
  assert.deepEqual(idsOf(f('{REVENUE} - {Refunds}'), null), []);
  assert.deepEqual(idsOf(f('{ revenue } - { refunds }'), null), []);
  assert.deepEqual(idsOf(f('revenue - refunds'), null), []);
  assert.deepEqual(idsOf(f('{nope} + {nope} + {nope}'), null), ['formula-unknown-metric']);
  assert.deepEqual(idsOf(f('{nope} + {nada}'), null), ['formula-unknown-metric', 'formula-unknown-metric']);
  assert.deepEqual(idsOf(f('sum(a.b)', { numerator: '{nope}', denominator: 'all of them' }), null), ['formula-unknown-metric']);
  assert.deepEqual(idsOf(f('{revenue}', { denominator: '{revenue}' }), null), []);
  const tree = dictText((d) => { d.metrics[3].formula = { op: 'subtract', args: [{ metric: 'revenue' }, { metric: 'refundz' }] }; });
  assert.deepEqual(idsOf(tree, null), ['formula-unknown-metric']);
});

test('metric-circular: a circle through two or three metrics, or through the metric itself, is one error each', () => {
  const circle = (links) => dictText((d) => {
    for (const [id, formula] of Object.entries(links)) d.metrics.find((m) => m.id === id).formula = formula;
  });
  assert.deepEqual(idsOf(circle({ revenue: '{net_revenue} + 1' }), null), ['metric-circular']);
  assert.deepEqual(idsOf(circle({ revenue: '{revenue} + 1' }), null), ['metric-circular']);
  assert.deepEqual(idsOf(circle({ revenue: '{refunds} + 1', refunds: '{net_revenue} + 1' }), null), ['metric-circular']);
  assert.deepEqual(idsOf(circle({ revenue: '{refunds}', refunds: '{revenue}', orders: '{orders}' }), null), ['metric-circular', 'metric-circular']);
  assert.deepEqual(idsOf(circle({ revenue: '{refunds} + 1' }), null), []);
  const f = ofCheck(circle({ revenue: '{refunds} + 1', refunds: '{net_revenue} + 1' }), null, 'metric-circular');
  assert.match(f[0].message, /3 metrics depend on each other in a circle: "Gross revenue", "Refunds" and "Net revenue"/);
  assert.match(ofCheck(circle({ revenue: '{revenue} + 1' }), null, 'metric-circular')[0].message, /names itself/);
});

test('metric-circular: a long chain is not a circle, and a metric named twice in one formula is one edge', () => {
  const chain = dictText((d) => {
    d.metrics = Array.from({ length: 50 }, (_, i) => metric(`m${i}`, `Measure ${i}`, { formula: i < 49 ? `{m${i + 1}} + {m${i + 1}}` : 'sum(a.b)' }));
  });
  assert.deepEqual(idsOf(chain, null), []);
  const closed = dictText((d) => {
    d.metrics = Array.from({ length: 50 }, (_, i) => metric(`m${i}`, `Measure ${i}`, { formula: `{m${(i + 1) % 50}} + 1` }));
  });
  assert.deepEqual(idsOf(closed, null), ['metric-circular']);
});

test('grain-finer-than-input: a metric finer than a metric it is built on needs an aggregation note', () => {
  const grain = (g, over = {}) => dictText((d) => { d.metrics[3].grain = g; d.metrics[4].grain = g; Object.assign(d.metrics[3], over); d.metrics[1].grain = 'month'; });
  assert.deepEqual(idsOf(grain('day'), null), ['grain-finer-than-input']);
  assert.deepEqual(idsOf(grain('day', { aggregation: 'The monthly figure is spread over the days of the month.' }), null), []);
  assert.deepEqual(idsOf(grain('month'), null), []);
  assert.deepEqual(idsOf(grain('quarter'), null), []);
  assert.deepEqual(idsOf(grain('Daily'), null), ['grain-finer-than-input']);
  assert.deepEqual(idsOf(grain('per day'), null), ['grain-finer-than-input']);
  assert.deepEqual([...new Set(idsOf(grain('hour'), null))], ['grain-finer-than-input']);
  assert.deepEqual(idsOf(grain('customer'), null), []);
  assert.deepEqual(idsOf(grain('warehouse bin'), null), []);
  const entity = dictText((d) => { d.metrics[3].grain = 'order'; d.metrics[4].grain = 'order'; d.metrics[1].grain = 'customer'; });
  assert.deepEqual(idsOf(entity, null), ['grain-finer-than-input']);
  const unknown = dictText((d) => { d.metrics[1].grain = 'fortnight'; });
  assert.deepEqual(idsOf(unknown, null), []);
});

test('active-uses-inactive: an active metric built on a draft or a deprecated one is an error', () => {
  const dep = (status, over = {}) => dictText((d) => { d.metrics[2].status = status; Object.assign(d.metrics[2], over); });
  assert.deepEqual(idsOf(dep('draft'), null), ['active-uses-inactive']);
  assert.deepEqual(idsOf(dep('deprecated', { replaced_by: 'revenue' }), null), ['active-uses-inactive']);
  assert.deepEqual(idsOf(dep('active'), null), []);
  const draftUser = dictText((d) => { d.metrics[2].status = 'draft'; d.metrics[3].status = 'draft'; d.metrics[4].status = 'draft'; });
  assert.deepEqual(idsOf(draftUser, null), []);
  const noStatus = dictText((d) => { d.metrics[2].status = 'draft'; delete d.metrics[3].status; });
  assert.deepEqual(idsOf(noStatus, null).sort(), ['active-uses-inactive', 'metric-no-status']);
  assert.match(ofCheck(dep('deprecated', { replaced_by: 'revenue' }), null, 'active-uses-inactive')[0].message, /replaced by "revenue"/);
});

test('deprecated-no-replacement and replaced-by-invalid: a deprecated metric points at an active metric that exists', () => {
  const old = (over) => dictText((d) => { d.metrics.push(metric('old', 'Old measure', { status: 'deprecated', formula: 'sum(old.x)', ...over })); });
  assert.deepEqual(idsOf(old({ replaced_by: 'revenue' }), null), []);
  assert.deepEqual(idsOf(old({ replaced_by: 'REVENUE' }), null), []);
  assert.deepEqual(idsOf(old({}), null), ['deprecated-no-replacement']);
  assert.deepEqual(idsOf(old({ replaced_by: 'revnue' }), null), ['replaced-by-invalid']);
  assert.match(ofCheck(old({ replaced_by: 'revnue' }), null, 'replaced-by-invalid')[0].message, /nearest id is "revenue"/);
  assert.deepEqual(idsOf(old({ replaced_by: 'old' }), null), ['replaced-by-invalid']);
  assert.match(ofCheck(old({ replaced_by: 'old' }), null, 'replaced-by-invalid')[0].message, /replaced by itself/);
  const chain = dictText((d) => {
    d.metrics.push(metric('older', 'Older measure', { status: 'deprecated', replaced_by: 'old', formula: 'sum(older.x)' }));
    d.metrics.push(metric('old', 'Old measure', { status: 'deprecated', replaced_by: 'revenue', formula: 'sum(old.x)' }));
  });
  assert.deepEqual(idsOf(chain, null), ['replaced-by-invalid']);
  assert.deepEqual(idsOf(old({ status: 'active', replaced_by: 'nobody' }), null), ['replaced-by-invalid']);
  assert.deepEqual(idsOf(old({ status: 'active' }), null), []);
});

test('formula-duplicate: two names for one formula with the same filters; a filter, a case or a spacing tells', () => {
  const twin = (over) => dictText((d) => { d.metrics.push(metric('twin', 'Gross sales', { definition: 'The same value, called by the sales team.', formula: 'sum(order_lines.amount)', ...over })); });
  assert.deepEqual(idsOf(twin({}), null), ['formula-duplicate']);
  assert.deepEqual(idsOf(twin({ formula: 'SUM( order_lines.amount )' }), null), ['formula-duplicate']);
  assert.deepEqual(idsOf(twin({ formula: 'sum(order_lines.price)' }), null), []);
  assert.deepEqual(idsOf(twin({ filters: ['wholesale only'] }), null), []);
  const filtered = dictText((d) => { d.metrics[1].filters = ['Wholesale Only']; d.metrics.push(metric('twin', 'Gross sales', { formula: 'sum(order_lines.amount)', filters: [' wholesale only'] })); });
  assert.deepEqual(idsOf(filtered, null), ['formula-duplicate']);
  const old = dictText((d) => { d.metrics.push(metric('twin', 'Gross sales', { formula: 'sum(order_lines.amount)', status: 'deprecated', replaced_by: 'revenue' })); });
  assert.deepEqual(idsOf(old, null), []);
  const structured = dictText((d) => {
    d.metrics[3].formula = { op: 'subtract', args: [{ metric: 'revenue' }, { metric: 'refunds' }] };
    d.metrics.push(metric('twin', 'Net sales', { formula: { op: 'subtract', args: [{ metric: 'revenue' }, { metric: 'refunds' }] } }));
  });
  assert.deepEqual(idsOf(structured, null), ['formula-duplicate']);
});

test('ratio-parts-missing: a ratio or a rate states what is divided by what', () => {
  const ratio = (over) => dictText((d) => { d.metrics.push(metric('r', 'Return rate', { type: 'rate', formula: 'count_distinct(returns.id)', unit: 'percent', ...over })); });
  assert.deepEqual(idsOf(ratio({}), null), ['ratio-parts-missing']);
  assert.deepEqual(idsOf(ratio({ numerator: 'returned orders' }), null), ['ratio-parts-missing']);
  assert.match(ofCheck(ratio({ numerator: 'returned orders' }), null, 'ratio-parts-missing')[0].message, /does not state the denominator/);
  assert.match(ofCheck(ratio({ denominator: 'orders' }), null, 'ratio-parts-missing')[0].message, /does not state the numerator/);
  assert.match(ofCheck(ratio({}), null, 'ratio-parts-missing')[0].message, /the numerator and the denominator/);
  assert.deepEqual(idsOf(ratio({ numerator: 'returned orders', denominator: 'all orders' }), null), []);
  assert.deepEqual(idsOf(ratio({ formula: 'count_distinct(returns.id) / count_distinct(orders.id)' }), null), []);
  assert.deepEqual(idsOf(ratio({ formula: { op: 'divide', args: [{ field: 'returns.n' }, { field: 'orders.n' }] } }), null), []);
  assert.deepEqual(idsOf(ratio({ formula: '/ count_distinct(orders.id)' }), null), ['ratio-parts-missing']);
  assert.deepEqual(idsOf(ratio({ formula: 'count_distinct(returns.id) /' }), null), ['ratio-parts-missing']);
  assert.deepEqual(idsOf(ratio({ type: 'sum', name: 'Return total', unit: 'USD' }), null), []);
  assert.deepEqual(idsOf(ratio({ type: undefined, name: 'Return share' }), null), ['ratio-parts-missing']);
  assert.deepEqual(idsOf(ratio({ type: 'snapshot', name: 'Return value' }), null), []);
});

test('reports: a metric id that is not in the dictionary is an error, with the nearest id; ids are read without case', () => {
  assert.deepEqual(idsAfterReports((r) => { r.reports[0].metrics.push('order'); }), ['report-unknown-metric']);
  assert.match(ofCheck(dictText(), reportsText((r) => { r.reports[0].metrics.push('order'); }), 'report-unknown-metric')[0].message, /nearest id is "orders"/);
  assert.deepEqual(idsAfterReports((r) => { r.reports[0].metrics.push('ORDERS'); }), []);
  assert.deepEqual(idsAfterReports((r) => { r.reports[0].metrics.push({ metric: ' orders ' }); }), []);
  assert.deepEqual(idsAfterReports((r) => { r.reports[0].metrics.push('Gross revenue'); }), ['report-unknown-metric']);
  assert.deepEqual(idsAfterRows((rows) => { rows.push({ report: 'Daily sales', owner: 'Sales', metric: 'nope', label: '' }); }), ['report-unknown-metric']);
});

test('reports: a label that is not the name or an alias is a warning; a name, an alias or no label is fine', () => {
  const label = (l) => idsAfterReports((r) => { r.reports[0].metrics.push({ metric: 'refunds', label: l }); });
  assert.deepEqual(label('Money back'), ['report-label-differs']);
  assert.deepEqual(label('Refunds'), []);
  assert.deepEqual(label('  REFUNDS '), []);
  assert.deepEqual(idsAfterReports((r) => { r.reports[0].metrics[1].label = 'Order count'; }), ['report-label-differs']);
  assert.deepEqual(idsAfterReports((r) => { r.reports[0].metrics[1] = { metric: 'orders', label: 'Order count' }; }), []);
  assert.deepEqual(idsAfterRows((rows) => { rows[0].label = 'Order count'; }), []);
  assert.deepEqual(idsAfterRows((rows) => { rows[0].label = 'Sales count'; }), ['report-label-differs']);
});

test('reports: a deprecated metric that is still shown is a warning, with the one that replaces it', () => {
  const dep = dictText((d) => { d.metrics[2].status = 'deprecated'; d.metrics[2].replaced_by = 'revenue'; d.metrics[3].formula = '{revenue} - 1'; });
  const found = findingsOf(dep, reportsText());
  assert.deepEqual(found.map((f) => f.id), ['report-shows-deprecated']);
  assert.match(found[0].message, /deprecated \(replaced by "revenue"\)/);
});

test('reports: one label for two metrics is an error when it is written out; two metrics under their own names are not', () => {
  const clash = (l) => idsAfterReports((r) => { r.reports[1].metrics.push({ metric: 'aov', label: l }); });
  assert.deepEqual(clash('Net revenue'), ['report-label-clash', 'report-label-differs']);
  assert.deepEqual(clash('Average order value'), []);
  assert.deepEqual(idsAfterReports((r) => { r.reports[1].metrics.push({ metric: 'orders', label: 'Revenue' }); }), ['report-label-clash', 'report-label-differs']);
  assert.deepEqual(idsAfterReports((r) => { r.reports[1].metrics.push({ metric: 'net_revenue', label: 'Revenue' }); }), []);
  assert.deepEqual(idsAfterReports((r) => { r.reports[1].metrics.push({ metric: 'orders', label: 'Gross revenue' }); }), ['report-label-clash', 'report-label-differs']);
  assert.deepEqual(idsAfterRows((rows) => { rows.push({ report: 'Finance pack', owner: 'Finance', metric: 'aov', label: 'Net revenue' }); }), ['report-label-clash', 'report-label-differs']);
});

test('reports: a report with no owner is a warning; a table with no owner column is not asked for one', () => {
  assert.deepEqual(idsAfterReports((r) => { delete r.reports[0].owner; }), ['report-no-owner']);
  assert.deepEqual(idsAfterReports((r) => { r.reports[0].owner = '  '; }), ['report-no-owner']);
  assert.deepEqual(idsAfterRows((rows) => { rows.forEach((x) => { if (x.report === 'Finance pack') x.owner = ''; }); }), ['report-no-owner']);
  const owned = dictText();
  assert.deepEqual(idsOf(owned, reportsCsv(() => {}, ['report', 'metric', 'label']), {}, 'csv'), []);
  assert.deepEqual(idsAfterRows((rows) => { rows[0].owner = ''; }), []);
});

test('reports: a report is told apart by name without case, and its owner may be on any row', () => {
  assert.deepEqual(idsAfterRows((rows) => { rows[0].report = 'DAILY SALES'; }), []);
  const found = findingsOf(dictText(), reportsText((r) => { r.reports.push({ name: 'daily sales', metrics: ['refunds'] }); }));
  assert.deepEqual(found, []);
});

test('reports: an entry that cannot be used is a finding and is left out', () => {
  const bad = (change) => idsAfterReports(change);
  assert.deepEqual(bad((r) => { r.reports.push(5); }), ['field-invalid']);
  assert.deepEqual(bad((r) => { r.reports.push({ owner: 'x', metrics: ['orders'] }); }), ['field-invalid']);
  assert.deepEqual(bad((r) => { r.reports[0].metrics.push(5.5, null); }), ['field-invalid', 'report-unknown-metric']);
  assert.deepEqual(bad((r) => { r.reports[0].metrics.push([]); }), ['field-invalid']);
  assert.deepEqual(bad((r) => { r.reports[0].metrics.push({ label: 'x' }); }), ['field-invalid']);
  assert.deepEqual(bad((r) => { r.reports[0].metrics = 'orders'; }), ['field-invalid']);
  assert.deepEqual(bad((r) => { r.reports[0].colour = 'red'; }), ['field-unknown']);
  assert.deepEqual(bad((r) => { r.reports[0].metrics.push({ metric: 'orders', labl: 'x' }); }), ['field-unknown']);
  assert.deepEqual(idsAfterRows((rows) => { rows[0].metric = ''; }), ['field-invalid']);
  assert.deepEqual(idsAfterRows((rows) => { rows[0].report = ''; }), ['field-invalid']);
  assert.deepEqual(idsOf(dictText(), 'report,metric,label\nA,orders\n', {}, 'csv'), ['field-invalid']);
});

test('reports: an unknown column is named with the nearest, and a column under another name is read', () => {
  assert.deepEqual(idsOf(dictText(), 'report,metric,lable\nA,orders,Orders\n', {}, 'csv'), ['field-unknown']);
  assert.match(ofCheck(dictText(), 'report,metric,lable\nA,orders,Orders\n', 'field-unknown', {}, 'csv')[0].message, /Did you mean "label"\?/);
  assert.deepEqual(idsOf(dictText(), 'Dashboard,Metric_ID,Shown As,Owner\nA,orders,Orders,Sales\n', {}, 'csv'), []);
  assert.deepEqual(idsOf(dictText(), 'report,metric,\nA,orders,\n', {}, 'csv'), ['field-unknown']);
});

test('--disable leaves a check out; the findings of the others stay', () => {
  const text = withMetric('orders', { unit: undefined, owner: undefined });
  assert.deepEqual(idsOf(text, null, { disable: 'metric-no-unit' }).sort(), ['metric-no-owner']);
  assert.deepEqual(idsOf(text, null, { disable: 'metric-no-unit,metric-no-owner' }), []);
  assert.deepEqual(idsOf(text, null, { disable: ' metric-no-unit , ' }).sort(), ['metric-no-owner']);
});

test('a finding points at the line and column of the key, or of the metric', () => {
  const text = dictText((d) => { delete d.metrics[1].unit; d.metrics[2].owner = ''; });
  const [unit] = ofCheck(text, null, 'metric-no-unit');
  assert.equal(unit.line, lineOf(text, '"id": "revenue"') - 1);
  const owner = findingsOf(text, null).find((f) => f.id === 'metric-no-owner');
  assert.equal(owner.line, lineOf(text, '"id": "refunds"') - 1);
  const status = findingsOf(withMetric('orders', { status: 'retired' }), null)[0];
  assert.equal(status.id, 'field-invalid');
  assert.ok(status.line > 1 && status.column > 1);
  const nope = ofCheck(dictText((d) => { d.metrics[3].formula = '{nope} + 1'; }), null, 'formula-unknown-metric')[0];
  assert.ok(nope.line > 1);
});

test('metrics with the same name are checked one by one; the base metric list is not changed by a run', () => {
  const before = JSON.stringify(base());
  idsOf(dictText(), reportsText());
  assert.equal(JSON.stringify(base()), before);
  assert.equal(reportsBase().reports.length, 2);
});
