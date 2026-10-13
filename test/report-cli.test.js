import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, USAGE, VERSION, checkFiles, parseArgs, toJson, toJunit, toMarkdown, toSarif, toText } from '../src/index.js';
import { ARGS, GOOD, cli, csvOf, dictText, metric, reportsCsv, reportsText, run, withFiles } from './helpers.js';

const BAD_DICTIONARY = dictText((d) => {
  delete d.metrics[1].definition;
  d.metrics[3].formula = '{revenue} + {orders}';
});
const BAD_REPORTS = reportsText((r) => {
  r.reports[0].metrics.push('nope');
  r.reports[1].metrics[2].label = 'Sales';
});
const BAD = { 'metrics.json': BAD_DICTIONARY, 'reports.json': BAD_REPORTS };
const json = async (files, args) => JSON.parse((await run(files, [...ARGS, ...args, '--json'])).out);

test('cli: a clean run exits 0 with the text report, the summary tables and the result line', async () => {
  const r = await run(GOOD, ARGS);
  assert.equal(r.code, 0);
  assert.equal(r.err, '');
  assert.match(r.out, /^metric-definition-check: metrics\.json \+ reports\.json\n/);
  assert.match(r.out, /\nfindings: 0\n/);
  assert.match(r.out, /\nMetrics for each status\n/);
  assert.match(r.out, /\n {2}active {2,}5\n/);
  assert.match(r.out, /\nMetrics for each owner\n/);
  assert.match(r.out, /\n {2}Finance {2,}3\n/);
  assert.match(r.out, /\nMetrics for each grain\n/);
  assert.match(r.out, /\n {2}day {2,}5\n/);
  assert.match(r.out, /\nRESULT: PASS - no finding at or above error\n$/);
});

test('cli: a run with an error exits 1 and the findings say where', async () => {
  const r = await run(BAD, ARGS);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR {4}metric-no-definition {2,}metrics\.json:\d+/);
  assert.match(r.out, /ERROR {4}formula-unit-mismatch {2,}metrics\.json:\d+/);
  assert.match(r.out, /ERROR {4}report-unknown-metric {2,}reports\.json:\d+/);
  assert.match(r.out, /WARNING {2}report-label-differs {2,}reports\.json:\d+/);
  assert.match(r.out, /\nRESULT: FAIL - 3 findings at or above error \(3 error, 1 warning\)\n$/);
});

