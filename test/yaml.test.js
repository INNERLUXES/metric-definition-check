import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParseError, parseYaml, WORK_LIMITS } from '../src/index.js';
import { plain } from './helpers.js';

const read = (text) => plain(parseYaml(text));
const fails = (text, part, line) => {
  assert.throws(() => parseYaml(text), (e) => {
    assert.ok(e instanceof ParseError, `not a ParseError: ${e}`);
    assert.ok(e.message.includes(part), `"${e.message}" does not include "${part}"`);
    if (line !== undefined) assert.equal(e.line, line);
    return true;
  });
};

test('yaml: a mapping of plain scalars', () => {
  assert.deepEqual(read('a: one\nb: two words\n'), { a: 'one', b: 'two words' });
});

test('yaml: true, false, null, ~ and whole numbers are read; yes, no and decimals stay text', () => {
  assert.deepEqual(read('a: true\nb: false\nc: null\nd: ~\ne: 42\nf: -7\ng: yes\nh: no\ni: 1.5\nj: 0x10\n'), { a: true, b: false, c: null, d: null, e: 42, f: -7, g: 'yes', h: 'no', i: '1.5', j: '0x10' });
});

test('yaml: a number of more than fifteen digits stays text', () => {
  assert.deepEqual(read('a: 1234567890123456\nb: 123456789012345\n'), { a: '1234567890123456', b: 123456789012345 });
});

test('yaml: a key with no value is null', () => {
  assert.deepEqual(read('a:\nb: 1\n'), { a: null, b: 1 });
  assert.deepEqual(read('a:\n'), { a: null });
});

test('yaml: double-quoted scalars with escapes', () => {
  assert.deepEqual(read('a: "x\\ty\\n\\"z\\" \\\\ \\/"\n'), { a: 'x\ty\n"z" \\ /' });
});

test('yaml: hexadecimal escapes in double quotes', () => {
  assert.deepEqual(read('a: "A\\x42\\x43"\n'), { a: 'ABC' });
});

test('yaml: single-quoted scalars, with a doubled quote', () => {
  assert.deepEqual(read("a: 'it''s here'\n"), { a: "it's here" });
});

test('yaml: a quoted number or word stays text', () => {
  assert.deepEqual(read('a: "42"\nb: \'true\'\nc: "null"\n'), { a: '42', b: 'true', c: 'null' });
});

test('yaml: a quoted value may hold a colon, a hash and square brackets', () => {
  assert.deepEqual(read('a: "x: y # z [1]"\n'), { a: 'x: y # z [1]' });
});

test('yaml: an apostrophe inside a plain scalar is not a quote', () => {
  assert.deepEqual(read("a: I'm a bot # a comment\n"), { a: "I'm a bot" });
});

test('yaml: a hash starts a comment only after a space or at the start', () => {
  assert.deepEqual(read('# top\na: b#c # tail\n  # indented comment\nd: e\n'), { a: 'b#c', d: 'e' });
});

test('yaml: a hash inside quotes is not a comment', () => {
  assert.deepEqual(read('a: "x # y" # z\nb: \'p # q\'\n'), { a: 'x # y', b: 'p # q' });
});

test('yaml: nested mappings', () => {
  assert.deepEqual(read('a:\n  b:\n    c: 1\n  d: 2\ne: 3\n'), { a: { b: { c: 1 }, d: 2 }, e: 3 });
});

test('yaml: a list of scalars, indented and at the level of its key', () => {
  assert.deepEqual(read('a:\n  - x\n  - y\nb:\n- p\n- q\nc: 1\n'), { a: ['x', 'y'], b: ['p', 'q'], c: 1 });
});

test('yaml: a list of mappings', () => {
  assert.deepEqual(read('opts:\n  - label: One\n    next: a\n  - label: Two\n    next: b\n'), { opts: [{ label: 'One', next: 'a' }, { label: 'Two', next: 'b' }] });
});

