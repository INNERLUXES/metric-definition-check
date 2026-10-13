import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS, DICTIONARY_KEYS, METRIC_KEYS, NOT_A, NOTICE, REPORTS_KEYS, REPORT_KEYS, RULES, STATUSES, TYPES, checkText, readOptions } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const DECISIONS = [
  'docs/decisions/0001-read-the-dictionary-and-the-reports-and-never-touch-the-data.md',
  'docs/decisions/0002-read-yaml-json-and-csv-with-readers-of-our-own.md',
  'docs/decisions/0003-read-the-files-on-disk-and-contact-nothing.md',
  'docs/decisions/0004-check-wording-and-structure-and-never-claim-the-numbers-are-right.md',
  'docs/decisions/0005-compare-the-declared-units-and-grains-and-never-run-a-formula.md'
];
// The pattern of tools/check.mjs, kept unchanged: a word of four digits that starts with 19 or 20 reads like a year, unless it
// is the number of a standard after EIP or ERC.
const YEAR = /(?<!(?:EIP|ERC)[- ]?)\b(?:19|20)\d{2}\b/i;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const norm = (t) => t.replace(/\s+/g, ' ');

// Every file below a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

// Every file of the repository that is committed.
async function allFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel || '.'), { withFileTypes: true })) {
      if (['.git', 'coverage'].includes(e.name) || (!rel && ['dist', 'node_modules'].includes(e.name))) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('');
  return out.sort();
}

const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...(await filesOf('docs')).filter((f) => f.endsWith('.md'))];

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the repository', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'metric-definition-check');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/metric-definition-check.git');
  assert.deepEqual(pkg.bin, { 'metric-definition-check': 'bin/metric-definition-check.js' });
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.scripts.test, 'node --test "test/*.test.js"');
  assert.equal(pkg.scripts.check, 'node tools/check.mjs');
  assert.equal(pkg.scripts.example, 'node tools/example.mjs');
  assert.ok(pkg.scripts['test:coverage'].includes('--experimental-test-coverage'));
  assert.deepEqual(pkg.files, ['bin', 'src', 'docs', 'examples', 'README.md', 'LICENSE']);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.equal(lock.packages[''].dependencies, undefined);
  assert.equal(Object.keys(lock.packages).length, 1);
  assert.equal(lock.name, 'metric-definition-check');
});

test('bin: a script with a shebang that runs main and sets the exit code', async () => {
  const bin = await read('bin/metric-definition-check.js');
  assert.ok(bin.startsWith('#!/usr/bin/env node\n'));
  assert.match(bin, /process\.exitCode = await main\(process\.argv\.slice\(2\)\);/);
});

test('every file is made of text this project allows: ASCII source, LF line ends, no control byte', async () => {
  for (const file of await allFiles()) {
    if (file.startsWith('examples/output/') || file === 'package-lock.json') continue;
    const text = await read(file);
    assert.doesNotMatch(text, /[\x01-\x08]/, file);
    if (/\.(?:js|mjs|json|yml|md)$/.test(file) || file === 'LICENSE') {
      assert.doesNotMatch(text, /[^\x00-\x7f]/, `${file} holds a character that is not ASCII`);
      assert.ok(!text.includes('\r'), `${file} holds a carriage return`);
    }
  }
});

test('README: it says plainly that the tool never connects to data or runs a formula, is not a data quality tool or an audit, and checks wording, before the quick start', async () => {
  const readme = await read('README.md');
  const head = norm(readme.slice(0, readme.indexOf('## Quick start')));
  for (const part of ['never connects to data', 'never runs a formula', 'wording and the structure', 'not whether the numbers are right', 'not a data quality tool', 'not an audit', 'a best practice of this tool', 'contacts nothing over the network']) {
    assert.ok(head.includes(part), part);
  }
});

