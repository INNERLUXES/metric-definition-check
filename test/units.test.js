import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEST, DEFAULTS, FILLER_WORDS, FINDING_CAP, FULL_WIDTH_QUESTION, GRAIN_LADDERS, KINDS, LEVELS, METRIC_KEYS, METRIC_KEY_ALIASES, NEEDS_PERIOD, NOT_A, NOTICE, REQUIRED_COLUMNS, RULES, STATUSES, TYPES, WORK_LIMITS,
  atOrAbove, circles, createCollector, decide, describe, editDistance, explainJson, explainMarkdown, explainText, flat, grainRank, grouped, isRatio, list, listChecksJson, listChecksMarkdown, listChecksText, listText,
  mapNode, nearest, needsPeriod, plural, readOptions, ruleById, safeText, scalarNode, seqNode, show, tally, xmlSafe
} from '../src/index.js';

test('editDistance: insertions, deletions and replacements', () => {
  assert.equal(editDistance('', ''), 0);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('defintion', 'definition'), 1);
  assert.equal(editDistance('ownr', 'owner'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
});

test('nearest: the closest name within two edits, or null', () => {
  const names = ['definition', 'owner', 'formula'];
  assert.equal(nearest('defintion', names), 'definition');
  assert.equal(nearest('OWNER', names), 'owner');
  assert.equal(nearest('fomrula', names), 'formula');
  assert.equal(nearest('something', names), null);
  assert.equal(nearest('ownre', names, 1), null);
  assert.equal(nearest('onwer', names, 2), 'owner');
  assert.equal(nearest('x'.repeat(500), names), null);
});

test('safeText: control, line separator and direction characters become spaces, and the length is capped', () => {
  const bad = ['a', String.fromCharCode(0), 'b', String.fromCharCode(27), 'c', String.fromCharCode(0x202e), 'd', String.fromCharCode(0x2028), 'e', String.fromCharCode(0x85), 'f', String.fromCharCode(0xfeff), 'g'].join('');
  assert.equal(safeText(bad), 'a b c d e f g');
  assert.equal(safeText('x'.repeat(400), 300).length, 300);
  assert.equal(safeText('x'.repeat(400), 300).slice(-3), '...');
  assert.equal(safeText(12), '12');
  assert.equal(safeText('short'), 'short');
});

test('flat: runs of white space become one space', () => {
  assert.equal(flat('  a \n\t b  '), 'a b');
});

test('xmlSafe: lone surrogates and the two non-characters become a question mark, pairs stay', () => {
  const pair = String.fromCharCode(0xd83d, 0xde00);
  assert.equal(xmlSafe(`a${String.fromCharCode(0xd800)}b`), 'a?b');
  assert.equal(xmlSafe(`a${String.fromCharCode(0xdc00)}b`), 'a?b');
  assert.equal(xmlSafe(`a${String.fromCharCode(0xfffe)}${String.fromCharCode(0xffff)}b`), 'a??b');
  assert.equal(xmlSafe(`a${pair}b`), `a${pair}b`);
  assert.equal(xmlSafe(5), '5');
  assert.equal(FULL_WIDTH_QUESTION.charCodeAt(0), 0xff1f);
});

test('grouped, plural, list and listText', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'metric'), '1 metric');
  assert.equal(plural(2, 'metric'), '2 metrics');
  assert.equal(plural(0, 'finding'), '0 findings');
  assert.equal(plural(1500, 'class', 'classes'), '1,500 classes');
  assert.equal(list(['a']), 'a');
  assert.equal(list(['a', 'b']), 'a and b');
  assert.equal(list(['a', 'b', 'c']), 'a, b and c');
  assert.equal(list(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(list([]), '');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e']), 'a, b, c and 2 more');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText([]), '');
});

test('show cuts a text for a message', () => {
  assert.equal(show('a'.repeat(100)).length, 60);
  assert.equal(show(`a${String.fromCharCode(10)}b`), 'a b');
});

test('createCollector: keeps the first FINDING_CAP of each check and counts the rest', () => {
  const c = createCollector();
  for (let i = 0; i < FINDING_CAP + 5; i += 1) c.add('x', { file: 'reports', line: 1, column: 2 }, 'm');
  c.add('y', {}, 'm2', 'subject');
  assert.equal(c.findings.filter((f) => f.id === 'x').length, FINDING_CAP);
  assert.equal(c.omitted.get('x'), 5);
  assert.deepEqual(c.findings.at(-1), { id: 'y', file: null, line: null, column: null, message: 'm2', subject: 'subject' });
});

