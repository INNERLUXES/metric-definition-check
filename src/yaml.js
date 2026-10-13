// A reader of the small subset of YAML that docs/inputs.md describes: mappings and lists by indentation with spaces, plain,
// single-quoted and double-quoted scalars, true, false, null and whole numbers, lists of scalars in square brackets, the empty
// {} and [], comments, and the block scalars | and >. Anchors, aliases, tags, merge keys, several documents, tabs in the
// indentation, text over several lines outside a block scalar and mappings in braces are refused with the line and column.
// It works through a stack and a loop and never calls itself, so deep nesting cannot exhaust the stack (the depth is limited all
// the same). A key written twice in one mapping is an error. Nothing it reads is evaluated.

import { LIMITS } from './data.js';
import { ParseError, mapNode, scalarNode, seqNode } from './nodes.js';

const err = (message, line, col) => new ParseError(message, line, col);

// The line without a comment: a # that starts the text or follows a blank, outside a quoted scalar. A quote opens a quoted scalar
// only where a value can start, so the apostrophe of "I'm" is not one.
function stripComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote !== null) {
      if (quote === '"' && c === '\\') i += 1;
      else if (c === quote) {
        if (quote === "'" && s[i + 1] === "'") i += 1;
        else quote = null;
      }
    } else if (c === '"' || c === "'") {
      let j = i - 1;
      while (j >= 0 && s[j] === ' ') j -= 1;
      if (j < 0 || ':-[,{'.includes(s[j])) quote = c;
    } else if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) return s.slice(0, i);
  }
  return s;
}

const ESCAPES = new Map([['n', '\n'], ['t', '\t'], ['r', '\r'], ['0', '\0'], ['"', '"'], ['\\', '\\'], ['/', '/'], [' ', ' ']]);

// The quoted scalar that starts at s[start]: { value, end }, end is the index after the closing quote.
function readQuoted(s, start, line, col) {
  const q = s[start];
  let out = '';
  let i = start + 1;
  for (;;) {
    if (i >= s.length) throw err('a quoted value is not closed on the same line; quoted values do not continue on the next line', line, col + start);
    const c = s[i];
    if (q === "'") {
      if (c === "'") {
        if (s[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        return { value: out, end: i + 1 };
      }
      out += c;
      i += 1;
    } else if (c === '"') return { value: out, end: i + 1 };
    else if (c === '\\') {
      const e = s[i + 1];
      if (e === 'u' || e === 'x') {
        const len = e === 'u' ? 4 : 2;
        const hex = s.slice(i + 2, i + 2 + len);
        if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) throw err(`\\${e} must be followed by ${len} hexadecimal digits`, line, col + i);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2 + len;
      } else if (ESCAPES.has(e)) {
        out += ESCAPES.get(e);
        i += 2;
      } else throw err(`the escape \\${e ?? ''} is not known`, line, col + i);
    } else {
      out += c;
      i += 1;
    }
  }
}

const PLAIN_NUMBER = /^-?\d+$/;

// A plain scalar's value: true, false, null, a whole number or text.
function plainValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '~') return null;
  if (PLAIN_NUMBER.test(raw) && raw.length <= 15) return Number(raw);
  return raw;
}

// The items of a list in square brackets, each a scalar.
function readBracketList(raw, line, col) {
  if (!raw.endsWith(']')) throw err('a list in square brackets must end with ] on the same line', line, col);
  const inner = raw.slice(1, -1).trim();
  const node = seqNode(line, col);
  if (inner === '') return node;
  let i = 0;
  for (;;) {
    while (inner[i] === ' ') i += 1;
    let value;
    if (inner[i] === '"' || inner[i] === "'") {
      const q = readQuoted(inner, i, line, col + 1);
      value = q.value;
      i = q.end;
      while (inner[i] === ' ') i += 1;
      if (i < inner.length && inner[i] !== ',') throw err('text after the closing quote in a list', line, col + 1 + i);
    } else {
      let j = i;
      while (j < inner.length && inner[j] !== ',') j += 1;
      const piece = inner.slice(i, j).trim();
      if ('[]{}&*!|>'.includes(piece[0] ?? 'x') || piece.includes(': ')) throw err('a list in square brackets holds only scalars; write nested values on lines of their own', line, col + 1 + i);
      value = plainValue(piece);
      i = j;
    }
    node.items.push(scalarNode(value, line, col));
    if (i >= inner.length) break;
    i += 1;
    if (inner.slice(i).trim() === '') throw err('a comma at the end of a list in square brackets', line, col + 1 + i);
  }
  return node;
}

