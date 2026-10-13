// The model of a metric dictionary: a list of metrics, each with an id, a name, a definition, a formula, a unit, a grain, a period
// rule, an owner, source systems and a status. It is built from the tree that the YAML or the JSON reader made, with the line and
// column of every key kept, so a finding points at the place. A value that is not what the format says is a field-invalid finding
// and the metric is still read as far as it can be.

import { list, show } from './collect.js';
import { DICTIONARY_KEYS, METRIC_KEYS, METRIC_KEY_ALIASES, STATUSES, TYPES } from './data.js';
import { nearest } from './fields.js';
import { readTextFormula, readTreeFormula } from './formula.js';
import { describe } from './nodes.js';

const at = (line, col) => ({ file: 'dictionary', line, column: col });

// Text with runs of white space as one space, in lower case: how two names, ids or labels are compared.
export const normalize = (t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase();

// The words of a text, in lower case, split at anything that is not a letter or a digit.
export const wordsOf = (t) => normalize(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// A key as it is compared: lower case, with spaces and hyphens as underscores.
export const keyOf = (t) => String(t).trim().toLowerCase().replace(/[\s-]+/g, '_');

// The keys of a mapping, each under its own name: { fields: Map(name -> entry) }. A key the tool does not read, with the nearest
// name, and a key given under two names, are findings.
export function keysOf(map, known, aliases, what, add, file) {
  const fields = new Map();
  const names = [...known, ...aliases.keys()];
  for (const [key, e] of map.entries) {
    const name = keyOf(key);
    const canonical = known.includes(name) ? name : aliases.get(name);
    if (canonical === undefined) {
      const near = nearest(name, names, name.length < 5 ? 1 : 2);
      add('field-unknown', { file, line: e.line, column: e.col }, `${what} has the key "${show(key, 40)}", which the tool does not read; nothing under it is checked.${near ? ` Did you mean "${aliases.has(near) ? aliases.get(near) : near}"?` : ''}`, key);
      continue;
    }
    if (fields.has(canonical)) {
      add('field-invalid', { file, line: e.line, column: e.col }, `${what} has "${canonical}" twice, once under the name "${show(key, 40)}"; give it once.`, key);
      continue;
    }
    fields.set(canonical, { ...e, written: key });
  }
  return fields;
}

// The text of a scalar entry: '' when the key is not there or is empty, null when the value is not text or a number.
export function textOf(fields, key, what, add, limits, file = 'dictionary') {
  const entry = fields.get(key);
  if (entry === undefined) return '';
  const node = entry.node;
  const where = { file, line: entry.line, column: entry.col };
  if (node.t !== 's') {
    add('field-invalid', where, `${what}: "${key}" must be text, not ${describe(node)}.`, key);
    return null;
  }
  if (node.v === null) return '';
  if (typeof node.v === 'boolean') {
    add('field-invalid', where, `${what}: "${key}" must be text, not a true or false value.`, key);
    return null;
  }
  const text = String(node.v).trim();
  if (text.length > limits.maxTextLength) {
    add('field-invalid', where, `${what}: "${key}" is longer than ${limits.maxTextLength} characters.`, key);
    return null;
  }
  return text;
}

// The list of texts of a key that holds a text or a list of texts.
export function listOf(fields, key, what, add, limits, file = 'dictionary') {
  const entry = fields.get(key);
  if (entry === undefined) return [];
  const node = entry.node;
  const where = { file, line: entry.line, column: entry.col };
  const items = node.t === 'q' ? node.items : [node];
  if (items.length > limits.maxListItems) {
    add('field-invalid', where, `${what}: "${key}" holds more than ${limits.maxListItems} entries.`, key);
    return [];
  }
  const out = [];
  for (const item of items) {
    if (item.t !== 's' || typeof item.v === 'boolean') {
      add('field-invalid', where, `${what}: "${key}" must be a text or a list of texts, not ${item.t === 's' ? 'a true or false value' : describe(item)}.`, key);
      continue;
    }
    if (item.v === null) continue;
    const text = String(item.v).trim();
    if (text.length > limits.maxTextLength) add('field-invalid', where, `${what}: an entry of "${key}" is longer than ${limits.maxTextLength} characters.`, key);
    else if (text !== '') out.push(text);
  }
  return out;
}

// The formula of a metric from its entry: { kind: 'none' | 'text' | 'tree' | 'invalid', text, refs, groups, division, canonical }.
function formulaOf(fields, what, add, limits) {
  const none = { kind: 'none', text: '', refs: [], groups: [], division: false, canonical: '' };
  const entry = fields.get('formula');
  if (entry === undefined) return none;
  const node = entry.node;
  const where = at(entry.line, entry.col);
  if (node.t === 's' && (node.v === null || String(node.v).trim() === '')) return none;
  if (node.t === 'q' || (node.t === 's' && typeof node.v === 'boolean')) {
    add('field-invalid', where, `${what}: "formula" must be text or a mapping with op and args, not ${describe(node)}.`, 'formula');
    return { ...none, kind: 'invalid' };
  }
  if (node.t === 's') {
    const text = String(node.v).trim();
    if (text.length > limits.maxTextLength) {
      add('field-invalid', where, `${what}: "formula" is longer than ${limits.maxTextLength} characters.`, 'formula');
      return { ...none, kind: 'invalid' };
    }
    const r = readTextFormula(text, node.line, node.col);
    if (r.problem) {
      add('field-invalid', where, `${what}: the formula cannot be followed: ${r.problem}.`, 'formula');
      return { ...none, kind: 'invalid', text };
    }
    return { kind: 'text', text, ...r };
  }
  const r = readTreeFormula(node, limits);
  if (r.problem) {
    add('field-invalid', at(r.line, r.column), `${what}: the formula cannot be followed: ${r.problem}.`, 'formula');
    return { ...none, kind: 'invalid' };
  }
  return { kind: 'tree', text: r.canonical, ...r };
}

// The metrics named in the numerator or the denominator, which may be written in the same way as in a formula.
function partOf(text, node, what, key, add) {
  if (text === '' || text === null) return [];
  const r = readTextFormula(text, node.line, node.col);
  if (r.problem) {
    add('field-invalid', at(node.line, node.col), `${what}: "${key}" cannot be followed: ${r.problem}.`, key);
    return [];
  }
  return r.refs;
}

// Reads the dictionary from the tree. Returns { name, metrics, line, column, metricsLine, metricsColumn } or null when the tree
// is not a dictionary the tool can read, after a file-unreadable finding.
export function readDictionary(root, add, limits) {
  if (root.t !== 'm') {
    add('file-unreadable', at(root.line, root.col), 'The dictionary file must be a mapping with a "metrics" list, written as docs/inputs.md shows.');
    return null;
  }
  const top = keysOf(root, DICTIONARY_KEYS, new Map(), 'The dictionary', add, 'dictionary');
  const name = textOf(top, 'name', 'The dictionary', add, limits) ?? '';
  const entry = top.get('metrics');
  if (entry === undefined) {
    add('file-unreadable', at(root.line, root.col), 'The dictionary has no "metrics" list.');
    return null;
  }
  if (entry.node.t !== 'q') {
    add('file-unreadable', at(entry.line, entry.col), `"metrics" must be a list of metrics, not ${describe(entry.node)}.`);
    return null;
  }
  if (entry.node.items.length === 0) {
    add('file-unreadable', at(entry.line, entry.col), 'The "metrics" list is empty; a dictionary holds at least one metric.');
    return null;
  }
  if (entry.node.items.length > limits.maxMetrics) {
    add('file-unreadable', at(entry.line, entry.col), `The dictionary has more than ${limits.maxMetrics} metrics.`);
    return null;
  }
  const metrics = [];
  for (const [index, node] of entry.node.items.entries()) {
    if (node.t !== 'm') {
      add('field-invalid', at(node.line, node.col), `Item ${index + 1} of "metrics" must be a mapping with the keys of a metric, not ${describe(node)}.`);
      continue;
    }
    const what = `The metric at line ${node.line}`;
    const fields = keysOf(node, METRIC_KEYS, METRIC_KEY_ALIASES, what, add, 'dictionary');
    const id = textOf(fields, 'id', what, add, limits) ?? '';
    const rawName = textOf(fields, 'name', what, add, limits);
    const metricName = rawName ?? '';
    const label = metricName !== '' ? `The metric "${show(metricName, 60)}"` : id !== '' ? `The metric "${show(id, 60)}"` : what;
    if (id === '') {
      const given = fields.get('id');
      add('field-invalid', at(given ? given.line : node.line, given ? given.col : node.col), `${what} has ${given ? 'an empty' : 'no'} "id"; a report points at a metric by its id.`);
    }
    if (rawName === '') {
      const given = fields.get('name');
      add('field-invalid', at(given ? given.line : node.line, given ? given.col : node.col), `${what} has ${given ? 'an empty' : 'no'} "name"; a report shows a metric under its name.`);
    }
    const definition = textOf(fields, 'definition', label, add, limits) ?? '';
    const formula = formulaOf(fields, label, add, limits);
    const unit = textOf(fields, 'unit', label, add, limits) ?? '';
    const grain = textOf(fields, 'grain', label, add, limits) ?? '';
    const period = textOf(fields, 'period', label, add, limits) ?? '';
    const owner = textOf(fields, 'owner', label, add, limits) ?? '';
    const aggregation = textOf(fields, 'aggregation', label, add, limits) ?? '';
    const replacedBy = textOf(fields, 'replaced_by', label, add, limits) ?? '';
    const numerator = textOf(fields, 'numerator', label, add, limits) ?? '';
    const denominator = textOf(fields, 'denominator', label, add, limits) ?? '';
    let status = '';
    let statusInvalid = false;
    let statusPlace = null;
    const st = fields.get('status');
    if (st !== undefined) {
      statusPlace = at(st.line, st.col);
      const text = textOf(fields, 'status', label, add, limits);
      if (text !== null && text !== '') {
        if (STATUSES.includes(text.toLowerCase())) status = text.toLowerCase();
        else {
          statusInvalid = true;
          add('field-invalid', statusPlace, `${label} has the status "${show(text, 40)}"; it must be ${list(STATUSES)}.`, text);
        }
      } else if (text === null) statusInvalid = true;
    }
    let type = '';
    const ty = fields.get('type');
    if (ty !== undefined) {
      const text = textOf(fields, 'type', label, add, limits);
      if (text !== null && text !== '') {
        if (TYPES.includes(text.toLowerCase())) type = text.toLowerCase();
        else add('field-invalid', at(ty.line, ty.col), `${label} has the type "${show(text, 40)}"; it must be ${list([...TYPES, 'left out'])}.`, text);
      }
    }
    const refs = [...formula.refs];
    for (const key of ['numerator', 'denominator']) {
      const e = fields.get(key);
      if (e !== undefined && e.node.t === 's') refs.push(...partOf(key === 'numerator' ? numerator : denominator, e.node, label, key, add));
    }
    metrics.push({
      index: metrics.length,
      line: node.line,
      column: node.col,
      id,
      name: metricName,
      definition,
      formula,
      unit,
      grain,
      period,
      owner,
      sources: listOf(fields, 'source', label, add, limits),
      status,
      statusPlace,
      statusInvalid,
      replacedBy,
      aliases: listOf(fields, 'aliases', label, add, limits),
      filters: listOf(fields, 'filters', label, add, limits),
      aggregation,
      type,
      numerator,
      denominator,
      refs,
      fields
    });
  }
  if (metrics.length === 0) {
    add('file-unreadable', at(entry.line, entry.col), 'No item of "metrics" could be read as a metric.');
    return null;
  }
  return { name, metrics, line: root.line, column: root.col, metricsLine: entry.line, metricsColumn: entry.col };
}
