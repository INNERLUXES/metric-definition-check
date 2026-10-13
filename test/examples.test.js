import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, checkText, parseJson, parseYaml, readOptions } from '../src/index.js';
import { BAD, BAD_ALONE, BAD_CIRCLE, BAD_JSON, BAD_REPORTS, BAD_SYNTAX, EXPLAIN, GOOD, GOOD_JSON, run } from '../tools/example.mjs';
import { dump } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const ids = (report) => [...new Set(JSON.parse(report.out).findings.map((f) => f.id))].sort();

test('examples: the good files pass every check at every level', async () => {
  for (const args of [GOOD, GOOD_JSON]) {
    for (const level of ['error', 'warning', 'info']) {
      const r = await run([...args, '--fail-on', level]);
      assert.equal(r.code, 0, `${args[0]} at ${level}\n${r.out}`);
      assert.match(r.out, new RegExp(`RESULT: PASS - no finding at or above ${level}\\n$`));
      assert.match(r.out, /\nfindings: 0\n/);
    }
  }
});

test('examples: the good dictionary alone passes, in YAML and in JSON', async () => {
  for (const file of ['examples/good/metrics.yaml', 'examples/good/metrics.json']) {
    const r = await run([file, '--fail-on', 'info']);
    assert.equal(r.code, 0, r.out);
  }
});

test('examples: the good files count what the README says', async () => {
  const shop = JSON.parse((await run([...GOOD, '--json'])).out);
  assert.equal(shop.summary.dictionary.metrics, 14);
  assert.deepEqual(shop.summary.dictionary.byStatus, [{ value: 'active', count: 12 }, { value: 'deprecated', count: 1 }, { value: 'draft', count: 1 }]);
  assert.deepEqual(shop.summary.reports, { reports: 3, rows: 8, metricsShown: 8, metricsOnNoReport: 6, ownerColumn: true });
  assert.equal(shop.input.dictionary.format, 'yaml');
  assert.equal(shop.input.reports.format, 'yaml');
  const saas = JSON.parse((await run([...GOOD_JSON, '--json'])).out);
  assert.equal(saas.summary.dictionary.metrics, 8);
  assert.equal(saas.input.dictionary.format, 'json');
  assert.equal(saas.input.reports.format, 'csv');
});

test('examples: the YAML and the JSON reader read the same dictionary to the same tree', async () => {
  const yaml = dump(parseYaml(await read('examples/good/metrics.yaml')));
  const json = dump(parseJson(JSON.stringify(yaml)));
  assert.deepEqual(JSON.parse(JSON.stringify(json)), JSON.parse(JSON.stringify(yaml)));
  assert.equal(yaml.metrics.length, 14);
  const reports = dump(parseYaml(await read('examples/good/reports.yaml')));
  assert.equal(reports.reports.length, 3);
});

test('examples: the bad dictionary and reports report a mistake of most checks', async () => {
  const r = await run([...BAD, '--json']);
  assert.equal(r.code, 1);
  const report = JSON.parse(r.out);
  assert.equal(report.totals.byLevel.error, 16);
  assert.equal(report.totals.byLevel.warning, 22);
  assert.equal(ids(r).length, 27);
  assert.ok(!ids(r).includes('file-unreadable'));
});

test('examples: every check is shown by at least one bad example', async () => {
  const shown = new Set();
  for (const args of [BAD, BAD_JSON, BAD_CIRCLE, BAD_REPORTS, BAD_SYNTAX]) for (const id of ids(await run([...args, '--json']))) shown.add(id);
  const missing = RULES.map((r) => r.id).filter((id) => !shown.has(id));
  assert.deepEqual(missing, []);
});

test('examples: the circles are one of three metrics and one that names itself', async () => {
  const r = await run([...BAD_CIRCLE, '--json']);
  assert.equal(r.code, 1);
  const report = JSON.parse(r.out);
  assert.deepEqual(report.findings.map((f) => f.id), ['metric-circular', 'metric-circular']);
  assert.equal(report.totals.byLevel.error, 2);
});

