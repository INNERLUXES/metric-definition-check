// The checks. Each reads the model of the dictionary or of the reports file and reports through add(id, where, message, subject).
// No check connects to anything or runs a formula, and none calls itself: the work is loops over lists and maps, each metric and
// each report row visited a bounded number of times. The circles are found with a loop over a stack.

import { list, show } from './collect.js';
import { FILLER_WORDS, GRAIN_LADDERS, GRAIN_WORDS, NEEDS_PERIOD, RATIO_TYPES, RATIO_WORDS, COUNT_WORDS } from './data.js';
import { editDistance } from './fields.js';
import { normalize, wordsOf } from './dictionary.js';
import { plural } from './size.js';

const dict = (line, column) => ({ file: 'dictionary', line, column });
const rep = (line, column) => ({ file: 'reports', line, column });
const metricWhere = (m) => dict(m.line, m.column);
const keyWhere = (m, key) => {
  const e = m.fields.get(key);
  return e === undefined ? metricWhere(m) : dict(e.line, e.col);
};

// The status a metric is read under: a metric with no status is read as active.
export const statusOf = (m) => (m.status === '' ? 'active' : m.status);

const metricLabel = (m) => (m.name !== '' ? `The metric "${show(m.name, 60)}"` : m.id !== '' ? `The metric "${show(m.id, 60)}"` : `The metric at line ${m.line}`);
const called = (m) => (m.name !== '' ? `"${show(m.name, 60)}"` : `"${show(m.id, 60)}"`);

// The nearest id to a text, for a message about an id that is not there. The work is bounded: only a few lookups are made for a run,
// and only among the first thousand ids, so a file full of unknown ids cannot make the tool slow.
const SUGGEST_ASKS = 50;
const SUGGEST_FROM = 1000;

function suggester(byId) {
  const ids = [];
  for (const [key, m] of byId) {
    if (ids.length >= SUGGEST_FROM) break;
    if (key.length <= 80) ids.push([key, m.id]);
  }
  let asked = 0;
  return (text) => {
    if (asked >= SUGGEST_ASKS || text.length > 80) return null;
    asked += 1;
    const t = normalize(text);
    const within = t.length < 5 ? 1 : 2;
    let best = null;
    let bestDistance = within + 1;
    for (const [key, shown] of ids) {
      if (Math.abs(key.length - t.length) > within) continue;
      const d = editDistance(t, key);
      if (d < bestDistance) {
        best = shown;
        bestDistance = d;
      }
    }
    return best;
  };
}

// The words of a text without the filler words, as one text.
const significant = (t) => wordsOf(t).filter((w) => !FILLER_WORDS.includes(w)).join(' ');

// Where a grain sits on its ladder: { ladder, rank }, or null for a grain the tool does not know.
export function grainRank(text) {
  let key = text.slice(0, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  for (const prefix of ['one_row_per_', 'each_', 'per_', 'by_']) if (key.startsWith(prefix)) key = key.slice(prefix.length);
  key = GRAIN_WORDS.get(key) ?? key;
  for (const [ladder, steps] of GRAIN_LADDERS.entries()) {
    const rank = steps.indexOf(key);
    if (rank >= 0) return { ladder, rank };
  }
  return null;
}

const hasWord = (m, words) => wordsOf(`${m.name} ${m.id}`).some((w) => words.includes(w));

// Whether a metric is read as a ratio or a rate: by its type, or, with no type, by the words of its name and id, its unit or a division.
export function isRatio(m) {
  if (m.type !== '') return RATIO_TYPES.includes(m.type);
  return hasWord(m, RATIO_WORDS) || m.formula.division || /percent|%/i.test(m.unit.slice(0, 80));
}

// Whether a metric is read as a rate, a ratio or a count, which are measured over a period.
export function needsPeriod(m) {
  if (m.type !== '') return NEEDS_PERIOD.includes(m.type);
  return isRatio(m) || hasWord(m, COUNT_WORDS);
}

// The circles of the dependencies, as lists of metric indexes, found with Tarjan's method on a stack, never by a call to itself.
export function circles(count, edges) {
  const index = new Int32Array(count).fill(-1);
  const low = new Int32Array(count);
  const onStack = new Uint8Array(count);
  const stack = [];
  const found = [];
  let counter = 0;
  for (let start = 0; start < count; start += 1) {
    if (index[start] !== -1) continue;
    const work = [[start, 0]];
    index[start] = counter;
    low[start] = counter;
    counter += 1;
    stack.push(start);
    onStack[start] = 1;
    while (work.length > 0) {
      const frame = work.at(-1);
      const v = frame[0];
      const out = edges[v];
      if (frame[1] < out.length) {
        const w = out[frame[1]];
        frame[1] += 1;
        if (index[w] === -1) {
          index[w] = counter;
          low[w] = counter;
          counter += 1;
          stack.push(w);
          onStack[w] = 1;
          work.push([w, 0]);
        } else if (onStack[w] === 1) low[v] = Math.min(low[v], index[w]);
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = work.at(-1)[0];
          low[parent] = Math.min(low[parent], low[v]);
        }
        if (low[v] === index[v]) {
          const members = [];
          let w;
          do {
            w = stack.pop();
            onStack[w] = 0;
            members.push(w);
          } while (w !== v);
          if (members.length > 1 || edges[v].includes(v)) found.push(members.sort((a, b) => a - b));
        }
      }
    }
  }
  return found.sort((a, b) => a[0] - b[0]);
}

