// A run: read the dictionary file and the reports file, check them, and build the report object that the formats write.

import { checkDictionary, checkReports, statusOf, tally } from './checks.js';
import { createCollector, show } from './collect.js';
import { LEVELS, LIMITS as WORK_LIMITS, NOTICE } from './data.js';
import { nearest } from './fields.js';
import { InputError, displayPath, locateInput, readInputText } from './files.js';
import { readDictionary } from './dictionary.js';
import { parseJson } from './json.js';
import { ParseError } from './nodes.js';
import { readReportsTable, readReportsTree } from './reports.js';
import { RULES, decide, ruleById } from './rules.js';
import { plural } from './size.js';
import { safeText } from './text.js';
import { parseYaml } from './yaml.js';

export { InputError };

export const LIMITS = { ...WORK_LIMITS };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };
const KIND_ORDER = { file: 0, dictionary: 1, reports: 2 };
const FILE_ORDER = { dictionary: 0, reports: 1 };
const DICTIONARY_RULES = RULES.filter((r) => r.kind === 'dictionary').map((r) => r.id);
const REPORT_RULES = RULES.filter((r) => r.kind === 'reports').map((r) => r.id);
const NEEDS_DICTIONARY = REPORT_RULES.filter((id) => id !== 'report-no-owner');