test('README: what it checks lists every check, how to run it with npx or node, the options, real example output and the limits', async () => {
  const readme = await read('README.md');
  for (const r of RULES) assert.ok(readme.includes(`| ${r.id} | ${r.severity} |`), r.id);
  for (const part of ['npx --yes github:INNERLUXES/metric-definition-check', 'node bin/metric-definition-check.js', '--reports', '--disable', '--fail-on', '--min-severity', '--format', '--explain', '--list-checks', '## Exit codes', '## Limits', '## What is not checked', '## License']) {
    assert.ok(readme.includes(part), part);
  }
  assert.ok(!readme.includes('{{'), 'a placeholder is left in the README');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /npm test\n```\n\n```\n([\s\S]*?)\n```/.exec(readme);
  assert.ok(block, 'the test block');
  const n = Object.fromEntries([...block[1].matchAll(/^(tests|pass|fail|skipped) (\d+)$/gm)].map((m) => [m[1], Number(m[2])]));
  assert.equal(n.tests, n.pass + n.fail + n.skipped);
  assert.equal(n.fail, 0);
  assert.ok(n.tests >= 150);
});

test('README: every relative link goes to a file of the repository', async () => {
  const files = new Set(await allFiles());
  for (const doc of await docFiles()) {
    const text = await read(doc);
    for (const m of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
      if (/^[a-z]+:/.test(m[1])) continue;
      const dir = doc.includes('/') ? doc.slice(0, doc.lastIndexOf('/') + 1) : '';
      const target = resolve('/', dir, m[1]).replaceAll('\\', '/').replace(/^[A-Za-z]:/, '').slice(1);
      assert.ok(files.has(target), `${doc} links to ${m[1]}`);
    }
  }
});

test('README and documents: they never claim that the numbers, the definitions or the dictionary are right, approved or audited', async () => {
  for (const file of await docFiles()) {
    const text = norm(await read(file));
    assert.doesNotMatch(text, /\b(?:we|I) recommend\b/i, file);
    assert.doesNotMatch(text, /(?<!not )\b(?:certifies|certified|guarantees?)\b/i, file);
    assert.doesNotMatch(text, /(?<!not )\b(?:ensures?|proves?|confirms?) (?:that )?(?:the )?(?:dictionary|definitions?|numbers?|metrics?|reports?|data)\b/i, file);
    assert.doesNotMatch(text, /\b(?:is|are) (?:fully )?(?:correct|right|accurate|audited|approved|verified|validated) (?:and|by|with)\b/i, file);
    assert.doesNotMatch(text, /\b(?:single source of truth|source of truth)\b/i, file);
  }
  const everything = [NOTICE, NOT_A, ...RULES.map((r) => `${r.summary} ${r.fix} ${r.own} ${r.cannot}`)].join(' ');
  assert.doesNotMatch(everything, /\b(?:is|are) (?:safe|secure|trusted|approved|verified|accepted|the best|audited)\b/i);
});

test('docs/context.md, docs/method.md and docs/limits.md: the honest note that it checks wording and structure, not the numbers, and that it is neither a data quality tool nor an audit', async () => {
  for (const file of ['docs/context.md', 'docs/method.md', 'docs/limits.md']) {
    const text = norm(await read(file));
    assert.ok(/data quality/i.test(text), `${file}: data quality`);
    assert.ok(/not an audit|an audit/i.test(text), `${file}: audit`);
    assert.ok(/never (?:connects|sees|runs|reads)/i.test(text) || /does not connect/i.test(text) || /never see/i.test(text), `${file}: no data`);
  }
  for (const file of ['README.md', 'docs/limits.md']) {
    const text = norm(await read(file)).toLowerCase();
    assert.ok(text.includes('not a data quality tool'), file);
    assert.ok(text.includes('not an audit'), file);
  }
});

test('docs/inputs.md: the short dictionary passes every check at every level', async () => {
  const inputs = await read('docs/inputs.md');
  const code = /## A short dictionary\n\n[^\n]*\n\n```yaml\n([\s\S]*?)\n```/.exec(inputs);
  assert.ok(code, 'the short dictionary');
  const found = checkText(`${code[1]}\n`, null, { options: readOptions() }).findings;
  assert.deepEqual(found, []);
});

test('docs/inputs.md: every key of the dictionary, of a metric, of the reports file and of a report, every column, status and type is described', async () => {
  const inputs = await read('docs/inputs.md');
  for (const key of [...DICTIONARY_KEYS, ...METRIC_KEYS, ...REPORTS_KEYS, ...REPORT_KEYS]) assert.ok(inputs.includes(`\`${key}\``), key);
  for (const names of Object.values(COLUMNS)) assert.ok(inputs.includes(`\`${names[0]}\``), names[0]);
  for (const name of [...STATUSES, ...TYPES]) assert.ok(inputs.includes(`\`${name}\``), name);
});

