import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markers = [
  `/${'Users'}/`,
  '@' + 'gmail.com',
  '@' + 'googlemail.com',
  'Co-' + 'Authored-By' + ':',
  String.fromCharCode(0x2014),
  String.fromCharCode(0x2013),
];

function trackedFiles() {
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' });
  return raw.toString('utf8').split('\0').filter(Boolean).filter((file) => !file.includes('__pycache__') && !file.endsWith('.pyc') && !file.startsWith('.git/'));
}

test('tracked files contain no local paths, personal mailbox fragments, trailers, or punctuation dashes', () => {
  const files = trackedFiles();
  assert.ok(files.length > 20, 'expected the repository index to be populated');
  const failures = [];
  for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    for (const marker of markers) {
      if (text.includes(marker)) failures.push(file + ': forbidden marker');
    }
  }
  assert.deepEqual(failures, []);
});

test('tracked text files use LF line endings', () => {
  const failures = [];
  for (const file of trackedFiles()) {
    const full = path.join(root, file);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    if (bytes.includes(13)) failures.push(file);
  }
  assert.deepEqual(failures, []);
});

test('package metadata stays zero dependency and correctly versioned', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dotenvcage');
  assert.equal(pkg.version, '1.0.0');
  assert.deepEqual(pkg.dependencies, {});
  assert.deepEqual(pkg.devDependencies, {});
  assert.equal(pkg.engines.node, '>=18.0.0');
});

test('package exports are dual mode and typed', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.exports['.'].import, './src/index.mjs');
  assert.equal(pkg.exports['.'].require, './cjs/index.cjs');
  assert.equal(pkg.exports['.'].types, './types/index.d.ts');
});

test('ci matrix contains all eight required jobs', () => {
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const job of ['node18-ubuntu', 'node20-ubuntu', 'node22-ubuntu', 'node24-ubuntu', 'node18-windows', 'node20-windows', 'node22-windows', 'node24-windows']) {
    assert.match(ci, new RegExp('^  ' + job + ':', 'm'));
  }
});

test('required public surface files exist', () => {
  for (const file of ['bin/dotenvcage.mjs', 'types/index.d.ts', 'scripts/check-types.mjs', 'scripts/build-cjs.mjs', 'scripts/check-pack.mjs', 'examples/basic-load.mjs', 'examples/audit-and-redact.mjs', 'examples/schema-and-diff.mjs']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});

test('type checker script does not enable shell execution', () => {
  const text = fs.readFileSync(path.join(root, 'scripts', 'check-types.mjs'), 'utf8');
  assert.equal(/shell\s*:\s*true/.test(text), false);
});

test('readme documents core public functions', () => {
  const text = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const name of ['parseDotenv', 'auditDotenv', 'safeLoad', 'redactDotenv', 'diffDotenv', 'validateSchema']) {
    assert.equal(text.includes(name), true, name);
  }
});

test('tests do not contain complete vendor token fixture literals', () => {
  const tests = trackedFiles().filter((file) => file.startsWith('tests/') && file.endsWith('.mjs'));
  const forbiddenFragments = [
    'A' + 'KIA' + '0'.repeat(16),
    'g' + 'hp_' + 'a'.repeat(36),
    's' + 'k_' + 'live_' + 'a'.repeat(20),
  ];
  for (const file of tests) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const fragment of forbiddenFragments) assert.equal(text.includes(fragment), false, file);
  }
});