// A comma-separated list option: the entries, trimmed, without the empty ones.
function entries(flag, given) {
  const items = String(given ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (items.length > 200) throw new Error(`${flag}: more than 200 entries`);
  return items;
}

// The options of a run, each given as text or left to its default. A value that cannot be used throws an Error whose message says
// which.
export function readOptions({ disable = null } = {}) {
  const off = entries('--disable', disable);
  for (const id of off) {
    if (ruleById(id) === undefined) {
      const near = nearest(id, RULES.map((r) => r.id), 6);
      throw new Error(`--disable: unknown check ${show(id, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
    }
  }
  return { disable: new Set(off), disableList: [...off] };
}

// The format of a file from its first character: JSON when it opens a mapping or a list in brackets, otherwise YAML.
export function detectFormat(text) {
  for (const c of text) {
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    return c === '{' || c === '[' ? 'json' : 'yaml';
  }
  return 'yaml';
}

// The tree of a YAML or JSON text, or null after a file-unreadable finding.
function treeOf(text, format, file, what, add) {
  try {
    return format === 'json' ? parseJson(text, WORK_LIMITS) : parseYaml(text, WORK_LIMITS);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    add('file-unreadable', { file, line: error.line, column: error.column }, `The ${what} cannot be read as ${format === 'json' ? 'JSON' : 'the YAML subset'}: ${error.message}.`);
    return null;
  }
}

// The summary of the dictionary and of the reports: the counts by status, owner and grain, and what the reports show.
function summarize(model, reports, used) {
  const out = { dictionary: null, reports: null };
  if (model !== null) {
    const metrics = model.metrics;
    out.dictionary = {
      name: model.name === '' ? null : clean(model.name, 120),
      metrics: metrics.length,
      byStatus: tally(metrics.map((m) => (m.status === '' ? '(not set)' : m.status))),
      byOwner: tally(metrics.map((m) => (m.owner === '' ? '(none)' : clean(m.owner, 80)))),
      byGrain: tally(metrics.map((m) => (m.grain === '' ? '(none)' : clean(m.grain, 80))))
    };
    for (const key of ['byStatus', 'byOwner', 'byGrain']) out.dictionary[key] = out.dictionary[key].map((r) => ({ ...r, value: clean(r.value, 80) }));
  }
  if (reports !== null) {
    const distinct = new Set(reports.items.map((i) => i.metric.trim().toLowerCase()));
    out.reports = {
      reports: reports.reports.length,
      rows: reports.rows,
      metricsShown: distinct.size,
      metricsOnNoReport: model === null ? null : model.metrics.filter((m) => !m.duplicate).length - used.size,
      ownerColumn: reports.ownerColumn
    };
  }
  return out;
}

// The findings of the text of the dictionary file and of the reports file, with no file system. Either text may be null.
// reportsAs is 'csv' when the reports file is a table and 'data' (the default) when it is YAML or JSON. Returns { format,
// reportsFormat, model, reports, summary, findings, notes, omitted, state }.
export function checkText(dictionaryText, reportsText, { options = readOptions(), reportsAs = 'data' } = {}) {
  const collector = createCollector();
  const { notes } = collector;
  const add = (id, where, message, subject = null) => {
    if (!options.disable.has(id)) collector.add(id, where, message, subject);
  };
  let model = null;
  let index = null;
  let format = null;
  const state = { dictionary: dictionaryText === null ? 'absent' : 'unreadable', reports: reportsText === null ? 'absent' : 'unreadable' };
  if (dictionaryText !== null) {
    format = detectFormat(dictionaryText);
    const root = treeOf(dictionaryText, format, 'dictionary', 'dictionary file', add);
    if (root !== null) model = readDictionary(root, add, WORK_LIMITS);
    if (model !== null) {
      state.dictionary = 'read';
      index = checkDictionary(model, add);
    } else notes.push('no check of the dictionary ran because the dictionary file could not be read');
  }
  let reports = null;
  let reportsFormat = null;
  let used = new Set();
  if (reportsText !== null) {
    if (reportsAs === 'csv') {
      reportsFormat = 'csv';
      reports = readReportsTable(reportsText, add, WORK_LIMITS);
    } else {
      reportsFormat = detectFormat(reportsText);
      const root = treeOf(reportsText, reportsFormat, 'reports', 'reports file', add);
      if (root !== null) reports = readReportsTree(root, add, WORK_LIMITS);
    }
    if (reports !== null) {
      state.reports = 'read';
      used = checkReports(reports, index, add).used;
      if (reports.items.length === 0) notes.push('the reports file has no usable row, so no check of the reports could find anything');
      if (model === null && dictionaryText !== null) notes.push('the reports were not set against the dictionary because the dictionary file could not be read');
    } else notes.push('no check of the reports ran because the reports file could not be read');
  }
  if (options.disable.size > 0) notes.push(`checks turned off with --disable: ${options.disableList.join(', ')}`);
  const summary = model !== null || reports !== null ? summarize(model, reports, used) : null;
  return { format, reportsFormat, model, reports, summary, findings: collector.findings, notes, omitted: collector.omitted, state };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// Why a check did not run, or null when it did.
function skipReason(id, checked, options, files) {
  if (options.disable.has(id)) return 'turned off with --disable';
  if (REPORT_RULES.includes(id) && files.reports === null) return 'no --reports file was given';
  if (id === 'report-no-owner' && checked.reports !== null && !checked.reports.ownerColumn) return 'the reports table has no owner column';
  return null;
}

// The report object for the findings. files is { dictionary, reports }, each { file, bytes, lines } or null.
export function buildReport({ files, checked, version, minSeverity = 'info', failOn = 'error', options = readOptions() }) {
  const names = { dictionary: files.dictionary?.file ?? null, reports: files.reports?.file ?? null };
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    const file = f.file === null ? null : names[f.file];
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      file,
      line: f.line,
      column: f.column,
      at: file === null ? 'input' : `${file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      fix: rule.fix,
      kind: rule.kind,
      source: f.file
    };
  });
  const rank = (f) => (f.source === null ? 2 : FILE_ORDER[f.source]);
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || rank(a) - rank(b) || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  const omitted = checked.omitted;
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const extra = (rule) => omitted.get(rule.id) ?? 0;
  const byLevel = { error: 0, warning: 0, info: 0 };
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  for (const f of shown) byLevel[f.severity] += 1;
  for (const rule of RULES) {
    allByLevel[rule.severity] += extra(rule);
    if (LEVELS.indexOf(rule.severity) >= LEVELS.indexOf(minSeverity)) byLevel[rule.severity] += extra(rule);
  }
  const total = (o) => o.error + o.warning + o.info;
  const notes = [...checked.notes];
  for (const [id, n] of omitted) notes.push(`${n.toLocaleString('en-US')} more findings of ${id} are not listed; the first 1,000 are`);
  const counts = new Map();
  for (const f of all) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
  const shownCounts = new Map();
  for (const f of shown) shownCounts.set(f.id, (shownCounts.get(f.id) ?? 0) + 1);
  const checks = RULES.map((r) => {
    const count = (counts.get(r.id) ?? 0) + extra(r);
    const skipped = skipReason(r.id, checked, options, files);
    let status = count > 0 ? 'fail' : 'pass';
    let detail = count > 0 ? plural(count, 'finding') : 'no finding';
    if (skipped !== null) {
      status = 'skipped';
      detail = skipped;
    } else if (count === 0) {
      const noDictionary = checked.state.dictionary !== 'read';
      const noReports = checked.state.reports !== 'read';
      if (DICTIONARY_RULES.includes(r.id) && noDictionary) {
        status = 'not-evaluated';
        detail = 'the dictionary file could not be read';
      } else if (REPORT_RULES.includes(r.id) && noReports) {
        status = 'not-evaluated';
        detail = 'the reports file could not be read';
      } else if (NEEDS_DICTIONARY.includes(r.id) && noDictionary) {
        status = 'not-evaluated';
        detail = 'the dictionary file could not be read';
      }
    }
    return { id: r.id, level: r.severity, kind: r.kind, status, findings: count, detail };
  });
  return {
    tool: 'metric-definition-check',
    version,
    input: {
      dictionary: files.dictionary === null ? null : { file: files.dictionary.file, format: checked.format, bytes: files.dictionary.bytes, lines: files.dictionary.lines },
      reports: files.reports === null ? null : { file: files.reports.file, format: checked.reportsFormat, bytes: files.reports.bytes, lines: files.reports.lines }
    },
    evaluated: { dictionary: checked.state.dictionary === 'read', reports: checked.state.reports === 'read' },
    summary: checked.summary,
    checks,
    totals: { findings: total(byLevel), byLevel, hidden: total(allByLevel) - total(byLevel) },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: (shownCounts.get(r.id) ?? 0) + (LEVELS.indexOf(r.severity) >= LEVELS.indexOf(minSeverity) ? extra(r) : 0) })),
    options: { minSeverity, failOn, disabled: options.disableList },
    findings: shown.map(({ source, ...rest }) => rest),
    notes: notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

async function load({ path, limits, base }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  return { absolute, text, file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) } };
}

