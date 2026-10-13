// Formulas. A formula is written as text, in which a metric is named {metric_id} and anything else is read as a plain word, a
// number or an operator, or as a structure: a mapping with `metric`, `field`, `value`, or `op` and `args`. Neither is ever
// evaluated. Reading one gives the metrics it names (with the place), the groups of metrics that are added or subtracted (for the
// unit check), a canonical text (for the check of two metrics with one formula) and whether it divides one thing by another.
// Both readers work through loops and a stack and never call themselves.

import { ADDITIVE, OPERATIONS } from './data.js';
import { describe } from './nodes.js';

const OPERATOR_CHARACTERS = '+-*/^%,';

// The text of a formula as tokens: { kind: 'ref', value }, { kind: 'word', value }, { kind: 'op', value }, { kind: 'open' } and
// { kind: 'close' }. Returns { tokens } or { problem }.
export function tokenize(text) {
  const tokens = [];
  const n = text.length;
  let depth = 0;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '{') {
      const end = text.indexOf('}', i + 1);
      const inner = end < 0 ? '' : text.slice(i + 1, end);
      if (end < 0 || inner.includes('{')) return { problem: 'a { is not closed; write a metric as {metric_id}' };
      const id = inner.trim();
      if (id === '') return { problem: 'a pair of braces holds no metric id; write a metric as {metric_id}' };
      if (id.length > 200) return { problem: 'a metric id between braces is longer than 200 characters' };
      tokens.push({ kind: 'ref', value: id });
      i = end + 1;
    } else if (c === '}') return { problem: 'a } has no { before it; write a metric as {metric_id}' };
    else if (c === '(') {
      depth += 1;
      tokens.push({ kind: 'open' });
      i += 1;
    } else if (c === ')') {
      depth -= 1;
      if (depth < 0) return { problem: 'a ) has no ( before it' };
      tokens.push({ kind: 'close' });
      i += 1;
    } else if (OPERATOR_CHARACTERS.includes(c)) {
      tokens.push({ kind: 'op', value: c });
      i += 1;
    } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i += 1;
    else {
      let j = i;
      while (j < n && !' \t\n\r{}()'.includes(text[j]) && !OPERATOR_CHARACTERS.includes(text[j])) j += 1;
      tokens.push({ kind: 'word', value: text.slice(i, j).toLowerCase() });
      i = j;
    }
  }
  if (depth !== 0) return { problem: 'a ( is not closed' };
  return { tokens };
}

// What the tokens of a formula say: the metrics named, the groups of terms that are added or subtracted (each term that is exactly
// one metric gives its id, any other term gives null), whether a term is divided by another, and the canonical text.
export function readTokens(tokens) {
  const refs = [];
  const groups = [];
  let division = false;
  const stack = [{ terms: [], current: [] }];
  const finish = (g) => {
    if (g.current.length > 0) g.terms.push(g.current.length === 1 && g.current[0].kind === 'ref' ? g.current[0].value : null);
    g.current = [];
  };
  for (const [i, t] of tokens.entries()) {
    const g = stack.at(-1);
    if (t.kind === 'ref') {
      refs.push(t.value);
      g.current.push(t);
    } else if (t.kind === 'open') {
      stack.push({ terms: [], current: [] });
    } else if (t.kind === 'close') {
      finish(g);
      stack.pop();
      groups.push(g.terms);
      stack.at(-1).current.push({ kind: 'group' });
    } else if (t.kind === 'op' && (t.value === '+' || t.value === '-')) {
      if (g.current.length > 0) finish(g);
    } else {
      if (t.kind === 'op' && t.value === '/') {
        const before = tokens[i - 1];
        const after = tokens[i + 1];
        if (before && after && before.kind !== 'op' && before.kind !== 'open' && after.kind !== 'op' && after.kind !== 'close') division = true;
      }
      g.current.push(t);
    }
  }
  finish(stack[0]);
  groups.push(stack[0].terms);
  const canonical = tokens.map((t) => (t.kind === 'ref' ? `{${t.value.toLowerCase()}}` : t.kind === 'open' ? '(' : t.kind === 'close' ? ')' : t.value)).join('');
  return { refs, groups: groups.filter((g) => g.length > 1), division, canonical };
}

// A formula written as text. Returns { refs, groups, division, canonical } with a place on each ref, or { problem }.
export function readTextFormula(text, line, column) {
  const t = tokenize(text);
  if (t.problem) return { problem: t.problem };
  const r = readTokens(t.tokens);
  return {
    refs: r.refs.map((id) => ({ id, line, column })),
    groups: r.groups.map((g) => g.map((id) => (id === null ? null : { id, line, column }))),
    division: r.division,
    canonical: r.canonical
  };
}