test('cli: --fail-on warning fails a run that has only warnings; the default does not', async () => {
  const files = { 'metrics.json': dictText((d) => { delete d.metrics[1].owner; }), 'reports.json': reportsText() };
  assert.equal((await run(files, ARGS)).code, 0);
  assert.equal((await run(files, [...ARGS, '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(files, [...ARGS, '--fail-on', 'error', '--min-severity', 'error'])).code, 0);
  assert.equal((await run(GOOD, [...ARGS, '--fail-on', 'info'])).code, 0);
});

test('cli: --min-severity hides findings from the list and never changes the exit code', async () => {
  const files = { 'metrics.json': dictText((d) => { delete d.metrics[1].owner; }), 'reports.json': reportsText() };
  const shown = await json(files, []);
  assert.equal(shown.findings.length, 1);
  const hidden = await json(files, ['--min-severity', 'error']);
  assert.equal(hidden.findings.length, 0);
  assert.equal(hidden.totals.hidden, 1);
  assert.equal((await run(files, [...ARGS, '--min-severity', 'error', '--fail-on', 'warning'])).code, 1);
  assert.match((await run(files, [...ARGS, '--min-severity', 'error'])).out, /below error not shown/);
});

test('cli: the dictionary alone is checked, and the checks of the reports are skipped with the reason', async () => {
  const out = await run({ 'metrics.json': BAD_DICTIONARY }, ['metrics.json', '--json']);
  const report = JSON.parse(out.out);
  assert.equal(out.code, 1);
  assert.equal(report.input.reports, null);
  assert.equal(report.checks.find((c) => c.id === 'report-unknown-metric').status, 'skipped');
  assert.equal(report.checks.find((c) => c.id === 'report-unknown-metric').detail, 'no --reports file was given');
  assert.equal(report.checks.find((c) => c.id === 'metric-no-definition').status, 'fail');
  assert.equal(report.summary.reports, null);
});

test('cli: a reports table with no owner column skips the owner check with the reason, and one with it passes', async () => {
  const noOwner = { 'metrics.json': dictText(), 'reports.csv': reportsCsv(() => {}, ['report', 'metric', 'label']) };
  const a = JSON.parse((await run(noOwner, ['metrics.json', '--reports', 'reports.csv', '--json'])).out);
  assert.equal(a.checks.find((c) => c.id === 'report-no-owner').detail, 'the reports table has no owner column');
  assert.equal(a.checks.find((c) => c.id === 'report-no-owner').status, 'skipped');
  const b = JSON.parse((await run({ 'metrics.json': dictText(), 'reports.csv': reportsCsv() }, ['metrics.json', '--reports', 'reports.csv', '--json'])).out);
  assert.equal(b.checks.find((c) => c.id === 'report-no-owner').status, 'pass');
  assert.equal(b.input.reports.format, 'csv');
});

test('cli: a reports file is a table when its name ends in .csv or .tsv, and YAML or JSON otherwise', async () => {
  const tsv = reportsCsv().replaceAll(',', '\t');
  const t = JSON.parse((await run({ 'metrics.json': dictText(), 'r.tsv': tsv }, ['metrics.json', '--reports', 'r.tsv', '--json'])).out);
  assert.equal(t.input.reports.format, 'csv');
  assert.equal(t.result.pass, true);
  const asText = JSON.parse((await run({ 'metrics.json': dictText(), 'r.txt': reportsText() }, ['metrics.json', '--reports', 'r.txt', '--json'])).out);
  assert.equal(asText.input.reports.format, 'json');
  const yaml = 'reports:\n  - name: Daily\n    owner: Sales\n    metrics:\n      - orders\n';
  const y = JSON.parse((await run({ 'metrics.json': dictText(), 'r.yaml': yaml }, ['metrics.json', '--reports', 'r.yaml', '--json'])).out);
  assert.equal(y.input.reports.format, 'yaml');
  assert.equal(y.result.pass, true);
});

test('cli: a file that cannot be read marks the checks that need it as not evaluated, and fails the run', async () => {
  const files = { 'metrics.json': '{"metrics": []}', 'reports.json': reportsText() };
  const report = await json(files, []);
  assert.equal(report.evaluated.dictionary, false);
  assert.equal(report.evaluated.reports, true);
  assert.equal(report.checks.find((c) => c.id === 'metric-no-definition').status, 'not-evaluated');
  assert.equal(report.checks.find((c) => c.id === 'report-unknown-metric').status, 'not-evaluated');
  assert.equal(report.checks.find((c) => c.id === 'report-no-owner').status, 'pass');
  assert.equal(report.result.pass, false);
  const text = (await run(files, ARGS)).out;
  assert.match(text, /dictionary: not read: the file could not be followed/);
  const both = await json({ 'metrics.json': '{', 'reports.json': '[' }, []);
  assert.equal(both.checks.find((c) => c.id === 'report-label-clash').status, 'not-evaluated');
  assert.equal(both.result.pass, false);
});

test('cli: with reports that cannot be read, the checks of the reports are not evaluated and the dictionary is still checked', async () => {
  const report = JSON.parse((await run({ 'metrics.json': BAD_DICTIONARY, 'reports.csv': 'report,metric\n"A,x\n' }, ['metrics.json', '--reports', 'reports.csv', '--json'])).out);
  assert.equal(report.evaluated.reports, false);
  assert.equal(report.checks.find((c) => c.id === 'report-label-differs').status, 'not-evaluated');
  assert.equal(report.checks.find((c) => c.id === 'metric-no-definition').status, 'fail');
});

test('cli: a dictionary that is YAML is read as YAML, and JSON as JSON, whatever the file is called', async () => {
  const yaml = 'metrics:\n  - id: a\n    name: A\n    definition: What A counts, in more words than its name.\n    formula: sum(a.b)\n    unit: USD\n    grain: day\n    owner: Ann\n    source: db\n    status: active\n    type: sum\n';
  const out = JSON.parse((await run({ 'dict.txt': yaml }, ['dict.txt', '--json'])).out);
  assert.equal(out.input.dictionary.format, 'yaml');
  assert.equal(out.summary.dictionary.metrics, 1);
  assert.equal(out.result.pass, true);
  const out2 = JSON.parse((await run({ 'dict.txt': dictText() }, ['dict.txt', '--json'])).out);
  assert.equal(out2.input.dictionary.format, 'json');
});

test('cli: --list-checks lists every check in text, markdown and JSON', async () => {
  const text = (await cli(['--list-checks'], '/')).out;
  for (const r of RULES) assert.ok(text.includes(r.id), r.id);
  assert.match(text, /a best practice of this tool; no standard sets it/);
  const md = (await cli(['--list-checks', '--format', 'markdown'], '/')).out;
  assert.match(md, /^# metric-definition-check checks\n/);
  const list = JSON.parse((await cli(['--list-checks', '--json'], '/')).out);
  assert.deepEqual(list.map((x) => x.id), RULES.map((r) => r.id));
  assert.equal((await cli(['--list-checks', '--format', 'sarif'], '/')).code, 2);
  assert.equal((await cli(['--list-checks', '--format', 'junit'], '/')).code, 2);
});

test('cli: --explain says what a check looks at, why it exists, what to change and what it cannot see', async () => {
  for (const r of RULES) {
    const t = await cli(['--explain', r.id], '/');
    assert.equal(t.code, 0);
    assert.ok(t.out.startsWith(`${r.id}\n`));
    for (const part of ['what it looks at: ', 'why it exists: ', 'what to change: ', 'what it cannot see: ', 'a best practice of this tool; no standard sets it']) assert.ok(t.out.includes(part), `${r.id}: ${part}`);
    assert.ok(t.out.includes(r.cannot));
  }
  const md = (await cli(['--explain', 'name-clash', '--format', 'markdown'], '/')).out;
  assert.match(md, /^# name-clash\n/);
  const j = JSON.parse((await cli(['--explain', 'name-clash', '--json'], '/')).out);
  assert.equal(j.id, 'name-clash');
  assert.equal(j.severity, 'error');
});

test('cli: --explain with an id that is misspelt names the nearest check', async () => {
  const r = await cli(['--explain', 'name-clsh'], '/');
  assert.equal(r.code, 2);
  assert.match(r.err, /unknown check name-clsh\. Did you mean name-clash\?/);
  assert.doesNotMatch((await cli(['--explain', 'zzzzzzzzzzzzzzzzzzzzzzzzzz'], '/')).err, /Did you mean/);
});

test('cli: --help and --version exit 0 and write to standard output', async () => {
  const h = await cli(['--help'], '/');
  assert.equal(h.code, 0);
  assert.equal(h.out, USAGE);
  assert.match(USAGE, /--reports/);
  const v = await cli(['--version'], '/');
  assert.equal(v.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal((await cli(['-v'], '/')).out, `${VERSION}\n`);
  assert.equal((await cli(['-h'], '/')).out, USAGE);
});

test('cli: arguments that cannot be used stop the run with exit code 2 and the usage on standard error', async () => {
  const bad = [
    [[], /give the dictionary file/],
    [['a.json', 'b.json'], /give one dictionary file/],
    [['a.json', '--nope'], /unknown argument --nope/],
    [['a.json', '--reports'], /--reports needs a value/],
    [['a.json', '--reports', '--format'], /--reports needs a value/],
    [['a.json', '--reports', 'x.csv', '--reports', 'y.csv'], /--reports was given twice/],
    [['a.json', '--format', 'xml'], /unknown format xml/],
    [['a.json', '--json', '--format', 'markdown'], /ask for two formats/],
    [['a.json', '--fail-on', 'fatal'], /--fail-on: unknown level fatal/],
    [['a.json', '--min-severity', 'fatal'], /--min-severity: unknown level fatal/],
    [['a.json', '--disable', 'nope'], /--disable: unknown check nope/],
    [['a.json', '--disable', 'name-clsh'], /Did you mean name-clash\?/],
    [['a.json', '--min-per-split', '3'], /unknown argument --min-per-split/],
    [['-'], /standard input is not supported/],
    [['a.json', '--reports', '-'], /standard input is not supported/],
    [['https://example.org/metrics.json'], /never fetches a URL/],
    [['a.json', '--reports', 'ftp://example.org/x.csv'], /never fetches a URL/]
  ];
  for (const [argv, pattern] of bad) {
    const r = await cli(argv, '/nonexistent-folder-for-this-test');
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.out, '', argv.join(' '));
    assert.match(r.err, pattern, argv.join(' '));
    assert.match(r.err, /Usage: metric-definition-check/, argv.join(' '));
  }
});

test('parseArgs: the options are read into one object', () => {
  const o = parseArgs(['metrics.yaml', '--reports', 'r.csv', '--format', 'junit', '--disable', 'name-clash,metric-no-unit', '--fail-on', 'warning', '--min-severity', 'warning']);
  assert.deepEqual(o.paths, ['metrics.yaml']);
  assert.equal(o.reports, 'r.csv');
  assert.equal(o.format, 'junit');
  assert.equal(o.failOn, 'warning');
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--version']).version, true);
  assert.equal(parseArgs(['metrics.yaml', '--json']).format, 'json');
  assert.equal(parseArgs(['metrics.yaml']).format, 'text');
});

test('cli: a missing file, a folder and text that is not text stop the run with exit code 2 and say which file', async () => {
  const missing = await cli(['none.json'], '/nonexistent-folder-for-this-test');
  assert.equal(missing.code, 2);
  const files = { 'metrics.json': dictText(), 'dir/x.txt': 'x', 'bin.json': Buffer.from([0x7b, 0, 0x7d]) };
  const a = await run(files, ['metrics.json', '--reports', 'nope.csv']);
  assert.equal(a.code, 2);
  assert.match(a.err, /nope\.csv: does not exist/);
  assert.match(a.err, /no result, the input has a problem/);
  const b = await run(files, ['dir']);
  assert.match(b.err, /dir: is a folder/);
  const c = await run(files, ['bin.json']);
  assert.match(c.err, /bin\.json: holds a null byte/);
  const d = await run(files, ['none1.json', '--reports', 'none2.csv']);
  assert.match(d.err, /the input has problems/);
  assert.match(d.err, /none1\.json: does not exist/);
  assert.match(d.err, /none2\.csv: does not exist/);
});

test('cli: the dictionary and the reports file cannot be the same file', async () => {
  const r = await run({ 'both.json': dictText() }, ['both.json', '--reports', 'both.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /the dictionary file and the reports file are the same file/);
});

test('cli: UTF-16 with a byte order mark, UTF-8 with one, CRLF and CR give the same findings as plain UTF-8 with LF', async () => {
  const dict = BAD_DICTIONARY;
  const reports = BAD_REPORTS;
  const base = (await json({ 'metrics.json': dict, 'reports.json': reports }, [])).findings.map((f) => [f.id, f.message]);
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const bom = (text) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
  const variants = {
    utf16: { 'metrics.json': utf16(dict), 'reports.json': utf16(reports) },
    bom: { 'metrics.json': bom(dict), 'reports.json': bom(reports) },
    crlf: { 'metrics.json': dict.replaceAll('\n', '\r\n'), 'reports.json': reports.replaceAll('\n', '\r\n') },
    cr: { 'metrics.json': dict.replaceAll('\n', '\r'), 'reports.json': reports.replaceAll('\n', '\r') }
  };
  for (const [name, files] of Object.entries(variants)) {
    const found = (await json(files, [])).findings.map((f) => [f.id, f.message]);
    assert.deepEqual(found, base, name);
  }
});

test('report: every format of a run with findings is well formed and carries the same checks', async () => {
  const text = (await run(BAD, ARGS)).out;
  const md = (await run(BAD, [...ARGS, '--format', 'markdown'])).out;
  const sarif = JSON.parse((await run(BAD, [...ARGS, '--format', 'sarif'])).out);
  const junit = (await run(BAD, [...ARGS, '--format', 'junit'])).out;
  const report = await json(BAD, []);
  for (const r of RULES) {
    assert.ok(text.includes(r.id));
    assert.ok(md.includes(r.id));
    assert.ok(junit.includes(`name="${r.id}"`));
  }
  assert.equal(report.checks.length, RULES.length);
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].tool.driver.rules.length, RULES.length);
  assert.equal(sarif.runs[0].results.length, report.findings.length);
  for (const res of sarif.runs[0].results) {
    assert.ok(res.locations[0].physicalLocation.region.startLine >= 1);
    assert.ok(['metrics.json', 'reports.json'].includes(res.locations[0].physicalLocation.artifactLocation.uri));
    assert.equal(sarif.runs[0].artifacts[res.locations[0].physicalLocation.artifactLocation.index].location.uri, res.locations[0].physicalLocation.artifactLocation.uri);
  }
  assert.match(junit, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<testsuites name="metric-definition-check" tests="28" failures="4" errors="0" time="0">/);
  assert.match(junit, /<failure type="report-unknown-metric"/);
  assert.match(md, /\| error \| report-unknown-metric \| reports\.json:\d+ \|/);
});

test('report: the JUnit report has a skipped case for a check that did not run and an error for one that could not', async () => {
  const skipped = (await run({ 'metrics.json': dictText() }, ['metrics.json', '--format', 'junit'])).out;
  assert.match(skipped, /<testcase classname="metric-dictionary" name="report-unknown-metric" time="0">\n {6}<skipped message="no --reports file was given"\/>/);
  const notRead = (await run({ 'metrics.json': '{', 'reports.json': reportsText() }, [...ARGS, '--format', 'junit'])).out;
  assert.match(notRead, /<error type="not-evaluated" message="the dictionary file could not be read">/);
});

test('report: text from the input is cleaned in every format: control, direction and markup characters', async () => {
  const name = `we${String.fromCharCode(0)}ird${String.fromCharCode(0x202e)}<b>&"'`;
  const files = { 'metrics.json': dictText((d) => { d.metrics[1].name = name; delete d.metrics[1].definition; }), 'reports.json': reportsText() };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const r = await run(files, [...ARGS, '--format', format]);
    assert.ok(!r.out.includes(String.fromCharCode(0)), format);
    assert.ok(!r.out.includes(String.fromCharCode(0x202e)), format);
  }
  const md = (await run(files, [...ARGS, '--format', 'markdown'])).out;
  assert.ok(!md.includes('<b>'));
  const xml = (await run(files, [...ARGS, '--format', 'junit'])).out;
  assert.ok(!xml.includes('<b>'));
  assert.match(xml, /&lt;b&gt;&amp;&quot;&apos;/);
  JSON.parse((await run(files, [...ARGS, '--format', 'sarif'])).out);
});

test('report: the unusable characters of XML 1.0 become a question mark in the JUnit report', async () => {
  const files = { 'metrics.json': dictText((d) => { d.metrics[1].name = `a${String.fromCharCode(0xd800)}b${String.fromCharCode(0xfffe)}c`; delete d.metrics[1].definition; }), 'reports.json': reportsText() };
  const xml = (await run(files, [...ARGS, '--format', 'junit'])).out;
  assert.ok(!xml.includes(String.fromCharCode(0xd800)));
  assert.ok(!xml.includes(String.fromCharCode(0xfffe)));
});

test('report: the functions write what the command line writes', async () => {
  await withFiles(BAD, async (dir) => {
    const report = await checkFiles({ dictionaryPath: 'metrics.json', reportsPath: 'reports.json', version: '1.0.0', base: dir });
    for (const f of [toText, toMarkdown, toJson, toSarif, toJunit]) assert.equal(typeof f(report), 'string');
    assert.equal(report.tool, 'metric-definition-check');
    assert.equal(report.result.pass, false);
    assert.equal(toText(report), (await cli(ARGS, dir)).out);
  });
});

test('report: the notice and the words of the result never claim more than the tool knows', async () => {
  const r = JSON.parse((await run(GOOD, [...ARGS, '--json'])).out);
  assert.match(r.notice, /never runs a formula/);
  assert.match(r.notice, /it is not a statement that the definitions are right, that the numbers are correct or that the reports show what they say/);
  assert.equal(r.result.text, 'PASS - no finding at or above error');
});

test('report: findings are sorted by level, then kind, then place', async () => {
  const report = await json(BAD, []);
  const order = { error: 0, warning: 1, info: 2 };
  for (let i = 1; i < report.findings.length; i += 1) assert.ok(order[report.findings[i - 1].severity] <= order[report.findings[i].severity]);
  assert.deepEqual(report.findings.map((f) => f.id), ['metric-no-definition', 'formula-unit-mismatch', 'report-unknown-metric', 'report-label-differs']);
});

test('report: the summary counts the metrics by status, owner and grain, and says what the reports show', async () => {
  const report = JSON.parse((await run(GOOD, [...ARGS, '--json'])).out);
  assert.deepEqual(report.summary.dictionary.byStatus, [{ value: 'active', count: 5 }]);
  assert.deepEqual(report.summary.dictionary.byOwner, [{ value: 'Finance', count: 3 }, { value: 'Sales', count: 2 }]);
  assert.deepEqual(report.summary.dictionary.byGrain, [{ value: 'day', count: 5 }]);
  assert.deepEqual(report.summary.reports, { reports: 2, rows: 6, metricsShown: 5, metricsOnNoReport: 0, ownerColumn: true });
  const mixed = JSON.parse((await run({ 'metrics.json': dictText((d) => { delete d.metrics[0].owner; d.metrics[1].status = 'DRAFT'; d.metrics[2].owner = 'finance'; delete d.metrics[2].grain; }) }, ['metrics.json', '--json'])).out);
  assert.deepEqual(mixed.summary.dictionary.byOwner, [{ value: 'Finance', count: 3 }, { value: '(none)', count: 1 }, { value: 'Sales', count: 1 }]);
  assert.ok(mixed.summary.dictionary.byStatus.some((r) => r.value === 'draft'));
  assert.ok(mixed.summary.dictionary.byGrain.some((r) => r.value === '(none)'));
});

test('report: more than a thousand findings of one check are counted and the first thousand are listed', async () => {
  const d = JSON.parse(dictText());
  for (let i = 0; i < 1100; i += 1) d.metrics.push(metric(`extra${i}`, `Extra ${i}`, { owner: undefined }));
  const report = JSON.parse((await run({ 'metrics.json': JSON.stringify(d) }, ['metrics.json', '--json'])).out);
  assert.equal(report.findings.filter((f) => f.id === 'metric-no-owner').length, 1000);
  assert.ok(report.notes.some((n) => /100 more findings of metric-no-owner are not listed/.test(n)));
  assert.equal(report.rules.find((x) => x.id === 'metric-no-owner').findings, 1100);
  assert.equal(report.checks.find((x) => x.id === 'metric-no-owner').findings, 1100);
});

test('report: a reports table made by csvOf reads like the same reports as JSON', async () => {
  const a = JSON.parse((await run({ 'metrics.json': dictText(), 'reports.csv': reportsCsv() }, ['metrics.json', '--reports', 'reports.csv', '--json'])).out);
  const b = JSON.parse((await run(GOOD, [...ARGS, '--json'])).out);
  assert.deepEqual(a.summary, b.summary);
  assert.equal(csvOf([{ report: 'a,b', owner: 'x', metric: 'm', label: 'say "hi"' }]), 'report,owner,metric,label\n"a,b",x,m,"say ""hi"""\n');
});
