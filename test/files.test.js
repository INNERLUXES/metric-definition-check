import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, InputError, decode, displayPath, locateInput, main, readInputText } from '../src/index.js';
import { ARGS, GOOD, cli, dictText, reportsCsv, reportsText, run, withFiles } from './helpers.js';

test('files: a folder, and a file that is not there, are refused with the path as given', async () => {
  await withFiles({ 'dir/x.txt': 'x' }, async (dir) => {
    await assert.rejects(locateInput('dir', dir), (e) => e instanceof InputError && /dir: is a folder/.test(e.message));
    await assert.rejects(locateInput('nope.json', dir), (e) => e instanceof InputError && /nope\.json: does not exist/.test(e.message));
    await assert.rejects(locateInput('dir/x.txt/more', dir), (e) => e instanceof InputError && /does not exist/.test(e.message));
  });
});

test('files: a symbolic link is refused', { skip: process.platform === 'win32' ? 'creating a link needs a privilege on Windows' : false }, async () => {
  await withFiles(GOOD, async (dir) => {
    await symlink(resolve(dir, 'metrics.json'), resolve(dir, 'link.json'));
    await assert.rejects(locateInput('link.json', dir), (e) => e instanceof InputError && /symbolic link/.test(e.message));
    const r = await cli(['link.json'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /symbolic link/);
    const l = await cli(['metrics.json', '--reports', 'link.json'], dir);
    assert.equal(l.code, 2);
  });
});

test('files: a device is refused', { skip: process.platform === 'win32' ? 'there is no /dev/null on Windows' : false }, async () => {
  const r = await cli(['/dev/null'], '/');
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('files: a file past the size limit is refused whole, not read in part', async () => {
  await withFiles({ 'big.json': 'x'.repeat(50) }, async (dir) => {
    await assert.rejects(readInputText(resolve(dir, 'big.json'), dir, { maxBytes: 10 }), (e) => e instanceof InputError && /larger than 10 bytes/.test(e.message));
    let err = '';
    const code = await main(['big.json'], { out: () => {}, err: (t) => { err += t; } }, { maxBytes: 10 }, dir);
    assert.equal(code, 2);
    assert.match(err, /larger than 10 bytes/);
  });
  assert.ok(FILE_LIMITS.maxBytes >= 16 * 1024 * 1024);
});

test('files: both files are checked for problems, and a run that cannot read either says so for both', async () => {
  const r = await run({ 'dir/x.txt': 'x' }, ['dir', '--reports', 'gone.csv']);
  assert.equal(r.code, 2);
  assert.match(r.err, /the input has problems/);
  assert.match(r.err, /dir: is a folder/);
  assert.match(r.err, /gone\.csv: does not exist/);
});

test('files: a null byte means it is not a text file', async () => {
  const r = await run({ 'metrics.json': Buffer.from('{"a":\0 1}') }, ['metrics.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /holds a null byte/);
  const t = await run({ 'metrics.json': dictText(), 'reports.csv': Buffer.from('report,metric\0') }, ['metrics.json', '--reports', 'reports.csv']);
  assert.equal(t.code, 2);
  assert.match(t.err, /reports\.csv: holds a null byte/);
});

test('files: invalid UTF-8 is refused', async () => {
  const r = await run({ 'metrics.json': Buffer.from([0x7b, 0xc3, 0x28, 0x7d]) }, ['metrics.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /not valid UTF-8/);
});

test('files: a byte order mark is dropped; UTF-8 and UTF-16 read the same dictionary', async () => {
  const text = dictText();
  const plain = JSON.parse((await run({ 'metrics.json': text }, ['metrics.json', '--json'])).out);
  const bom = JSON.parse((await run({ 'metrics.json': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]) }, ['metrics.json', '--json'])).out);
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const be = Buffer.from(le);
  be.subarray(2).swap16();
  be[0] = 0xfe;
  be[1] = 0xff;
  const utf16le = JSON.parse((await run({ 'metrics.json': le }, ['metrics.json', '--json'])).out);
  const utf16be = JSON.parse((await run({ 'metrics.json': be }, ['metrics.json', '--json'])).out);
  for (const r of [bom, utf16le, utf16be]) {
    assert.deepEqual(r.findings, plain.findings);
    assert.equal(r.summary.dictionary.metrics, 5);
  }
});

test('files: UTF-16 with an odd number of bytes is refused, and so is UTF-16 that is not valid', () => {
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x41])), /odd number of bytes/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x00, 0xd8])), /not valid UTF-16/);
  assert.equal(decode(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
});