test('docs: every check has its id in the method, and each decision exists with a status', async () => {
  const method = await read('docs/method.md');
  for (const r of RULES) assert.ok(method.includes(r.id), r.id);
  const files = await filesOf('docs/decisions');
  assert.deepEqual(files, [...DECISIONS].sort());
  for (const d of DECISIONS) {
    const text = await read(d);
    assert.match(text, /^# \d+\. /);
    assert.match(text, /\n## Status\n\nAccepted\n/);
    for (const part of ['## Context', '## Decision', '## Consequences']) assert.ok(text.includes(part), `${d} ${part}`);
  }
});

test('README and documents: no number that reads like a year and no date in words or in digits', async () => {
  const months = /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b\d{1,2}\s+(?:January|February|March|April|June|July|August|September|October|November|December)\b/;
  for (const file of await allFiles()) {
    if (file === 'package-lock.json') continue;
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, DATE, file);
    assert.doesNotMatch(text, months, file);
  }
});

test('the year pattern passes over versions, seconds, counts and identifiers and still catches a year', () => {
  for (const ok of ['1.0.0', 'Node 22', 'SARIF 2.1.0', '200,000 metrics', '16777216 bytes', '500000 rows', '4,000 classes', 'NIST SP 800-218', '20000 characters', '1,000 parts']) assert.doesNotMatch(ok, YEAR, ok);
  for (const bad of [`in ${19}99`, `built ${20}31`, `${20}${24}`, `since ${20}00.`]) assert.match(bad, YEAR, bad);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of await docFiles()) assert.doesNotMatch(await read(file), /[^\x00-\x7f]/, file);
});

test('every file: none of the words this project keeps out of its prose, and no name of a tool that wrote it', async () => {
  const written = new RegExp(['gene' + 'rated', 'cla' + 'ude', 'anthro' + 'pic', 'ses' + 'sion', 'co-' + 'authored', 'ope' + 'nai', 'chat' + 'gpt'].join('|'), 'i');
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs') continue;
    assert.doesNotMatch(await read(file), written, file);
  }
});

test('no file holds a string shaped like a token or a private key', async () => {
  const shapes = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /(?:api[_-]?key|client[_-]?secret|password)\s*[:=]\s*['"][^'"\s]{12,}['"]/i];
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs') continue;
    const text = await read(file);
    for (const s of shapes) assert.doesNotMatch(text, s, file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n\nPermission is hereby granted'));
  assert.doesNotMatch(license, /\d{4}/);
});

test('SECURITY.md: how to report privately, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /private vulnerability reporting/);
  assert.match(text, /never connects to data/);
  assert.doesNotMatch(text, /within\s+\d|business days|within a (?:day|week)|\d+\s*(?:hours|days)\b|we will|we guarantee|guaranteed|respond within|reply within/i);
});

test('workflows: every action is pinned to a full commit with a version comment, the CI runs three systems, two Node versions and coverage, and the SSDF gate is there and pinned', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*(?:- )?uses: (\S+)(.*)$/gm)].map((m) => [m[1], m[2]]);
    assert.ok(uses.length > 0, name);
    for (const [action, comment] of uses) {
      assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/, `${name}: ${action}`);
      assert.match(comment, /^ # v\d+\.\d+\.\d+$/, `${name}: ${action}${comment}`);
    }
    assert.doesNotMatch(text, /defect-library|vision-qc/i, name);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /run: npm run test:coverage/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  assert.match(ci, /ref: [0-9a-f]{40} # v\d+\.\d+\.\d+/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('codeql: JavaScript only, with the security-extended queries, and the examples left out', async () => {
  const codeql = await read('.github/workflows/codeql.yml');
  assert.match(codeql, /languages: javascript-typescript/);
  assert.match(codeql, /github\/codeql-action\/init@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.doesNotMatch(codeql, /autobuild/i);
  assert.match(codeql, /security-extended/);
  assert.match(codeql, /paths-ignore:\n\s+- examples\n/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^examples\/\*\* linguist-documentation$/m);
  assert.match(attributes, /^examples\/output\/\*\* -text$/m);
});