test('yaml: a list of mappings with a dash on a line of its own', () => {
  assert.deepEqual(read('opts:\n  -\n    label: One\n    next: a\n  -\n    label: Two\n'), { opts: [{ label: 'One', next: 'a' }, { label: 'Two' }] });
});

test('yaml: a nested list item on one line', () => {
  assert.deepEqual(read('a:\n  - - x\n    - y\n  - z\n'), { a: [['x', 'y'], 'z'] });
});

test('yaml: a list at the top level', () => {
  assert.deepEqual(read('- a\n- b\n'), ['a', 'b']);
});

test('yaml: a bare dash is a null item', () => {
  assert.deepEqual(read('a:\n  -\n  - x\n'), { a: [null, 'x'] });
});

test('yaml: a list in square brackets holds scalars', () => {
  assert.deepEqual(read("a: [x, 'y z', \"w\", 3, true]\nb: []\nc: {}\n"), { a: ['x', 'y z', 'w', 3, true], b: [], c: {} });
});

test('yaml: a list in square brackets with a quoted comma', () => {
  assert.deepEqual(read('a: ["x, y", z]\n'), { a: ['x, y', 'z'] });
});

test('yaml: a literal block scalar keeps the line ends', () => {
  assert.deepEqual(read('a: |\n  one\n  two\n\n  three\nb: 1\n'), { a: 'one\ntwo\n\nthree', b: 1 });
});

test('yaml: a folded block scalar joins lines with a space', () => {
  assert.deepEqual(read('a: >\n  one\n  two\n\n  three\nb: 1\n'), { a: 'one two\nthree', b: 1 });
});

test('yaml: a block scalar with a chomping mark, last in the file', () => {
  assert.deepEqual(read('a: |-\n  text\n'), { a: 'text' });
  assert.deepEqual(read('a: >+\n  text\n  more\n'), { a: 'text more' });
});

test('yaml: a block scalar keeps a hash and a colon in its lines', () => {
  assert.deepEqual(read('a: |\n  x: y # not a comment\nb: 2\n'), { a: 'x: y # not a comment', b: 2 });
});

test('yaml: an empty block scalar', () => {
  assert.deepEqual(read('a: |\nb: 2\n'), { a: '', b: 2 });
});

test('yaml: a document start marker at the top is allowed', () => {
  assert.deepEqual(read('---\na: 1\n'), { a: 1 });
});

test('yaml: CRLF and CR line ends read the same as LF', () => {
  const lf = 'a: 1\nb:\n  - x\n  - y\nc: |\n  p\n  q\n';
  assert.deepEqual(read(lf.replaceAll('\n', '\r\n')), read(lf));
  assert.deepEqual(read(lf.replaceAll('\n', '\r')), read(lf));
});

test('yaml: a key in quotes', () => {
  assert.deepEqual(read('"a b": 1\n\'c\': 2\n'), { 'a b': 1, c: 2 });
});

test('yaml: a key named __proto__ is only a name', () => {
  const tree = parseYaml('__proto__: 1\nconstructor: 2\n');
  assert.deepEqual([...tree.entries.keys()], ['__proto__', 'constructor']);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(tree.entries), Map.prototype);
});

test('yaml: lines and columns of keys and values', () => {
  const tree = parseYaml('a: 1\nb:\n  c: text\n');
  assert.equal(tree.entries.get('a').line, 1);
  assert.equal(tree.entries.get('a').col, 1);
  const c = tree.entries.get('b').node.entries.get('c');
  assert.equal(c.line, 3);
  assert.equal(c.col, 3);
  assert.equal(c.node.col, 6);
});

test('yaml: a key written twice is an error at the second', () => {
  fails('a: 1\nb: 2\na: 3\n', 'written twice', 3);
});

test('yaml: a key written twice inside a list item is an error', () => {
  fails('- a: 1\n  a: 2\n', 'written twice', 2);
});

test('yaml: a tab in the indentation is an error', () => {
  fails('a:\n\tb: 1\n', 'tab', 2);
});