test('files: LF, CRLF and CR line ends of a YAML dictionary give the same findings', async () => {
  const yaml = 'metrics:\n  - id: a\n    name: A\n    definition: What A counts, said in more words.\n    status: active\n  - id: b\n    name: B\n    unit: USD\n';
  const lf = JSON.parse((await run({ 'f.yaml': yaml }, ['f.yaml', '--json'])).out);
  const crlf = JSON.parse((await run({ 'f.yaml': yaml.replaceAll('\n', '\r\n') }, ['f.yaml', '--json'])).out);
  const cr = JSON.parse((await run({ 'f.yaml': yaml.replaceAll('\n', '\r') }, ['f.yaml', '--json'])).out);
  assert.deepEqual(crlf.findings, lf.findings);
  assert.deepEqual(cr.findings, lf.findings);
  assert.ok(lf.findings.length > 0);
});

test('files: LF, CRLF and CR line ends of a reports table give the same findings', async () => {
  const csv = reportsCsv((rows) => { rows[0].metric = 'nope'; rows[1].owner = ''; });
  const lf = JSON.parse((await run({ 'metrics.json': dictText(), 'r.csv': csv }, ['metrics.json', '--reports', 'r.csv', '--json'])).out);
  const crlf = JSON.parse((await run({ 'metrics.json': dictText(), 'r.csv': csv.replaceAll('\n', '\r\n') }, ['metrics.json', '--reports', 'r.csv', '--json'])).out);
  const cr = JSON.parse((await run({ 'metrics.json': dictText(), 'r.csv': csv.replaceAll('\n', '\r') }, ['metrics.json', '--reports', 'r.csv', '--json'])).out);
  assert.deepEqual(crlf.findings, lf.findings);
  assert.deepEqual(cr.findings, lf.findings);
  assert.deepEqual(lf.findings.map((f) => f.id), ['report-unknown-metric']);
});

test('files: the path in a report is relative to the folder, with forward slashes', async () => {
  const r = await run({ 'dict/sub/metrics.json': dictText((d) => { delete d.metrics[0].definition; }) }, ['dict/sub/metrics.json']);
  assert.match(r.out, /dict\/sub\/metrics\.json:\d+/);
  assert.equal(displayPath(resolve('/tmp/x/a/b.json'), resolve('/tmp/x')), 'a/b.json');
});

test('files: a path outside the folder is shown whole', () => {
  const shown = displayPath(resolve('/tmp/other/a.json'), resolve('/tmp/x'));
  assert.ok(shown.endsWith('other/a.json'));
});

test('files: nothing is written: the tool leaves the folder as it found it', async () => {
  await withFiles({ ...GOOD, 'sub/.keep': '' }, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    await cli([...ARGS, '--format', 'junit'], dir);
    await mkdir(resolve(dir, 'again'), { recursive: true });
    await writeFile(resolve(dir, 'again/a.txt'), 'a');
    const after = (await readdir(dir, { recursive: true })).sort().filter((f) => !f.startsWith('again'));
    assert.deepEqual(after, before);
  });
});

test('files: a reports file given as the dictionary and the other way round is not read as the other kind', async () => {
  const r = await run({ 'metrics.json': reportsText(), 'reports.json': dictText() }, ARGS);
  assert.equal(r.code, 1);
  assert.match(r.out, /file-unreadable/);
});