test('release workflow: the SSDF gate, then a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(release, /ref: [0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.ok(release.indexOf('ssdf-repo-check.js') < release.indexOf('npm pack'), 'the gate runs before the package is made');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/metric-definition-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CODEOWNERS for every module, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  const owners = await read('.github/CODEOWNERS');
  assert.match(owners, /^\* @innerluxesdev$/m);
  for (const f of await readdir(resolve(root, 'src'))) assert.ok(owners.includes(`/src/${f} @innerluxesdev`), f);
  assert.match(await read('.github/pull_request_template.md'), /Conventional Commits/);
  assert.match(await read('.gitattributes'), /^\* text=auto eol=lf$/m);
  const ignore = await read('.gitignore');
  for (const part of ['/node_modules/', '.env', '*.pem', '*.key']) assert.ok(ignore.includes(part), part);
});

test('docs/secure-defaults.md is long enough for the SSDF gate, and every document the README links to exists', async () => {
  const text = await read('docs/secure-defaults.md');
  assert.ok(text.split('\n').length > 60);
  for (const practice of ['PO.1', 'PO.3', 'PS.1', 'PS.2', 'PW.1', 'PW.4', 'PW.5', 'PW.8', 'PW.9', 'RV.1', 'RV.2']) assert.ok(text.includes(practice), practice);
  const files = await filesOf('docs');
  for (const doc of ['context.md', 'inputs.md', 'limits.md', 'method.md', 'secure-defaults.md', 'threat-model.md']) assert.ok(files.includes(`docs/${doc}`), doc);
});