const LEAF_KEYS = ['metric', 'field', 'value'];

// A formula written as a structure. Returns { refs, groups, division, canonical } or { problem, line, column }.
export function readTreeFormula(root, limits) {
  const refs = [];
  const groups = [];
  const out = [];
  let division = false;
  let nodes = 0;
  const bad = (problem, node) => ({ problem, line: node.line, column: node.col });
  const textOfValue = (node) => (node.t === 's' && node.v !== null && typeof node.v !== 'boolean' ? String(node.v).trim() : null);
  // Handles one node. Returns a frame to push for an operation, { leaf: true } for a leaf, or { problem }.
  const visit = (node, parent) => {
    nodes += 1;
    if (nodes > limits.maxFormulaNodes) return bad(`the formula has more than ${limits.maxFormulaNodes} parts`, node);
    if (node.t === 's') {
      const v = node.v;
      if (v === null || typeof v === 'boolean') return bad(`a part of the formula is ${describe(node)}; write a metric, a field, a value or an operation`, node);
      if (typeof v === 'number') {
        out.push(String(v));
        return { leaf: true };
      }
      const text = String(v).trim();
      const t = tokenize(text);
      if (t.problem) return bad(t.problem, node);
      if (t.tokens.length === 1 && t.tokens[0].kind === 'ref') {
        const ref = { id: t.tokens[0].value, line: node.line, column: node.col };
        refs.push(ref);
        parent?.group?.push(ref);
        out.push(`{${ref.id.toLowerCase()}}`);
      } else {
        parent?.group?.push(null);
        out.push(text.toLowerCase());
      }
      return { leaf: true };
    }
    if (node.t === 'q') return bad('a part of the formula is a list; write a mapping with metric, field, value or op', node);
    const keys = [...node.entries.keys()];
    for (const k of keys) if (![...LEAF_KEYS, 'op', 'args'].includes(k)) return bad(`the key "${k.slice(0, 40)}" is not part of a formula (metric, field, value, op, args)`, node);
    const leafKeys = keys.filter((k) => LEAF_KEYS.includes(k));
    if (keys.includes('op')) {
      if (leafKeys.length > 0) return bad('a part of the formula has an op and also a metric, field or value; give one', node);
      const op = textOfValue(node.entries.get('op').node)?.toLowerCase();
      if (!OPERATIONS.includes(op)) return bad(`the op "${String(op).slice(0, 40)}" is not one of ${OPERATIONS.join(', ')}`, node);
      const args = node.entries.get('args');
      if (args === undefined || args.node.t !== 'q' || args.node.items.length === 0) return bad(`the op "${op}" needs "args", a list of parts`, node);
      if (op === 'divide' && args.node.items.length !== 2) return bad('the op "divide" needs exactly two args, the numerator and the denominator', node);
      if (op === 'divide') division = true;
      out.push(`${op}(`);
      return { op, items: args.node.items, i: 0, group: ADDITIVE.includes(op) ? [] : null };
    }
    if (leafKeys.length !== 1 || keys.includes('args')) return bad('a part of the formula needs exactly one of metric, field, value or op', node);
    const key = leafKeys[0];
    const inner = node.entries.get(key).node;
    const text = key === 'value' && inner.t === 's' && typeof inner.v === 'number' ? String(inner.v) : textOfValue(inner);
    if (text === null || text === '') return bad(`"${key}" must be text${key === 'value' ? ' or a number' : ''}`, node);
    if (key === 'metric') {
      const ref = { id: text, line: node.line, column: node.col };
      refs.push(ref);
      parent?.group?.push(ref);
      out.push(`{${text.toLowerCase()}}`);
    } else {
      parent?.group?.push(null);
      out.push(key === 'field' ? text.toLowerCase() : text);
    }
    return { leaf: true };
  };
  const first = visit(root, null);
  if (first.problem) return first;
  const stack = [];
  if (!first.leaf) stack.push(first);
  while (stack.length > 0) {
    const f = stack.at(-1);
    if (f.i >= f.items.length) {
      out.push(')');
      if (f.group !== null && f.group.length > 1) groups.push(f.group);
      stack.pop();
      continue;
    }
    if (f.i > 0) out.push(',');
    const item = f.items[f.i];
    f.i += 1;
    if (stack.length >= limits.maxFormulaDepth) return bad(`the formula is nested deeper than ${limits.maxFormulaDepth} levels`, item);
    const child = visit(item, f);
    if (child.problem) return child;
    if (!child.leaf) stack.push(child);
  }
  return { refs, groups, division, canonical: out.join('') };
}