// The node for the text of a value (a scalar, or a list in square brackets, or {}).
function readValue(text, line, col) {
  const raw = text.trim();
  if (raw === '') return scalarNode(null, line, col);
  const c = raw[0];
  if (c === '"' || c === "'") {
    const q = readQuoted(raw, 0, line, col);
    if (raw.slice(q.end).trim() !== '') throw err('there is text after the closing quote', line, col + q.end);
    return scalarNode(q.value, line, col);
  }
  if (c === '[') return readBracketList(raw, line, col);
  if (c === '{') {
    if (raw === '{}') return mapNode(line, col);
    throw err('a mapping in braces is not supported; write the keys on lines of their own (or use JSON)', line, col);
  }
  if (c === '&' || c === '*' || c === '!') throw err('anchors, aliases and tags are not supported', line, col);
  if (c === '|' || c === '>') throw err('a block scalar (| or >) can only follow a key', line, col);
  if (c === '%' || c === '@' || c === '`') throw err(`a value cannot start with ${c}; put it in quotes`, line, col);
  if (raw.includes(': ') || raw.endsWith(':')) throw err('a value that holds a colon and a space must be in quotes', line, col);
  if (raw.startsWith('- ') || raw === '-') throw err('a list item cannot follow a key on the same line', line, col);
  return scalarNode(plainValue(raw), line, col);
}

// If s is "key: value" or "key:", the key and where the value starts in s; otherwise null.
function readKey(s, line, col) {
  if (s[0] === '"' || s[0] === "'") {
    let q;
    try {
      q = readQuoted(s, 0, line, col);
    } catch {
      return null;
    }
    let j = q.end;
    while (s[j] === ' ') j += 1;
    if (s[j] !== ':' || (j + 1 < s.length && s[j + 1] !== ' ')) return null;
    j += 1;
    while (s[j] === ' ') j += 1;
    return { key: q.value, valueAt: j };
  }
  let at = -1;
  for (let j = 0; j < s.length; j += 1) {
    if (s[j] === ':' && (j + 1 === s.length || s[j + 1] === ' ')) {
      at = j;
      break;
    }
  }
  if (at < 0) return null;
  const key = s.slice(0, at).trim();
  if (key === '' || '[]{}&*!|>%@`'.includes(key[0])) return null;
  let j = at + 1;
  while (s[j] === ' ') j += 1;
  return { key, valueAt: j };
}