test('nodes: describe says what a node is', () => {
  assert.equal(describe(mapNode(1, 1)), 'a mapping');
  assert.equal(describe(seqNode(1, 1)), 'a list');
  assert.equal(describe(scalarNode(null, 1, 1)), 'empty');
  assert.equal(describe(scalarNode(true, 1, 1)), 'a true or false value');
  assert.equal(describe(scalarNode(3, 1, 1)), 'a number');
  assert.equal(describe(scalarNode('x', 1, 1)), 'text');
});

test('rules: ruleById, atOrAbove and decide', () => {
  assert.equal(ruleById('name-clash').kind, 'dictionary');
  assert.equal(ruleById('report-label-clash').kind, 'reports');
  assert.equal(ruleById('nothing'), undefined);
  assert.deepEqual(LEVELS, ['info', 'warning', 'error']);
  assert.deepEqual(KINDS, ['file', 'dictionary', 'reports']);
  assert.equal(atOrAbove('error', 'warning'), true);
  assert.equal(atOrAbove('info', 'warning'), false);
  assert.deepEqual(decide({ error: 0, warning: 0, info: 0 }, 'error'), { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' });
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'error').text, 'PASS - no finding at or above error (2 warning)');
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'warning').text, 'FAIL - 2 findings at or above warning (2 warning)');
  assert.equal(decide({ error: 1, warning: 0, info: 3 }, 'info').text, 'FAIL - 4 findings at or above info (1 error, 3 info)');
  assert.equal(decide({ error: 1, warning: 0, info: 0 }, 'error').text, 'FAIL - 1 finding at or above error (1 error)');
});

test('rules: every check has an id, a level, a kind, and text that says what it looks at, what to change, why and what it cannot see', () => {
  assert.equal(RULES.length, 28);
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  for (const r of RULES) {
    assert.match(r.id, /^[a-z]+(?:-[a-z]+)+$/);
    assert.ok(LEVELS.includes(r.severity), r.id);
    assert.ok(KINDS.includes(r.kind), r.id);
    for (const key of ['summary', 'fix', 'own', 'cannot']) assert.ok(r[key].length > 20, `${r.id}.${key}`);
    for (const key of ['fix', 'cannot']) assert.match(r[key], /[.)]$/, `${r.id}.${key}`);
    assert.ok(r.own.includes(BEST), r.id);
  }
  for (const k of KINDS) assert.ok(RULES.some((r) => r.kind === k), k);
  assert.deepEqual(RULES.filter((r) => r.kind === 'file').map((r) => r.id), ['file-unreadable', 'field-invalid', 'field-unknown']);
});

test('data: the statuses, the types, the keys and the ladders of grain are the ones the documents list', () => {
  assert.deepEqual(STATUSES, ['active', 'draft', 'deprecated']);
  assert.ok(TYPES.includes('snapshot') && TYPES.includes('ratio'));
  assert.deepEqual(NEEDS_PERIOD, ['count', 'distinct_count', 'ratio', 'rate']);
  assert.deepEqual(REQUIRED_COLUMNS, ['report', 'metric']);
  assert.ok(METRIC_KEYS.includes('replaced_by') && METRIC_KEYS.includes('aggregation'));
  assert.equal(METRIC_KEY_ALIASES.get('window'), 'period');
  assert.equal(GRAIN_LADDERS.length, 2);
  assert.ok(FILLER_WORDS.includes('number'));
  assert.deepEqual(DEFAULTS, {});
  assert.equal(WORK_LIMITS.maxBytes, 16 * 1024 * 1024);
  assert.match(NOT_A, /neither a data quality tool nor an audit/);
  assert.match(NOTICE, /never runs a formula/);
});

test('readOptions: defaults, values, and the messages for values that cannot be used', () => {
  const d = readOptions();
  assert.deepEqual(d.disableList, []);
  assert.equal(d.disable.size, 0);
  const o = readOptions({ disable: 'name-clash, metric-no-unit' });
  assert.deepEqual(o.disableList, ['name-clash', 'metric-no-unit']);
  assert.ok(o.disable.has('name-clash'));
  assert.throws(() => readOptions({ disable: 'name-clsh' }), /unknown check name-clsh. Did you mean name-clash\?/);
  assert.throws(() => readOptions({ disable: 'zzzzzzzzzzzzzzzzzzzz' }), /unknown check zzz/);
  assert.throws(() => readOptions({ disable: Array.from({ length: 201 }, () => 'name-clash').join(',') }), /more than 200 entries/);
});