// The checks of the dictionary on its own. Returns the index the reports are checked against: { byId, names }.
export function checkDictionary(model, add) {
  const metrics = model.metrics;
  const byId = new Map();
  const names = new Map();
  const formulas = new Map();
  const related = (a, b) => (a.status === 'deprecated' && a.replacedBy !== '' && normalize(a.replacedBy) === normalize(b.id)) || (b.status === 'deprecated' && b.replacedBy !== '' && normalize(b.replacedBy) === normalize(a.id));

  // First the ids, the names and the aliases, which the other checks look things up in.
  for (const m of metrics) {
    if (m.id !== '') {
      const key = normalize(m.id);
      const first = byId.get(key);
      if (first) {
        m.duplicate = true;
        add('metric-duplicate-id', metricWhere(m), `The id "${show(m.id)}" is used by two metrics: ${called(first)} at line ${first.line} and ${called(m)} at line ${m.line}.`, m.id);
      } else byId.set(key, m);
    }
  }
  for (const m of metrics) {
    const own = new Set();
    for (const text of [m.name, ...m.aliases]) {
      const key = normalize(text);
      if (key === '' || own.has(key)) continue;
      own.add(key);
      const first = names.get(key);
      if (first === undefined) names.set(key, m);
      else if (first !== m && !m.duplicate && !related(first, m)) {
        add('name-clash', metricWhere(m), `The name "${show(text)}" is used by two metrics: ${called(first)} at line ${first.line} and ${called(m)} at line ${m.line}${key === normalize(m.name) && key === normalize(first.name) ? '' : ' (one of them as an alias)'}.`, text);
      }
    }
  }
  const suggest = suggester(byId);
  const edges = metrics.map(() => []);

  for (const m of metrics) {
    const label = metricLabel(m);
    if (m.definition === '') add('metric-no-definition', metricWhere(m), `${label} has no written definition, so nothing says in words what is counted or measured.`, m.name || m.id);
    else {
      const d = significant(m.definition);
      if (d !== '' && (d === significant(m.name) || d === significant(m.id))) add('definition-repeats-name', keyWhere(m, 'definition'), `${label} has a definition that is only its name said again ("${show(m.definition, 80)}").`, m.name || m.id);
    }
    if (m.formula.kind === 'none') add('metric-no-formula', metricWhere(m), `${label} has no formula, so nothing says how the number is worked out.`, m.name || m.id);
    if (m.unit === '') add('metric-no-unit', metricWhere(m), `${label} has no unit, such as a currency, count, percent or days.`, m.name || m.id);
    if (m.grain === '') add('metric-no-grain', metricWhere(m), `${label} has no grain, so nothing says the level it is calculated at.`, m.name || m.id);
    if (m.owner === '') add('metric-no-owner', metricWhere(m), `${label} has no owner, so nobody is named who decides its definition.`, m.name || m.id);
    if (m.sources.length === 0) add('metric-no-source', metricWhere(m), `${label} has no source system, so nothing says where its data comes from.`, m.name || m.id);
    if (m.status === '' && !m.statusInvalid) add('metric-no-status', metricWhere(m), `${label} has no status (active, draft or deprecated); it is read as active.`, m.name || m.id);
    if (m.period === '' && needsPeriod(m)) add('metric-no-period', metricWhere(m), `${label} looks like a rate, a ratio or a count${m.type === '' ? '' : ` (its type is ${m.type})`} and has no period or time window rule, so nothing says over what time it is measured.`, m.name || m.id);
    if (isRatio(m) && m.type !== 'snapshot') {
      const hasNumerator = m.numerator !== '';
      const hasDenominator = m.denominator !== '';
      if (!m.formula.division && !(hasNumerator && hasDenominator)) {
        const missing = hasNumerator ? 'the denominator' : hasDenominator ? 'the numerator' : 'the numerator and the denominator';
        add('ratio-parts-missing', metricWhere(m), `${label} is a ratio and does not state ${missing}: write "numerator" and "denominator", or the division in the formula.`, m.name || m.id);
      }
    }

    const seen = new Set();
    const status = statusOf(m);
    const rank = m.grain === '' ? null : grainRank(m.grain);
    for (const ref of m.refs) {
      const key = normalize(ref.id);
      const target = byId.get(key);
      if (target === undefined) {
        if (seen.has(`?${key}`)) continue;
        seen.add(`?${key}`);
        const near = suggest(ref.id);
        add('formula-unknown-metric', dict(ref.line, ref.column), `${label} names the metric "${show(ref.id)}", which is not in the dictionary.${near ? ` The nearest id is "${show(near)}".` : ''}`, ref.id);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      if (!m.duplicate) edges[m.index].push(target.index);
      if (target === m) continue;
      const targetStatus = statusOf(target);
      if (status === 'active' && (targetStatus === 'draft' || targetStatus === 'deprecated')) {
        add('active-uses-inactive', dict(ref.line, ref.column), `${label} is active and is built on ${called(target)}, which is ${targetStatus}${targetStatus === 'deprecated' && target.replacedBy !== '' ? ` (replaced by "${show(target.replacedBy)}")` : ''}.`, target.id);
      }
      if (rank !== null && m.aggregation === '' && target.grain !== '') {
        const other = grainRank(target.grain);
        if (other !== null && other.ladder === rank.ladder && rank.rank < other.rank) {
          add('grain-finer-than-input', keyWhere(m, 'grain'), `${label} has the grain "${show(m.grain, 40)}", which is finer than "${show(target.grain, 40)}" of ${called(target)} that it is built on, and gives no "aggregation" note.`, m.name || m.id);
        }
      }
    }

    for (const group of m.formula.groups) {
      const units = new Map();
      for (const term of group) {
        if (term === null) continue;
        const t = byId.get(normalize(term.id));
        if (t === undefined || t.unit === '') continue;
        const u = normalize(t.unit);
        if (!units.has(u)) units.set(u, [t, t.unit]);
      }
      if (units.size > 1) {
        const shown = [...units.values()].map(([t, unit]) => `${called(t)} in ${show(unit, 30)}`);
        add('formula-unit-mismatch', keyWhere(m, 'formula'), `${label} adds or subtracts metrics of different units: ${list(shown, 4)}.`, m.name || m.id);
      }
    }

    if (m.replacedBy !== '') {
      const target = byId.get(normalize(m.replacedBy));
      const place = keyWhere(m, 'replaced_by');
      if (target === undefined) {
        const near = suggest(m.replacedBy);
        add('replaced-by-invalid', place, `${label} is replaced by "${show(m.replacedBy)}", which is not in the dictionary.${near ? ` The nearest id is "${show(near)}".` : ''}`, m.replacedBy);
      } else if (target === m || normalize(target.id) === normalize(m.id)) add('replaced-by-invalid', place, `${label} is replaced by itself.`, m.replacedBy);
      else if (target.status === 'deprecated') add('replaced-by-invalid', place, `${label} is replaced by ${called(target)}, which is deprecated too.`, m.replacedBy);
    } else if (m.status === 'deprecated') {
      add('deprecated-no-replacement', keyWhere(m, 'status'), `${label} is deprecated and has no "replaced_by", so a reader of a report that still shows it is not told what to use.`, m.name || m.id);
    }

    if (m.formula.canonical !== '') {
      const key = `${m.formula.canonical}\n${m.filters.map(normalize).sort().join('|')}`;
      const first = formulas.get(key);
      if (first === undefined) formulas.set(key, m);
      else if (normalize(first.name) !== normalize(m.name) && !m.duplicate && !related(first, m)) {
        add('formula-duplicate', keyWhere(m, 'formula'), `${label} has the same formula as ${called(first)} at line ${first.line} ("${show(m.formula.text, 80)}") under another name.`, m.name || m.id);
      }
    }
  }

  const done = new Set();
  for (const members of circles(metrics.length, edges)) {
    const first = metrics[members[0]];
    const key = members.join(',');
    if (done.has(key)) continue;
    done.add(key);
    const shown = members.map((i) => called(metrics[i]));
    if (members.length === 1) add('metric-circular', keyWhere(first, 'formula'), `${metricLabel(first)} names itself in its formula, so it is defined by itself.`, first.name || first.id);
    else add('metric-circular', keyWhere(first, 'formula'), `${plural(members.length, 'metric')} depend on each other in a circle: ${list(shown, 6)}.`, first.name || first.id);
  }
  return { byId, suggest };
}

// The checks of the reports against the dictionary.
export function checkReports(reports, index, add) {
  for (const r of reports.reports) {
    if (reports.ownerColumn && r.owner === '') {
      const p = r.ownerPlace ?? { line: r.line, column: r.column };
      add('report-no-owner', rep(p.line, p.column), `The report "${show(r.name, 60)}" has no owner, so nobody is named who can answer for its numbers.`, r.name);
    }
  }
  if (index === null) return { used: new Set() };
  const { byId, suggest } = index;
  const clashes = new Map();
  const nameSets = new Map();
  const namesOf = (m) => {
    let s = nameSets.get(m);
    if (s === undefined) {
      s = new Set([normalize(m.name), ...m.aliases.map(normalize)]);
      nameSets.set(m, s);
    }
    return s;
  };
  const used = new Set();
  for (const item of reports.items) {
    const where = rep(item.line, item.column);
    const reportLabel = `The report "${show(item.report.name, 60)}"`;
    const target = byId.get(normalize(item.metric));
    if (target === undefined) {
      const near = suggest(item.metric);
      add('report-unknown-metric', where, `${reportLabel} shows the metric "${show(item.metric)}", which is not in the dictionary.${near ? ` The nearest id is "${show(near)}".` : ''}`, item.metric);
      continue;
    }
    used.add(target.index);
    if (item.label !== '' && !namesOf(target).has(normalize(item.label))) {
      add('report-label-differs', rep(item.labelPlace.line, item.labelPlace.column), `${reportLabel} shows ${called(target)} as "${show(item.label)}", which is not its name or one of its aliases.`, item.label);
    }
    if (target.status === 'deprecated') {
      add('report-shows-deprecated', where, `${reportLabel} shows ${called(target)}, which is deprecated${target.replacedBy !== '' ? ` (replaced by "${show(target.replacedBy)}")` : ''}.`, target.id);
    }
    const effective = item.label !== '' ? item.label : target.name;
    const key = normalize(effective);
    if (key === '') continue;
    const explicit = item.label !== '';
    const first = clashes.get(key);
    if (first === undefined) clashes.set(key, { metric: target, explicit, item });
    else if (first.metric !== target && normalize(first.metric.id) !== normalize(target.id) && (explicit || first.explicit)) {
      add('report-label-clash', where, `${reportLabel} shows ${called(target)} under the label "${show(effective)}", the label that ${show(first.item.report.name, 60)} uses for ${called(first.metric)} (line ${first.item.line}).`, effective);
    }
  }
  return { used };
}

// Counts by a value: the value as first written (compared without case), the count, the most first and then in alphabetical order,
// at most `max` rows, the rest as one row.
export function tally(values, max = 50) {
  const counts = new Map();
  for (const v of values) {
    const key = normalize(v);
    const e = counts.get(key);
    if (e === undefined) counts.set(key, { value: v, count: 1 });
    else e.count += 1;
  }
  const rows = [...counts.values()].sort((a, b) => b.count - a.count || (a.value.toLowerCase() < b.value.toLowerCase() ? -1 : a.value.toLowerCase() > b.value.toLowerCase() ? 1 : 0));
  if (rows.length <= max) return rows;
  const rest = rows.slice(max);
  return [...rows.slice(0, max), { value: `${rest.length.toLocaleString('en-US')} more`, count: rest.reduce((n, r) => n + r.count, 0), more: true }];
}
