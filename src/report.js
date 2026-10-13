// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools, SARIF for code scanning and
// JUnit XML for the test view of a build system. Every text that comes from the input (a file name, a metric name, a label, a
// message) was cleaned by safeText before it reached the report object. The markdown format also escapes what markdown gives a
// meaning to, the XML format escapes what XML gives a meaning to and drops the characters XML 1.0 cannot hold, and the SARIF and
// JSON formats are built as objects and written by JSON.stringify.

import { BEST, NOT_A } from './data.js';
import { RULES } from './rules.js';
import { grouped, plural } from './size.js';
import { safeText, xmlSafe } from './text.js';

const URI = 'https://github.com/INNERLUXES/metric-definition-check';

const clean = (t, max = 120) => safeText(t, max);

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (f) => `${f.file} (${f.format}, ${plural(f.lines, 'line')}, ${plural(f.bytes, 'byte')})`;

// The lines about the inputs, one for each fact.
function summaryLines(r) {
  const out = [];
  const s = r.summary;
  if (r.input.dictionary) {
    if (!r.evaluated.dictionary) out.push(['dictionary', 'not read: the file could not be followed']);
    else {
      const d = s.dictionary;
      out.push(['dictionary', `${d.name === null ? '' : `${clean(d.name)}: `}${plural(d.metrics, 'metric')}`]);
    }
  }
  if (r.input.reports) {
    if (!r.evaluated.reports) out.push(['reports', 'not read: the file could not be followed']);
    else {
      const p = s.reports;
      const rest = p.metricsOnNoReport === null ? '' : `; ${plural(p.metricsOnNoReport, 'metric')} of the dictionary on no report`;
      out.push(['reports', `${plural(p.reports, 'report')}, ${plural(p.rows, 'metric shown', 'metrics shown')}, ${plural(p.metricsShown, 'different metric')}${rest}`]);
    }
  }
  return out;
}

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const CHECK_HEAD = ['check', 'level', 'kind', 'status', 'findings'];
const checkRows = (r) => r.checks.map((c) => [c.id, c.level, c.kind, c.status, c.status === 'skipped' || c.status === 'not-evaluated' ? `- (${c.detail})` : grouped(c.findings)]);

// The three small tables of the summary: metrics for each status, owner and grain.
const SUMMARY_TABLES = [['byStatus', 'status', 'Metrics for each status'], ['byOwner', 'owner', 'Metrics for each owner'], ['byGrain', 'grain', 'Metrics for each grain']];
const summaryRows = (rows) => rows.map((t) => [t.value, grouped(t.count)]);
const hasSummary = (r) => r.evaluated.dictionary && r.summary && r.summary.dictionary;

const PAD = ' '.repeat(11);

const filesOf = (r) => [r.input.dictionary?.file, r.input.reports?.file].filter(Boolean).join(' + ');