// Whether a reports file is read as a table: by the end of its name.
export const isTable = (path) => /\.(?:csv|tsv)$/i.test(path);

// Reads the files and builds the report. Problems with either file are collected, so a run that cannot read both says so for both.
export async function checkFiles({ dictionaryPath, reportsPath = null, minSeverity = 'info', failOn = 'error', options = null, optionValues = {}, version, limits = LIMITS, base = process.cwd() }) {
  const used = options ?? readOptions(optionValues);
  const problems = [];
  const loaded = { dictionary: null, reports: null };
  for (const [name, path] of [['dictionary', dictionaryPath], ['reports', reportsPath]]) {
    if (path === null) continue;
    try {
      loaded[name] = await load({ path, limits, base });
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      problems.push(...error.problems);
    }
  }
  if (problems.length > 0) throw new InputError(problems);
  if (loaded.dictionary && loaded.reports && loaded.dictionary.absolute === loaded.reports.absolute) throw new InputError([`${loaded.dictionary.file.file}: the dictionary file and the reports file are the same file`]);
  const checked = checkText(loaded.dictionary?.text ?? null, loaded.reports?.text ?? null, { options: used, reportsAs: reportsPath !== null && isTable(reportsPath) ? 'csv' : 'data' });
  return buildReport({ files: { dictionary: loaded.dictionary?.file ?? null, reports: loaded.reports?.file ?? null }, checked, version, minSeverity, failOn, options: used });
}