test('examples: the reports against the good dictionary are the unknown metric, the clash, the label, the owner and the deprecated metric', async () => {
  const r = await run([...BAD_REPORTS, '--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['report-label-clash', 'report-label-differs', 'report-no-owner', 'report-shows-deprecated', 'report-unknown-metric']);
});

test('examples: the dictionary on its own skips the checks of the reports', async () => {
  const r = await run([...BAD_ALONE, '--json']);
  assert.equal(r.code, 1);
  assert.ok(ids(r).every((id) => !id.startsWith('report-')));
  assert.equal(JSON.parse(r.out).checks.filter((c) => c.status === 'skipped').length, 5);
});

test('examples: the files that cannot be read have one finding each and nothing else ran', async () => {
  const r = await run([...BAD_SYNTAX, '--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['file-unreadable']);
  const report = JSON.parse(r.out);
  assert.deepEqual(report.evaluated, { dictionary: false, reports: false });
  assert.deepEqual(report.findings.map((f) => f.at), ['examples/bad/metrics-syntax-error.yaml:5', 'examples/bad/reports-syntax-error.csv:2']);
  assert.equal(report.checks.filter((c) => c.status === 'not-evaluated').length, 25);
});

test('examples: the options change what is asked', async () => {
  assert.equal((await run([...BAD_ALONE, '--disable', 'metric-duplicate-id,name-clash,metric-no-definition,metric-no-formula,formula-unit-mismatch,formula-unknown-metric,metric-circular,active-uses-inactive,replaced-by-invalid,field-invalid'])).code, 0);
  assert.equal((await run([...BAD_ALONE, '--disable', 'metric-duplicate-id,name-clash,metric-no-definition,metric-no-formula,formula-unit-mismatch,formula-unknown-metric,metric-circular,active-uses-inactive,replaced-by-invalid,field-invalid', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run([...BAD_REPORTS, '--disable', 'report-unknown-metric,report-label-clash'])).code, 0);
  assert.equal((await run([...BAD_REPORTS, '--min-severity', 'error', '--fail-on', 'info'])).code, 1);
});

test('examples: every example file is plain ASCII with LF line ends, and has no year, date, key or real name', async () => {
  for (const dir of ['good', 'bad']) {
    for (const name of await readdir(resolve(root, 'examples', dir))) {
      const text = await read(`examples/${dir}/${name}`);
      assert.doesNotMatch(text, /[^\x00-\x7f]/, name);
      assert.ok(!text.includes('\r'), name);
      assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b|\d{4}-\d{2}-\d{2}/, name);
      assert.doesNotMatch(text, /@|https?:\/\//, name);
    }
  }
});

test('examples: the files in examples/output are what the tool writes', async () => {
  const same = async (name, args) => {
    const r = await run(args);
    assert.equal(await read(`examples/output/${name}`), r.out, name);
  };
  await same('bad.txt', BAD);
  await same('bad.md', [...BAD, '--format', 'markdown']);
  await same('bad.json', [...BAD, '--json']);
  await same('bad.sarif', [...BAD, '--format', 'sarif']);
  await same('bad.junit.xml', [...BAD, '--format', 'junit']);
  await same('bad-dictionary-only.txt', BAD_ALONE);
  await same('bad-json-files.txt', BAD_JSON);
  await same('bad-circles.txt', BAD_CIRCLE);
  await same('bad-reports-only.txt', BAD_REPORTS);
  await same('bad-syntax-error.txt', BAD_SYNTAX);
  await same('good.txt', GOOD);
  await same('good.md', [...GOOD, '--format', 'markdown']);
  await same('good.json', [...GOOD, '--json']);
  await same('good.sarif', [...GOOD, '--format', 'sarif']);
  await same('good.junit.xml', [...GOOD, '--format', 'junit']);
  await same('good-json-dictionary.txt', GOOD_JSON);
  await same('checks.txt', ['--list-checks']);
  await same('checks.md', ['--list-checks', '--format', 'markdown']);
  await same('checks.json', ['--list-checks', '--format', 'json']);
  await same('explain-name-clash.txt', EXPLAIN);
  await same('explain-name-clash.md', [...EXPLAIN, '--format', 'markdown']);
});

test('examples: the report of the bad files is well formed in every format', async () => {
  const sarif = JSON.parse(await read('examples/output/bad.sarif'));
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results.length, 38);
  const junit = await read('examples/output/bad.junit.xml');
  assert.match(junit, /tests="28" failures="\d+" errors="0"/);
  const md = await read('examples/output/bad.md');
  assert.match(md, /^# metric-definition-check: examples\/bad\/metrics\.yaml \\\+ examples\/bad\/reports\.csv\n/);
});

test('examples: the short dictionary in docs/inputs.md passes every check at every level, with its reports', async () => {
  const inputs = await read('docs/inputs.md');
  const code = /## A short dictionary\n\n[^\n]*\n\n```yaml\n([\s\S]*?)\n```/.exec(inputs);
  assert.ok(code, 'the short dictionary');
  const found = checkText(`${code[1]}\n`, null, { options: readOptions() }).findings;
  assert.deepEqual(found, []);
  const reports = /## A short reports file\n\n[^\n]*\n\n```yaml\n([\s\S]*?)\n```/.exec(inputs);
  assert.ok(reports, 'the short reports file');
  assert.deepEqual(checkText(`${code[1]}\n`, `${reports[1]}\n`, { options: readOptions() }).findings, []);
  const table = /## A short reports table\n\n[^\n]*\n\n```\n([\s\S]*?)\n```/.exec(inputs);
  assert.ok(table, 'the short reports table');
  assert.deepEqual(checkText(`${code[1]}\n`, `${table[1]}\n`, { options: readOptions(), reportsAs: 'csv' }).findings, []);
});