test('src never reaches the network, runs a program or reads a clock, and builds no regular expression from input', async () => {
  const banned = [/node:(?:net|http|https|http2|dgram|tls|dns|child_process|worker_threads|vm|cluster)/, /\bfetch\(/, /\bXMLHttpRequest\b/, /\beval\(/, /new Function\(/, /\bDate\b/, /Date\.now/, /Math\.random/, /process\.env/, /Intl\./, /parseFloat\(/, /performance\.now/, /hrtime/, /getTimezoneOffset/];
  for (const file of await filesOf('src')) {
    const text = await read(file);
    for (const b of banned) assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, ''), b, `${file}: ${b}`);
    if (file !== 'src/text.js') assert.ok(!/new RegExp/.test(text), `${file} builds a regular expression`);
  }
  assert.ok((await read('src/size.js')).includes('toLocaleString'), 'grouped() fixes the locale in the call');
});

test('src does not connect to data: no module of src names a database driver, a socket, a browser or a query', async () => {
  for (const file of await filesOf('src')) {
    const text = (await read(file)).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(text, /WebSocket|puppeteer|playwright|selenium|JSDOM|import\(|createReadStream|sqlite|postgres|mysql|mongodb|\bpg\b|\.query\(|\.execute\(/i, file);
  }
});

test('src is only written to standard output and standard error, never to the disk', async () => {
  for (const file of await filesOf('src')) {
    const text = await read(file);
    assert.doesNotMatch(text, /writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync|rename\(/, file);
  }
});

test('no function of src calls itself: the readers, the graph walks and the checks work through loops, stacks and maps', async () => {
  for (const file of await filesOf('src')) {
    const text = await read(file);
    for (const m of text.matchAll(/^(?:export )?(?:async )?function\*? ([A-Za-z0-9_$]+)\(/gm)) {
      const start = m.index + m[0].length;
      const next = text.slice(start).search(/^(?:export )?(?:async )?(?:function|const|class) /m);
      const body = next < 0 ? text.slice(start) : text.slice(start, start + next);
      assert.ok(!new RegExp(`(?<![A-Za-z0-9_$.])${m[1]}\\(`).test(body), `${file}: ${m[1]} calls itself`);
    }
  }
});

test('src does not use a floating point number for a count', async () => {
  for (const file of await filesOf('src')) {
    const text = (await read(file)).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(text, /parseFloat|Number\.parseFloat|toFixed|Math\.(?:round|floor|ceil)\(/, file);
  }
});

test('a guarded test never asserts a line of its own, and no test asserts the hash or version of an action', async () => {
  for (const file of (await filesOf('test')).filter((f) => f.endsWith('.test.js'))) {
    const text = await read(file);
    assert.doesNotMatch(text, /uses: [^\n]*@[0-9a-f]{40}[^\n]*assert|assert[^\n]*[0-9a-f]{40}/, file);
  }
});

test('every test file builds its paths with resolve(), and no test writes a backslash, a bar or a quote into a file name', async () => {
  for (const file of (await filesOf('test')).filter((f) => f.endsWith('.test.js') || f.endsWith('helpers.js'))) {
    const text = await read(file);
    assert.doesNotMatch(text, /(?:writeFile|mkdir)\([^)]*['"`][^'"`]*[\\|*?"][^'"`]*['"`]/, file);
  }
});

test('tools/check.mjs and tools/example.mjs exist, and the year check and the list of plain words are those of the sibling tools', async () => {
  const check = await read('tools/check.mjs');
  assert.ok(check.includes('const YEAR = /(?<!(?:EIP|ERC)[- ]?)\\b(?:19|20)\\d{2}\\b/i;'));
  assert.ok(check.includes("['har', 'ness'], ['del', 've'], ['lever', 'age']"));
  const example = await read('tools/example.mjs');
  assert.ok(example.includes("'examples/output'"));
  for (const name of ['bad.txt', 'bad.md', 'bad.json', 'bad.sarif', 'bad.junit.xml', 'good.txt', 'good.md', 'good.json', 'good.sarif', 'good.junit.xml', 'checks.txt', 'checks.md', 'checks.json', 'explain-name-clash.txt', 'explain-name-clash.md', 'bad-dictionary-only.txt', 'bad-json-files.txt', 'bad-circles.txt', 'bad-reports-only.txt', 'bad-syntax-error.txt', 'good-json-dictionary.txt']) {
    assert.ok((await filesOf('examples/output')).includes(`examples/output/${name}`), name);
  }
});

test('package.json: the homepage, the repository, the keywords and the description of this tool', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.homepage, 'https://innerluxes.dev/data/analytics');
  assert.equal(pkg.version, '1.0.0');
  for (const k of ['data-analytics', 'metrics', 'kpi', 'semantic-layer', 'data-governance', 'business-intelligence', 'dashboards', 'cli']) assert.ok(pkg.keywords.includes(k), k);
  assert.match(pkg.description, /never connects to data/i);
  assert.match(pkg.description, /not a data quality tool and not an audit/);
});

test('no file holds a dash character: an en dash or an em dash, written as is or as an escape or an entity', async () => {
  const en = String.fromCharCode(0x2013);
  const em = String.fromCharCode(0x2014);
  const codes = [0x2013, 0x2014];
  const hex = codes.map((n) => n.toString(16));
  const escapes = new RegExp([...hex.map((h) => `u${h}`), ...hex.map((h) => `u\\{${h}\\}`), '&ndash;', '&mdash;', ...codes.map((n) => `&#${n};`), ...hex.map((h) => `&#x${h};`)].join('|'), 'i');
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs' || file === 'test/repo.test.js') continue;
    const text = await read(file);
    assert.ok(!text.includes(en) && !text.includes(em), file);
    assert.doesNotMatch(text, escapes, file);
  }
});

test('no file mentions a tool that writes text for people', async () => {
  const words = new RegExp(['\\bA' + 'I\\b', 'artif' + 'icial ' + 'intelligence', 'langu' + 'age ' + 'model', '\\bL' + 'LM\\b', 'assis' + 'tant', 'copi' + 'lot', 'pro' + 'mpt'].join('|'), 'i');
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs' || file === 'test/repo.test.js' || file === 'package-lock.json') continue;
    assert.doesNotMatch(await read(file), words, file);
  }
});
