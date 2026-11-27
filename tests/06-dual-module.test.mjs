import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

for (const name of ['parseDotenv', 'auditDotenv', 'safeLoad', 'redactDotenv', 'diffDotenv', 'validateSchema', 'detectSecretKinds', 'DotenvCageError', 'VERSION', 'ERROR_CODES']) {
  test('commonjs export ' + name, () => {
    const cjs = require('../cjs/index.cjs');
    assert.notEqual(cjs[name], undefined);
  });
}

test('commonjs parser executes', () => {
  const cjs = require('../cjs/index.cjs');
  const parsed = cjs.parseDotenv('A=1');
  assert.equal(parsed.values.A, '1');
});

test('esm and commonjs versions agree', async () => {
  const esm = await import('../src/index.mjs');
  const cjs = require('../cjs/index.cjs');
  assert.equal(cjs.VERSION, esm.VERSION);
});
