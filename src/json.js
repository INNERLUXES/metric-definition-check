// A reader of JSON that keeps the line and column of every key and value. It works through a stack and a loop, never through a
// call to itself, so a file of nested brackets cannot exhaust the stack; the depth is limited all the same. Strings are decoded
// with JSON.parse on the text between the quotes. A key written twice is an error.

import { LIMITS } from './data.js';
import { ParseError, mapNode, scalarNode, seqNode } from './nodes.js';

export function parseJson(text, limits = LIMITS) {
  const n = text.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const column = () => i - lineStart + 1;
  const fail = (message, l = line, c = column()) => {
    throw new ParseError(message, l, c);
  };
  const skip = () => {
    for (;;) {
      const c = text.charCodeAt(i);
      if (c === 10) {
        i += 1;
        line += 1;
        lineStart = i;
      } else if (c === 13) {
        i += 1;
        if (text.charCodeAt(i) === 10) i += 1;
        line += 1;
        lineStart = i;
      } else if (c === 32 || c === 9) i += 1;
      else break;
    }
  };
  // The string that starts at the quote at i; i moves past the closing quote.
  const readString = () => {
    const start = i;
    let j = i + 1;
    for (;;) {
      if (j >= n) fail('a string is not closed', line, column());
      const c = text.charCodeAt(j);
      if (c === 34) break;
      if (c === 92) j += 2;
      else if (c < 32) fail('a string holds a control character or a line end; write it as an escape such as \n', line, j - lineStart + 1);
      else j += 1;
    }
    let value;
    try {
      value = JSON.parse(text.slice(start, j + 1));
    } catch {
      fail('a string holds an escape that JSON does not know');
    }
    i = j + 1;
    return value;
  };
  const stack = [];
  let root = null;
  const attach = (node) => {
    if (stack.length === 0) {
      root = node;
      return;
    }
    const f = stack.at(-1);
    if (f.node.t === 'q') f.node.items.push(node);
    else f.node.entries.set(f.key, { node, line: f.keyLine, col: f.keyCol });
  };
  // A key, its colon, and the frame ready for the value.
  const readKey = (f) => {
    skip();
    if (text[i] !== '"') fail('a key must be text in double quotes');
    const keyLine = line;
    const keyCol = column();
    const key = readString();
    if (f.node.entries.has(key)) fail(`the key "${key.slice(0, 40)}" is written twice in one mapping`, keyLine, keyCol);
    skip();
    if (text[i] !== ':') fail('a colon was expected after the key');
    i += 1;
    f.key = key;
    f.keyLine = keyLine;
    f.keyCol = keyCol;
  };
  let expectValue = true;
  for (;;) {
    if (expectValue) {
      skip();
      if (i >= n) fail('the file ends where a value was expected');
      const c = text[i];
      const l = line;
      const col = column();
      if (c === '{' || c === '[') {
        const node = c === '{' ? mapNode(l, col) : seqNode(l, col);
        attach(node);
        i += 1;
        if (stack.length >= limits.maxDepth) fail(`brackets are nested deeper than ${limits.maxDepth}`, l, col);
        const f = { node, key: null, keyLine: 0, keyCol: 0 };
        stack.push(f);
        skip();
        if (text[i] === (c === '{' ? '}' : ']')) {
          i += 1;
          stack.pop();
          expectValue = false;
        } else if (c === '{') readKey(f);
        continue;
      }
      if (c === '"') attach(scalarNode(readString(), l, col));
      else if (c === '-' || (c >= '0' && c <= '9')) {
        let j = i;
        while (j < n && '0123456789+-.eE'.includes(text[j])) j += 1;
        let value;
        try {
          value = JSON.parse(text.slice(i, j));
        } catch {
          fail('this is not a number');
        }
        if (typeof value !== 'number') fail('this is not a number');
        i = j;
        attach(scalarNode(value, l, col));
      } else {
        const word = ['true', 'false', 'null'].find((w) => text.startsWith(w, i));
        if (word === undefined) fail('a value was expected: text in double quotes, a number, true, false, null, a list or a mapping');
        i += word.length;
        attach(scalarNode(word === 'null' ? null : word === 'true', l, col));
      }
      expectValue = false;
      continue;
    }
    if (stack.length === 0) break;
    skip();
    const f = stack.at(-1);
    const c = text[i];
    if (c === ',') {
      i += 1;
      skip();
      if (text[i] === '}' || text[i] === ']') fail('a comma before a closing bracket is not allowed in JSON');
      if (f.node.t === 'm') readKey(f);
      expectValue = true;
    } else if ((c === '}' && f.node.t === 'm') || (c === ']' && f.node.t === 'q')) {
      i += 1;
      stack.pop();
    } else fail(f.node.t === 'm' ? 'a comma or a closing } was expected' : 'a comma or a closing ] was expected');
  }
  skip();
  if (i < n) fail('there is text after the end of the JSON value');
  return root;
}