export function toText(r) {
  const out = [];
  out.push(`metric-definition-check: ${filesOf(r)}`);
  if (r.input.dictionary) out.push(`dictionary file: ${fileLine(r.input.dictionary)}`);
  if (r.input.reports) out.push(`reports file: ${fileLine(r.input.reports)}`);
  for (const [k, v] of summaryLines(r)) out.push(`${k}: ${v}`);
  out.push(`findings: ${findingsLine(r)}`);
  if (hasSummary(r)) {
    for (const [key, name, title] of SUMMARY_TABLES) {
      out.push('', title, '');
      out.push(...table([name, 'metrics'], summaryRows(r.summary.dictionary[key])));
    }
  }
  out.push('', `Checks (${grouped(r.checks.length)})`, '');
  out.push(...table(CHECK_HEAD, checkRows(r)), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

function mdTable(head, rows) {
  return [`| ${head.map(md).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(md).join(' | ')} |`), ''];
}

export function toMarkdown(r) {
  const out = [];
  out.push(`# metric-definition-check: ${md(filesOf(r))}`, '');
  if (r.input.dictionary) out.push(`- Dictionary file: ${md(fileLine(r.input.dictionary))}`);
  if (r.input.reports) out.push(`- Reports file: ${md(fileLine(r.input.reports))}`);
  for (const [k, v] of summaryLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  if (hasSummary(r)) {
    for (const [key, name, title] of SUMMARY_TABLES) out.push(`## ${title}`, '', ...mdTable([name, 'metrics'], summaryRows(r.summary.dictionary[key])));
  }
  out.push('## Checks', '', ...mdTable(CHECK_HEAD, checkRows(r)));
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r) {
  return `${JSON.stringify(r, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the files as the artifacts, and one result for each finding that has a place in a
// file, with its line and column. A finding about no place is left out.
export function toSarif(r) {
  const files = [r.input.dictionary?.file, r.input.reports?.file].filter(Boolean);
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'metric-definition-check',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: files.map((uri) => ({ location: { uri } })),
        results: r.findings.filter((f) => f.file !== null).map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: files.indexOf(f.file) }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject }
        })),
        properties: { notice: r.notice, result: r.result.text }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// Text for XML: the five characters XML gives a meaning to are escaped, and the characters XML 1.0 cannot hold (a lone surrogate,
// U+FFFE and U+FFFF) are replaced by a question mark.
const xml = (t) => xmlSafe(t)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

// JUnit XML: one test suite, "metric-dictionary", with one test case for each check. A check with a finding is a failure, with the
// messages of its findings; a check that did not run is skipped, and one that could not run because a file could not be read is
// an error. No time is recorded, because the tool reads no clock, so every time is 0.
export function toJunit(r) {
  const byCheck = new Map();
  for (const f of r.findings) {
    const l = byCheck.get(f.id);
    if (l === undefined) byCheck.set(f.id, [f]);
    else l.push(f);
  }
  const cases = r.checks.map((c) => {
    const head = `    <testcase classname="metric-dictionary" name="${xml(c.id)}" time="0"`;
    if (c.status === 'pass') return { kind: 'pass', xml: `${head}/>` };
    if (c.status === 'skipped') return { kind: 'skipped', xml: `${head}>\n      <skipped message="${xml(c.detail)}"/>\n    </testcase>` };
    if (c.status === 'not-evaluated') return { kind: 'error', xml: `${head}>\n      <error type="not-evaluated" message="${xml(c.detail)}">${xml(c.detail)}</error>\n    </testcase>` };
    const found = byCheck.get(c.id) ?? [];
    const text = found.length ? found.map((f) => `${f.at}: ${f.message}`).join('\n') : c.detail;
    return { kind: 'failure', xml: `${head}>\n      <failure type="${xml(c.id)}" message="${xml(c.detail)}">${xml(text)}</failure>\n    </testcase>` };
  });
  const n = (kind) => cases.filter((c) => c.kind === kind).length;
  const attrs = `tests="${cases.length}" failures="${n('failure')}" errors="${n('error')}"`;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(`<testsuites name="metric-definition-check" ${attrs} time="0">`);
  out.push(`  <testsuite name="metric-dictionary" ${attrs} skipped="${n('skipped')}" time="0">`);
  out.push(...cases.map((c) => c.xml));
  out.push('  </testsuite>', '</testsuites>', '');
  return out.join('\n');
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['metric-definition-check checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(10)}  ${x.summary}`);
  out.push('', `Every check is ${BEST}. A check of a file is about whether it can be read and which keys and columns it holds, a check of the dictionary is about its metrics and how they depend on each other, and a check of the reports is about the list of reports set against the dictionary. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# metric-definition-check checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, own: x.own, cannot: x.cannot })), null, 2)}\n`;
}

export function explainText(rule) {
  const out = [`${rule.id}`, ''];
  out.push(`level: ${rule.severity}`, `kind: ${rule.kind}`, '');
  out.push(`what it looks at: ${rule.summary}`, '', `why it exists: ${rule.own}`, '', `what to change: ${rule.fix}`, '', `what it cannot see: ${rule.cannot}`, '');
  out.push(`This check is ${BEST}. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function explainMarkdown(rule) {
  const out = [`# ${md(rule.id)}`, ''];
  out.push(`- Level: ${rule.severity}`, `- Kind: ${rule.kind}`, '');
  out.push(`**What it looks at.** ${md(rule.summary)}`, '', `**Why it exists.** ${md(rule.own)}`, '', `**What to change.** ${md(rule.fix)}`, '', `**What it cannot see.** ${md(rule.cannot)}`, '');
  out.push(`This check is ${md(BEST)}.`, '');
  return out.join('\n');
}

export function explainJson(rule) {
  return `${JSON.stringify({ id: rule.id, severity: rule.severity, kind: rule.kind, summary: rule.summary, fix: rule.fix, own: rule.own, cannot: rule.cannot, note: `This check is ${BEST}.` }, null, 2)}\n`;
}