export function parseYaml(text, limits = LIMITS) {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > limits.maxLines) throw err(`the file has more than ${limits.maxLines} lines`, 1, 1);
  const stack = [];
  let root = null;
  let started = false;
  let marker = false;

  const attach = (f, node) => {
    if (f.kind === 'm') f.node.entries.set(f.pending.key, { node, line: f.pending.line, col: f.pending.col });
    else f.node.items.push(node);
  };
  const resolve = (f) => {
    if (f.pending !== null) {
      attach(f, scalarNode(null, f.pending.line, f.pending.col));
      f.pending = null;
    }
  };
  const push = (kind, indent, node, line, col) => {
    if (stack.length >= limits.maxDepth) throw err(`the nesting is deeper than ${limits.maxDepth} levels`, line, col);
    const f = { kind, indent, node, pending: null };
    stack.push(f);
    return f;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];
    let indent = 0;
    while (raw[indent] === ' ') indent += 1;
    if (raw[indent] === '\t') throw err('a tab is not allowed in the indentation; use spaces', lineNo, indent + 1);
    const body = stripComment(raw.slice(indent)).trimEnd();
    if (body === '') continue;
    if (indent === 0 && body === '---') {
      if (started || marker) throw err('more than one document in a file is not supported', lineNo, 1);
      marker = true;
      continue;
    }
    if (indent === 0 && (body === '...' || body.startsWith('--- '))) throw err('document markers other than a single --- at the start are not supported', lineNo, 1);
    if (body[0] === '?' && (body.length === 1 || body[1] === ' ')) throw err('complex keys (?) are not supported', lineNo, indent + 1);
    started = true;
    const isItem = body === '-' || body.startsWith('- ');

    while (stack.length > 0 && stack.at(-1).indent > indent) resolve(stack.pop());
    let top = stack.at(-1);
    if (top && top.indent === indent && top.kind === 'q' && !isItem) {
      resolve(stack.pop());
      top = stack.at(-1);
      if (!top || top.indent !== indent) throw err('this line does not line up with the text above it', lineNo, indent + 1);
    }
    if (!top) {
      if (root !== null) throw err('this line does not line up with the text above it', lineNo, indent + 1);
      root = isItem ? seqNode(lineNo, indent + 1) : mapNode(lineNo, indent + 1);
      top = push(isItem ? 'q' : 'm', indent, root, lineNo, indent + 1);
    } else if (top.indent < indent) {
      if (top.pending === null) throw err('unexpected indentation: nothing above this line opens a block', lineNo, indent + 1);
      const child = isItem ? seqNode(lineNo, indent + 1) : mapNode(lineNo, indent + 1);
      attach(top, child);
      top.pending = null;
      top = push(isItem ? 'q' : 'm', indent, child, lineNo, indent + 1);
    } else if (top.pending !== null) {
      if (top.kind === 'm' && isItem) {
        const child = seqNode(lineNo, indent + 1);
        attach(top, child);
        top.pending = null;
        top = push('q', indent, child, lineNo, indent + 1);
      } else resolve(top);
    }
    if ((top.kind === 'q') !== isItem) throw err('list items and keys cannot be mixed at one level', lineNo, indent + 1);

    let frame = top;
    let current = body;
    let at = indent;
    // A list item may hold a nested list item or a mapping on its own line; peel one dash at a time.
    while (frame.kind === 'q') {
      const after = current === '-' ? '' : current.slice(2);
      let lead = 0;
      while (after[lead] === ' ') lead += 1;
      const rest = after.slice(lead);
      const restAt = at + 2 + lead;
      if (rest === '') {
        frame.pending = { key: null, line: lineNo, col: at + 1 };
        current = null;
        break;
      }
      if (rest === '-' || rest.startsWith('- ')) {
        const child = seqNode(lineNo, restAt + 1);
        frame.node.items.push(child);
        frame = push('q', restAt, child, lineNo, restAt + 1);
        current = rest;
        at = restAt;
        continue;
      }
      if (readKey(rest, lineNo, restAt + 1)) {
        const child = mapNode(lineNo, restAt + 1);
        frame.node.items.push(child);
        frame = push('m', restAt, child, lineNo, restAt + 1);
        current = rest;
        at = restAt;
      } else {
        frame.node.items.push(readValue(rest, lineNo, restAt + 1));
        current = null;
      }
      break;
    }
    if (current === null) continue;

    const entry = readKey(current, lineNo, at + 1);
    if (entry === null) throw err('expected "key: value" here', lineNo, at + 1);
    if (frame.node.entries.has(entry.key)) throw err(`the key "${entry.key.slice(0, 40)}" is written twice in one mapping`, lineNo, at + 1);
    const valueText = current.slice(entry.valueAt);
    const col = at + 1;
    if (valueText === '') {
      frame.pending = { key: entry.key, line: lineNo, col };
    } else if (valueText[0] === '|' || valueText[0] === '>') {
      if (!/^[|>][+-]?$/.test(valueText)) throw err('a block scalar header is | or > with an optional + or -', lineNo, at + 1 + entry.valueAt);
      const folded = valueText[0] === '>';
      const block = [];
      let blockIndent = -1;
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const l = lines[j];
        if (l.trim() === '') {
          block.push('');
          continue;
        }
        let k = 0;
        while (l[k] === ' ') k += 1;
        if (blockIndent < 0) {
          if (k <= frame.indent) break;
          blockIndent = k;
        } else if (k < blockIndent) break;
        block.push(l.slice(blockIndent));
      }
      while (block.length > 0 && block.at(-1) === '') block.pop();
      i = j - 1;
      let value = block.join('\n');
      if (folded) value = block.reduce((out, l, idx) => (idx === 0 ? l : l === '' ? `${out}\n` : block[idx - 1] === '' ? `${out}${l}` : `${out} ${l}`), '');
      frame.node.entries.set(entry.key, { node: scalarNode(value, lineNo, at + 1 + entry.valueAt), line: lineNo, col });
    } else {
      frame.node.entries.set(entry.key, { node: readValue(valueText, lineNo, at + 1 + entry.valueAt), line: lineNo, col });
    }
  }
  while (stack.length > 0) resolve(stack.pop());
  if (root === null) throw err('the file holds no dictionary', 1, 1);
  return root;
}
