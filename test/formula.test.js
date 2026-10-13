import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS, parseJson, readTextFormula, readTokens, readTreeFormula, tokenize } from '../src/index.js';

const tree = (text, limits = WORK_LIMITS) => readTreeFormula(parseJson(text), limits);
const ids = (r) => r.refs.map((x) => x.id);

test('tokenize: metrics in braces, words, numbers, operators and parentheses', () => {
  const t = tokenize('({Revenue} - {refunds}) / 2 * count(a.b)').tokens;
  assert.deepEqual(t.map((x) => x.kind), ['open', 'ref', 'op', 'ref', 'close', 'op', 'word', 'op', 'word', 'open', 'word', 'close']);
  assert.deepEqual(t.filter((x) => x.kind === 'ref').map((x) => x.value), ['Revenue', 'refunds']);
  assert.deepEqual(tokenize('A.B_c').tokens, [{ kind: 'word', value: 'a.b_c' }]);
  assert.deepEqual(tokenize('').tokens, []);
  assert.deepEqual(tokenize('{ spaced id }').tokens, [{ kind: 'ref', value: 'spaced id' }]);
});

test('tokenize: a brace never closed, an empty pair, a stray brace, parentheses that do not match and a very long id are problems', () => {
  for (const text of ['{a', '{a{b}', '{}', '{ }', 'a}', '(a', 'a)', '((a)', `{${'x'.repeat(201)}}`]) {
    assert.ok(tokenize(text).problem, text);
  }
  assert.equal(tokenize('{a}{b}').problem, undefined);
});

test('readTokens: the metrics named, in order, and the canonical text without case and spaces', () => {
  const r = readTokens(tokenize('{A} +  {b}\n- C').tokens);
  assert.deepEqual(r.refs, ['A', 'b']);
  assert.equal(r.canonical, '{a}+{b}-c');
  assert.equal(readTokens(tokenize('SUM( x )').tokens).canonical, 'sum(x)');
});

test('readTokens: groups of added terms keep the id of a term that is one metric and null for any other term', () => {
  assert.deepEqual(readTokens(tokenize('{a} + {b}').tokens).groups, [['a', 'b']]);
  assert.deepEqual(readTokens(tokenize('{a} - {b} + 1').tokens).groups, [['a', 'b', null]]);
  assert.deepEqual(readTokens(tokenize('{a} * 2 + {b}').tokens).groups, [[null, 'b']]);
  assert.deepEqual(readTokens(tokenize('({a} + {b}) * 2').tokens).groups, [['a', 'b']]);
  assert.deepEqual(readTokens(tokenize('{a} + ({b} - {c})').tokens).groups, [['b', 'c'], ['a', null]]);
  assert.deepEqual(readTokens(tokenize('{a}').tokens).groups, []);
  assert.deepEqual(readTokens(tokenize('-{a} + {b}').tokens).groups, [['a', 'b']]);
  assert.deepEqual(readTokens(tokenize('{a} * {b}').tokens).groups, []);
});

test('readTokens: a division needs something on each side', () => {
  assert.equal(readTokens(tokenize('{a} / {b}').tokens).division, true);
  assert.equal(readTokens(tokenize('(a + b) / (c)').tokens).division, true);
  assert.equal(readTokens(tokenize('a /').tokens).division, false);
  assert.equal(readTokens(tokenize('/ b').tokens).division, false);
  assert.equal(readTokens(tokenize('a / * b').tokens).division, false);
  assert.equal(readTokens(tokenize('a * b').tokens).division, false);
  assert.equal(readTokens(tokenize('a / )'.replace(')', '')).tokens).division, false);
});

test('readTextFormula: the places of the metrics are the place of the formula; a problem is returned, not thrown', () => {
  const r = readTextFormula('{a} / {b}', 7, 9);
  assert.deepEqual(r.refs, [{ id: 'a', line: 7, column: 9 }, { id: 'b', line: 7, column: 9 }]);
  assert.equal(r.division, true);
  assert.match(readTextFormula('{a', 1, 1).problem, /not closed/);
});