test('yaml: anchors, aliases and tags are refused', () => {
  fails('a: &x 1\n', 'anchors', 1);
  fails('a: *x\n', 'anchors', 1);
  fails('a: !tag 1\n', 'anchors', 1);
});

test('yaml: a mapping in braces is refused, an empty one is not', () => {
  fails('a: {b: 1}\n', 'braces', 1);
  assert.deepEqual(read('a: {}\n'), { a: {} });
});

test('yaml: several documents are refused', () => {
  fails('a: 1\n---\nb: 2\n', 'more than one document', 2);
  fails('---\n---\na: 1\n', 'more than one document', 2);
  fails('a: 1\n...\n', 'document markers', 2);
});

test('yaml: a complex key is refused', () => {
  fails('? a\n: b\n', 'complex keys', 1);
});

test('yaml: a quoted value not closed is an error', () => {
  fails('a: "open\n', 'not closed', 1);
  fails("a: 'open\n", 'not closed', 1);
});

test('yaml: text after a closing quote is an error', () => {
  fails('a: "x" y\n', 'after the closing quote', 1);
});

test('yaml: an escape that is not known is an error', () => {
  fails('a: "\\q"\n', 'escape', 1);
  fails('a: "\\x4"\n', 'hexadecimal', 1);
});

test('yaml: a plain value with a colon and a space must be quoted', () => {
  fails('a: x: y\n', 'in quotes', 1);
  fails('a: x:\n', 'in quotes', 1);
});

test('yaml: a value that starts with a reserved character must be quoted', () => {
  fails('a: %x\n', 'cannot start with', 1);
  fails('a: @x\n', 'cannot start with', 1);
});

test('yaml: a line with no colon is an error', () => {
  fails('a: 1\njust text\n', 'key: value', 2);
});

test('yaml: unexpected indentation is an error', () => {
  fails('a: 1\n    b: 2\n', 'indentation', 2);
});

test('yaml: a line that does not line up with the text above is an error', () => {
  fails('a:\n    b: 1\n  c: 2\n', 'indentation', 3);
});

test('yaml: list items and keys cannot be mixed', () => {
  fails('a: 1\n- x\n', 'mixed', 2);
  fails('a:\n  - x\n  b: 1\n', 'line up', 3);
  fails('- x\na: 1\n', 'line up', 2);
});

test('yaml: a list item after a key on the same line is refused', () => {
  fails('a: - x\n', 'list item', 1);
});

test('yaml: a list in square brackets must close on its line, hold scalars and not end in a comma', () => {
  fails('a: [x, y\n', 'must end with', 1);
  fails('a: [[x]]\n', 'only scalars', 1);
  fails('a: [x, ]\n', 'comma', 1);
  fails('a: ["x" y]\n', 'closing quote', 1);
});

test('yaml: a block scalar header with something after it is an error', () => {
  fails('a: |x\n  t\n', 'block scalar header', 1);
});

test('yaml: a block scalar as a list item is refused', () => {
  fails('- |\n  x\n', 'block scalar', 1);
});

test('yaml: an empty file or a file of comments holds no dictionary', () => {
  fails('', 'no dictionary', 1);
  fails('# only a comment\n\n', 'no dictionary', 1);
});

test('yaml: nesting deeper than the limit is an error, not a stack overflow', () => {
  let text = '';
  for (let i = 0; i < WORK_LIMITS.maxDepth + 5; i += 1) text += `${' '.repeat(i * 2)}k${i}:\n`;
  fails(text, 'deeper than');
});

test('yaml: a very long chain of nested list items does not overflow the stack', () => {
  fails(`${'- '.repeat(5000)}x\n`, 'deeper than', 1);
});

test('yaml: more lines than the limit is an error', () => {
  assert.throws(() => parseYaml('a: 1\n'.repeat(6), { ...WORK_LIMITS, maxLines: 5 }), /more than 5 lines/);
});