test('report writers: the lists of checks and the explanations', () => {
  assert.equal(listChecksText().split('\n').filter((l) => l.startsWith('  ')).length, RULES.length);
  assert.equal(listChecksMarkdown().split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Check') && !l.startsWith('| ---')).length, RULES.length);
  assert.equal(JSON.parse(listChecksJson()).length, RULES.length);
  const rule = ruleById('metric-no-formula');
  assert.match(explainText(rule), /^metric-no-formula\n\nlevel: error\nkind: dictionary\n/);
  assert.match(explainMarkdown(rule), /^# metric-no-formula\n/);
  assert.equal(JSON.parse(explainJson(rule)).kind, 'dictionary');
});

test('grainRank: where a grain sits on its ladder, with the other ways to write it', () => {
  assert.deepEqual(grainRank('day'), { ladder: 0, rank: 3 });
  assert.deepEqual(grainRank('Daily'), { ladder: 0, rank: 3 });
  assert.deepEqual(grainRank('per month'), { ladder: 0, rank: 5 });
  assert.deepEqual(grainRank('by_quarter'), { ladder: 0, rank: 6 });
  assert.deepEqual(grainRank('one row per order'), { ladder: 1, rank: 2 });
  assert.deepEqual(grainRank('Order line'), { ladder: 1, rank: 1 });
  assert.deepEqual(grainRank('customers'), { ladder: 1, rank: 3 });
  assert.equal(grainRank('fortnight'), null);
  assert.equal(grainRank(''), null);
  assert.equal(grainRank('x'.repeat(5000)), null);
});

test('isRatio and needsPeriod: by the type when there is one, otherwise by the words, the unit and a division', () => {
  const m = (over) => ({ type: '', name: 'Thing', id: 'thing', unit: 'USD', formula: { division: false }, ...over });
  assert.equal(isRatio(m({ type: 'ratio' })), true);
  assert.equal(isRatio(m({ type: 'sum', name: 'Churn rate' })), false);
  assert.equal(isRatio(m({ name: 'Churn rate' })), true);
  assert.equal(isRatio(m({ id: 'win_share' })), true);
  assert.equal(isRatio(m({ unit: 'Percent' })), true);
  assert.equal(isRatio(m({ unit: '%' })), true);
  assert.equal(isRatio(m({ formula: { division: true } })), true);
  assert.equal(isRatio(m({})), false);
  assert.equal(needsPeriod(m({ type: 'snapshot', name: 'Churn rate' })), false);
  assert.equal(needsPeriod(m({ type: 'count' })), true);
  assert.equal(needsPeriod(m({ name: 'Number of orders' })), true);
  assert.equal(needsPeriod(m({ name: 'Active users' })), true);
  assert.equal(needsPeriod(m({})), false);
});

test('circles: the groups of metrics that depend on each other, found without a call to itself', () => {
  assert.deepEqual(circles(0, []), []);
  assert.deepEqual(circles(3, [[1], [2], []]), []);
  assert.deepEqual(circles(3, [[1], [2], [0]]), [[0, 1, 2]]);
  assert.deepEqual(circles(2, [[0], []]), [[0]]);
  assert.deepEqual(circles(5, [[1], [0], [3], [4], [2]]), [[0, 1], [2, 3, 4]]);
  assert.deepEqual(circles(4, [[1, 2], [3], [3], [1]]), [[1, 3]]);
  const long = Array.from({ length: 50000 }, (_, i) => [(i + 1) % 50000]);
  assert.deepEqual(circles(50000, long).map((c) => c.length), [50000]);
  const chain = Array.from({ length: 50000 }, (_, i) => (i < 49999 ? [i + 1] : []));
  assert.deepEqual(circles(50000, chain), []);
});

test('tally: counts by a value without case, the most first, with the rest as one row', () => {
  assert.deepEqual(tally(['b', 'a', 'A', 'c', 'b', 'b']), [{ value: 'b', count: 3 }, { value: 'a', count: 2 }, { value: 'c', count: 1 }]);
  assert.deepEqual(tally([]), []);
  const many = tally(Array.from({ length: 60 }, (_, i) => `v${i}`), 5);
  assert.equal(many.length, 6);
  assert.deepEqual(many.at(-1), { value: '55 more', count: 55, more: true });
  assert.equal(tally(['a', 'b'], 5).every((r) => r.more === undefined), true);
});