test('readTreeFormula: metrics, fields, values and operations, with the canonical text', () => {
  const r = tree('{"op": "divide", "args": [{"op": "sum", "args": [{"field": "Orders.Amount"}]}, {"metric": "Orders"}]}');
  assert.deepEqual(ids(r), ['Orders']);
  assert.equal(r.canonical, 'divide(sum(orders.amount),{orders})');
  assert.equal(r.division, true);
  assert.equal(tree('{"metric": "a"}').canonical, '{a}');
  assert.equal(tree('{"field": "t.c"}').canonical, 't.c');
  assert.equal(tree('{"value": 12}').canonical, '12');
  assert.equal(tree('{"value": "n/a"}').canonical, 'n/a');
});

test('readTreeFormula: a bare number, a bare metric in braces or a bare field are read as parts', () => {
  const r = tree('{"op": "add", "args": [3, "{a}", "t.c", "{b} * 2"]}');
  assert.deepEqual(ids(r), ['a']);
  assert.deepEqual(r.groups, [[{ id: 'a', line: 1, column: 27 }, null, null]]);
  assert.equal(r.canonical, 'add(3,{a},t.c,{b} * 2)');
  assert.deepEqual(tree('"{a}"').refs.map((x) => x.id), ['a']);
});

test('readTreeFormula: only add and subtract make a group of terms to add', () => {
  assert.equal(tree('{"op": "add", "args": [{"metric": "a"}, {"metric": "b"}]}').groups.length, 1);
  assert.equal(tree('{"op": "subtract", "args": [{"metric": "a"}, {"metric": "b"}]}').groups.length, 1);
  assert.equal(tree('{"op": "multiply", "args": [{"metric": "a"}, {"metric": "b"}]}').groups.length, 0);
  assert.equal(tree('{"op": "sum", "args": [{"metric": "a"}, {"metric": "b"}]}').groups.length, 0);
  assert.equal(tree('{"op": "add", "args": [{"metric": "a"}]}').groups.length, 0);
});

test('readTreeFormula: parts that cannot be followed are problems with the place of the part', () => {
  const bad = [
    ['{"op": "median", "args": [1]}', /not one of/],
    ['{"op": "add"}', /needs "args"/],
    ['{"op": "add", "args": []}', /needs "args"/],
    ['{"op": "add", "args": 5}', /needs "args"/],
    ['{"op": "divide", "args": [1, 2, 3]}', /exactly two args/],
    ['{"op": "add", "metric": "a", "args": [1]}', /an op and also/],
    ['{"metric": "a", "field": "b"}', /exactly one of/],
    ['{}', /exactly one of/],
    ['{"colour": "red"}', /not part of a formula/],
    ['{"metric": ""}', /must be text/],
    ['{"metric": true}', /must be text/],
    ['{"field": true}', /must be text/],
    ['{"value": null}', /must be text or a number/],
    ['{"metric": "a", "args": []}', /exactly one of/],
    ['[1]', /is a list/],
    ['null', /is empty/],
    ['true', /true or false/],
    ['"{a"', /not closed/],
    ['{"op": "add", "args": [[1]]}', /is a list/],
    ['{"op": 5, "args": [1]}', /not one of/]
  ];
  for (const [text, pattern] of bad) {
    const r = tree(text);
    assert.match(r.problem ?? '', pattern, text);
    assert.ok(r.line >= 1 && r.column >= 1, text);
  }
});

test('readTreeFormula: nesting past the limit and more parts than the limit are problems, and nothing recurses', () => {
  const nest = (n) => `${'{"op": "add", "args": ['.repeat(n)}1${']}'.repeat(n)}`;
  assert.equal(tree(nest(5)).problem, undefined);
  assert.match(tree(nest(5), { ...WORK_LIMITS, maxFormulaDepth: 3 }).problem, /nested deeper than 3 levels/);
  const wide = `{"op": "add", "args": [${Array.from({ length: 50 }, () => '1').join(',')}]}`;
  assert.equal(tree(wide).problem, undefined);
  assert.match(tree(wide, { ...WORK_LIMITS, maxFormulaNodes: 10 }).problem, /more than 10 parts/);
});
