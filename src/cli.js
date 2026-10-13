// Command line: metric-definition-check <dictionary file> [--reports <reports file>] [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFiles, readOptions } from './check.js';
import { LEVELS } from './data.js';
import { editDistance } from './fields.js';
import { explainJson, explainMarkdown, explainText, listChecksJson, listChecksMarkdown, listChecksText, toJson, toJunit, toMarkdown, toSarif, toText } from './report.js';
import { RULES, ruleById } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif, junit: toJunit };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };
const EXPLAINS = { text: explainText, markdown: explainMarkdown, json: explainJson };

export const USAGE = `Usage: metric-definition-check <dictionary file> [--reports <reports file>] [options]

Checks a metric dictionary, the written definitions of business measures such as revenue, active customers, churn or on-time
delivery, before dashboards and reports are built on it, so that two reports do not show two different numbers for one name. It
reads a dictionary, YAML (a small documented subset) or JSON, and, with --reports, a list of the reports and the metrics they show,
YAML, JSON or CSV (docs/inputs.md). It reports duplicate ids, names and aliases used by two metrics, a metric with no definition,
formula, unit, grain, owner, source or period, units that do not add up in a formula, formulas that name a metric that is not
there, circles, a metric finer than its inputs, active metrics built on draft or deprecated ones, bad replaced_by, two metrics with
one formula, ratios with a missing part, and, for the reports, unknown metrics, labels that differ from the dictionary, deprecated
metrics that are still shown, one label for two metrics and reports with no owner. It never connects to data or a BI tool, never runs
a formula, contacts nothing over the network, reads no clock and writes nothing to disk.

Options:
  --reports <file>        the reports file: YAML or JSON with a reports list, or a CSV table (a name ending in .csv or .tsv) with one
                          row for each metric shown
  --format <name>         text, markdown, json, sarif or junit (default: text)
  --json                  the same as --format json
  --disable <ids>         comma-separated ids of checks to leave out
  --min-severity <level>  the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>       the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --list-checks           list the checks with their level and kind, and exit
  --explain <id>          explain one check: what it looks at, what to change, what it cannot see, and exit
  --help                  show this text
  --version               show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

// The check whose id is nearest to the text, for a message about a misspelt id.
function nearestId(text) {
  let best = null;
  let bestDistance = Infinity;
  for (const r of RULES) {
    const d = editDistance(text.toLowerCase().slice(0, 80), r.id);
    if (d < bestDistance) {
      best = r.id;
      bestDistance = d;
    }
  }
  return bestDistance <= 6 ? best : null;
}

const VALUE_OPTIONS = new Map([
  ['--reports', 'reports'],
  ['--format', 'format'],
  ['--disable', 'disable'],
  ['--min-severity', 'minSeverity'],
  ['--fail-on', 'failOn'],
  ['--explain', 'explain']
]);

export function parseArgs(argv) {
  const o = { paths: [], reports: null, format: null, json: false, disable: null, minSeverity: null, failOn: null, listChecks: false, explain: null, help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (VALUE_OPTIONS.has(a)) {
      const key = VALUE_OPTIONS.get(a);
      if (o[key] !== null) throw new Error(`${a} was given twice`);
      o[key] = next();
    } else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${safeText(a, 60)}`);
    else {
      if (o.paths.length === 1) throw new Error('give one dictionary file; check another dictionary in another run');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${safeText(o.format, 40)} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${safeText(o.format, 40)} (text, markdown, json, sarif or junit)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${safeText(v, 40)} (${LEVELS.join(', ')})`);
  if (o.explain !== null && ruleById(o.explain) === undefined) {
    const near = nearestId(o.explain);
    throw new Error(`--explain: unknown check ${safeText(o.explain, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
  }
  if ((o.listChecks || o.explain !== null) && (o.format === 'sarif' || o.format === 'junit')) throw new Error(`${o.listChecks ? '--list-checks' : '--explain'} has no ${o.format.toUpperCase()} form; use text, markdown or json`);
  if (!o.help && !o.version && !o.listChecks && o.explain === null) {
    if (o.paths.length === 0) throw new Error('give the dictionary file, such as metric-definition-check metrics.yaml --reports reports.csv');
    for (const p of [...o.paths, ...(o.reports === null ? [] : [o.reports])]) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    optionsOf(o);
  }
  return o;
}

// The options of a run from the parsed arguments; throws an Error that names the option that cannot be used.
function optionsOf(o) {
  return readOptions({ disable: o.disable });
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`metric-definition-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  if (o.explain !== null) {
    io.out(EXPLAINS[o.format](ruleById(o.explain)));
    return 0;
  }
  const merged = { ...LIMITS, ...(limits ?? {}) };
  try {
    const report = await checkFiles({
      dictionaryPath: o.paths[0],
      reportsPath: o.reports,
      minSeverity: o.minSeverity ?? 'info',
      failOn: o.failOn ?? 'error',
      options: optionsOf(o),
      version: VERSION,
      limits: merged,
      base
    });
    io.out(FORMATS[o.format](report));
    return report.result.pass ? 0 : 1;
  } catch (error) {
    if (error instanceof InputError) io.err(`metric-definition-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`metric-definition-check: ${clean(error.message)}\n`);
    return 2;
  }
}
