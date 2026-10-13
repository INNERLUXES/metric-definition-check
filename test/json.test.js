import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParseError, parseJson, detectFormat, WORK_LIMITS } from '../src/index.js';
import { plain } from './helpers.js';

const read = (text) => plain(parseJson(text));
const fails = (text, part, line, column) => {
  assert.throws(() => parseJson(text), (e) => {
    assert.ok(e instanceof ParseError, `not a ParseError: ${e}`);
    assert.ok(e.message.includes(part), `"${e.message}" does not include "${part}"`);
    if (line !== undefined) assert.equal(e.line, line);
    if (column !== undefined) assert.equal(e.column, column);
    return true;
  });
};

test('json: the same values as JSON.parse for a nested document', () => {
  const text = JSON.stringify({ a: [1, 2.5, -3, 1e3, { b: null, c: true, d: false }], e: 'x\ny "z" \\ A', f: {}, g: [], h: [[], [[]], {}] }, null, 2);
  assert.deepEqual(read(text), JSON.parse(text));
});

test('json: strings with escapes and unicode', () => {
  assert.deepEqual(read(String.raw`{"a":"A\n\t\"\\\/"}`), { a: 'A\n\t"\\/' });
});

test('json: numbers, true, false and null at the top level', () => {
  assert.equal(parseJson('42').v, 42);
  assert.equal(parseJson(' true ').v, true);
  assert.equal(parseJson('null').v, null);
  assert.equal(parseJson('"x"').v, 'x');
});

test('json: lines and columns of keys and values', () => {
  const tree = parseJson('{\n  "a": 1,\n  "b": {\n    "c": "x"\n  }\n}\n');
  assert.equal(tree.entries.get('a').line, 2);
  assert.equal(tree.entries.get('a').col, 3);
  assert.equal(tree.entries.get('a').node.col, 8);
  const c = tree.entries.get('b').node.entries.get('c');
  assert.equal(c.line, 4);
  assert.equal(c.col, 5);
});

test('json: CRLF and CR line ends count one line each', () => {
  const text = '{\r\n"a": 1,\r\n"b": 2}';
  assert.equal(parseJson(text).entries.get('b').line, 3);
  assert.equal(parseJson(text.replaceAll('\r\n', '\r')).entries.get('b').line, 3);
});

test('json: a key named __proto__ is only a name', () => {
  const tree = parseJson('{"__proto__": {"polluted": true}, "constructor": 1}');
  assert.deepEqual([...tree.entries.keys()], ['__proto__', 'constructor']);
  assert.equal({}.polluted, undefined);
});

test('json: a key written twice is an error at the second', () => {
  fails('{"a": 1,\n "a": 2}', 'written twice', 2, 2);
});

test('json: a trailing comma is an error', () => {
  fails('{"a": 1,}', 'comma', 1, 9);
  fails('[1, 2,]', 'comma', 1, 7);
});

test('json: a missing comma, colon or closing bracket is an error', () => {
  fails('[1 2]', 'comma or a closing ]', 1, 4);
  fails('{"a" 1}', 'colon', 1, 6);
  fails('{"a": 1 "b": 2}', 'comma or a closing }', 1, 9);
  fails('{"a": 1', 'comma or a closing }');
});

test('json: a key that is not text in double quotes is an error', () => {
  fails('{a: 1}', 'double quotes', 1, 2);
  fails("{'a': 1}", 'double quotes');
});

test('json: single quotes, comments and bare words are errors', () => {
  fails("['a']", 'value was expected');
  fails('[1, // c\n 2]', 'value was expected', 1);
  fails('[tru]', 'value was expected');
});

test('json: a string with a raw line end or a raw control character is an error', () => {
  fails('{"a": "x\ny"}', 'control character', 1);
  fails('{"a": "x\ty"}', 'control character', 1);
});

test('json: a string that is not closed is an error', () => {
  fails('{"a": "open', 'not closed');
});

test('json: an escape that JSON does not know is an error', () => {
  fails(String.raw`{"a": "\q"}`, 'escape');
});

test('json: a number that is not a number is an error', () => {
  fails('[1.2.3]', 'not a number');
  fails('[-]', 'not a number');
  fails('[01]', 'not a number');
});

test('json: text after the value is an error', () => {
  fails('{"a": 1} x', 'after the end', 1, 10);
  fails('{} {}', 'after the end');
});

test('json: an empty file or white space is an error', () => {
  fails('', 'ends where a value was expected');
  fails('  \n ', 'ends where a value was expected');
});

test('json: nesting deeper than the limit is an error, not a stack overflow', () => {
  fails('['.repeat(WORK_LIMITS.maxDepth + 1) + ']'.repeat(WORK_LIMITS.maxDepth + 1), 'nested deeper');
  fails('['.repeat(200000), 'nested deeper');
  assert.doesNotThrow(() => parseJson('['.repeat(WORK_LIMITS.maxDepth) + ']'.repeat(WORK_LIMITS.maxDepth)));
});

test('json: a long list is read in a loop', () => {
  const tree = parseJson(`[${'1,'.repeat(100000)}1]`);
  assert.equal(tree.items.length, 100001);
});

test('json: the format is told from the first character', () => {
  assert.equal(detectFormat('{"a": 1}'), 'json');
  assert.equal(detectFormat('  \n\t[1]'), 'json');
  assert.equal(detectFormat('name: x'), 'yaml');
  assert.equal(detectFormat('# comment\n{'), 'yaml');
  assert.equal(detectFormat(''), 'yaml');
});
