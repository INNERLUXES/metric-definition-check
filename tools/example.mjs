// Runs the README examples, checks that they report what the README shows, and writes the reports of the made-up files to
// examples/output. CI runs it and then fails if those files changed, so the example output in the repository is always the real
// output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Every path is relative to the root of the repository.
export const BAD = ['examples/bad/metrics.yaml', '--reports', 'examples/bad/reports.csv'];
export const BAD_ALONE = ['examples/bad/metrics.yaml'];
export const BAD_JSON = ['examples/bad/metrics.json', '--reports', 'examples/bad/reports.json'];
export const BAD_CIRCLE = ['examples/bad/circular.yaml'];
export const BAD_REPORTS = ['examples/good/metrics.yaml', '--reports', 'examples/bad/reports.yaml'];
export const BAD_SYNTAX = ['examples/bad/metrics-syntax-error.yaml', '--reports', 'examples/bad/reports-syntax-error.csv'];
export const GOOD = ['examples/good/metrics.yaml', '--reports', 'examples/good/reports.yaml'];
export const GOOD_JSON = ['examples/good/metrics.json', '--reports', 'examples/good/reports.csv'];
export const EXPLAIN = ['--explain', 'name-clash'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad dictionary and reports: the counts, a finding of most checks and the result.
export const EXPECTED = [
  'dictionary: Online shop metric dictionary (with mistakes): 21 metrics',
  'reports: 2 reports, 6 metrics shown, 6 different metrics; 15 metrics of the dictionary on no report',
  'findings: 38 (16 error, 22 warning)',
  'The id "orders_placed" is used by two metrics',
  'The name "Revenue" is used by two metrics: "Revenue" at line 36 and "Net revenue" at line 47 (one of them as an alias).',
  'The metric "Refunds" has no written definition',
  'The metric "Revenue" has a definition that is only its name said again',
  'The metric "Customers in total" has no formula',
  'The metric "Refunds" has no unit',
  'The metric "Page visits" has no grain',
  'The metric "Page visits" has no owner',
  'The metric "Refunds" has no source system',
  'The metric "Page visits" has no status',
  'The metric "Active customers" looks like a rate, a ratio or a count (its type is count) and has no period',
  'The metric "Revenue plus orders" adds or subtracts metrics of different units: "Revenue" in USD and "Orders placed" in count.',
  'The metric "Net revenue" names the metric "refund", which is not in the dictionary. The nearest id is "refunds".',
  '2 metrics depend on each other in a circle: "Gross margin" and "Margin rate".',
  'The metric "Daily signup share" has the grain "day", which is finer than "month" of "Monthly signups"',
  'The metric "Net sales" is active and is built on "Revenue (legacy)", which is deprecated',
  'The metric "Visits (old)" is deprecated and has no "replaced_by"',
  'The metric "Revenue (legacy)" is replaced by "net_revenu", which is not in the dictionary. The nearest id is "net_revenue".',
  'The metric "Order count" has the same formula as "Orders placed" at line 3',
  'The metric "Churn rate" is a ratio and does not state the numerator and the denominator',
  'The metric at line 211 has the key "defintion"',
  'The metric "Returns" has the status "retired"',
  'The report "Weekly sales summary" shows the metric "revenu", which is not in the dictionary. The nearest id is "revenue".',
  'The report "Weekly sales summary" shows "Net revenue" as "Sales", which is not its name or one of its aliases.',
  'The report "Finance pack" shows "Revenue (legacy)", which is deprecated (replaced by "net_revenu").',
  'The report "Finance pack" shows "Gross margin" under the label "Revenue"',
  'The report "Finance pack" has no owner',
  'The row has 3 cells and the header has 5.',
  'This report reads the dictionary file and the reports file and nothing else.',
  'RESULT: FAIL - 16 findings at or above error (16 error, 22 warning)'
];
// What must not be reported for it: a file that cannot be read, and a pass.
export const UNWANTED = ['file-unreadable            examples', 'RESULT: PASS'];

// What the README says of the good files: no finding.
export const GOOD_EXPECTED = [
  'findings: 0',
  'RESULT: PASS - no finding at or above error'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad dictionary and reports', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good shop dictionary and reports', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  expect('good JSON dictionary and CSV reports', await run(GOOD_JSON), 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'RESULT: FAIL']);
  // The good files also pass when warnings and notes fail the run.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // The circles, which only a dictionary of its own shows.
  expect('circles', await run(BAD_CIRCLE), 1, [
    '3 metrics depend on each other in a circle: "Customer lifetime value", "Margin per customer" and "Average revenue per customer".',
    'The metric "Repeat rate" names itself in its formula',
    'RESULT: FAIL - 2 findings at or above error (2 error)'
  ], ['has no written definition']);
  // The good dictionary with reports that hold mistakes.
  expect('bad reports against the good dictionary', await run(BAD_REPORTS), 1, [
    'The report "Customer health" shows the metric "churn_rate", which is not in the dictionary.',
    'The report "Delivery performance" shows "On-time delivery rate" under the label "Churn", the label that Customer health uses for "Customer churn rate"',
    'The report "Delivery performance" shows "Revenue (legacy)", which is deprecated (replaced by "net_revenue").',
    'RESULT: FAIL - 2 findings at or above error (2 error, 5 warning)'
  ], ['ERROR    metric-', 'ERROR    name-']);
  // The dictionary on its own, and the files that cannot be read.
  expect('dictionary without reports', await run(BAD_ALONE), 1, ['skipped  - (no --reports file was given)', 'The metric "Refunds" has no written definition'], ['ERROR    report-']);
  expect('JSON dictionary and JSON reports', await run(BAD_JSON), 1, [
    'The metric "Paying accounts": the formula cannot be followed: a { is not closed',
    'The name "MRR" is used by two metrics',
    'The metric "Recurring revenue and new subscriptions" adds or subtracts metrics of different units',
    'The metric "Trial conversion rate" is a ratio and does not state the denominator',
    'The report "Growth review" shows "New subscriptions" under the label "MRR"'
  ], []);
  expect('files that cannot be read', await run(BAD_SYNTAX), 1, [
    'The dictionary file cannot be read as the YAML subset: a value that holds a colon and a space must be in quotes.',
    'examples/bad/metrics-syntax-error.yaml:5',
    'The reports file cannot be read as CSV: the quote that opens the cell was never closed; the file ends inside it.',
    'examples/bad/reports-syntax-error.csv:2'
  ], []);
  // A file that is not there stops the run with no report, and so does an option that cannot be used.
  expect('missing file', await run(['examples/none/metrics.yaml']), 2, ['examples/none/metrics.yaml: does not exist'], [], 'err');
  expect('check that does not exist', await run([...GOOD, '--disable', 'no-such-check']), 2, ['--disable: unknown check no-such-check'], [], 'err');

  // The README shows the head of the report of the bad files, two of its findings and its end, and the head of a good one.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = bad.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l === 'Metrics for each status')).join('\n').trimEnd();
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad files differs from a real run');
  for (const [id, at] of [['name-clash', 'examples/bad/metrics.yaml:47'], ['report-label-clash', 'examples/bad/reports.csv:7']]) {
    const i = lines.findIndex((l) => l.includes(id) && l.includes(at));
    const sample = lines.slice(i, i + 3).join('\n');
    if (i < 0 || !readme.includes(sample)) problems.push(`README: the sample finding of ${id} differs from a real run`);
  }
  const summaryStart = lines.findIndex((l) => l === 'Metrics for each status');
  const summaryTable = lines.slice(summaryStart, lines.findIndex((l) => l === 'Metrics for each owner')).join('\n').trimEnd();
  if (!readme.includes(summaryTable)) problems.push('README: the table of metrics for each status in the sample output differs from a real run');
  const tail = lines.slice(-4).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad files differs from a real run');
  const goodLines = good.out.split('\n');
  const goodHead = goodLines.slice(0, goodLines.findIndex((l) => l === 'Metrics for each status')).join('\n').trimEnd();
  if (!readme.includes(goodHead)) problems.push('README: the head of the sample output of the good files differs from a real run');
  const goodTail = goodLines.slice(-4).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good files differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  const outputs = [
    ['bad.txt', BAD, 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad.json', [...BAD, '--json'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['bad.junit.xml', [...BAD, '--format', 'junit'], 1],
    ['bad-dictionary-only.txt', BAD_ALONE, 1],
    ['bad-json-files.txt', BAD_JSON, 1],
    ['bad-circles.txt', BAD_CIRCLE, 1],
    ['bad-reports-only.txt', BAD_REPORTS, 1],
    ['bad-syntax-error.txt', BAD_SYNTAX, 1],
    ['good.txt', GOOD, 0],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['good.junit.xml', [...GOOD, '--format', 'junit'], 0],
    ['good-json-dictionary.txt', GOOD_JSON, 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.md', ['--list-checks', '--format', 'markdown'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0],
    ['explain-name-clash.txt', EXPLAIN, 0],
    ['explain-name-clash.md', [...EXPLAIN, '--format', 'markdown'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
