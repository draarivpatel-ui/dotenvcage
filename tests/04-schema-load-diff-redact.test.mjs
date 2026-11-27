import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diffDotenv, parseDotenv, redactDotenv, redactInput, safeLoad, validateSchema } from '../src/index.mjs';
import { expectCode } from './helpers.mjs';

function schemaViolation(values, schema) {
  return expectCode(() => validateSchema(values, schema), 'SCHEMA_VIOLATION');
}

test('valid strict schema passes', () => {
  const result = validateSchema({ PORT: '443', MODE: 'production' }, {
    required: ['PORT'],
    keys: {
      PORT: { type: 'integer', min: 1, max: 65535 },
      MODE: { type: 'enum', values: ['development', 'production'] },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.validatedKeys, 2);
});

const validIntegers = ['0', '1', '-1', '443', '65535', '9007199254740991', '-9007199254740991'];
for (const value of validIntegers) {
  test('integer schema valid ' + value, () => {
    assert.equal(validateSchema({ A: value }, { keys: { A: { type: 'integer' } } }).ok, true);
  });
}

const invalidIntegers = ['', '01', '1.0', 'x', ' 1', '1 ', '+1', '9007199254740993', '1e3', '--1', 'NaN', 'Infinity'];
for (const value of invalidIntegers) {
  test('integer schema invalid ' + JSON.stringify(value), () => {
    schemaViolation({ A: value }, { keys: { A: { type: 'integer' } } });
  });
}

test('integer minimum is enforced', () => {
  schemaViolation({ A: '0' }, { keys: { A: { type: 'integer', min: 1 } } });
});

test('integer maximum is enforced', () => {
  schemaViolation({ A: '65536' }, { keys: { A: { type: 'integer', max: 65535 } } });
});

const validNumbers = ['0', '1', '-1', '1.5', '0.25', '10e3', '1e-3', '2E+4'];
for (const value of validNumbers) {
  test('number schema valid ' + value, () => {
    assert.equal(validateSchema({ A: value }, { keys: { A: { type: 'number' } } }).ok, true);
  });
}

const invalidNumbers = ['', '.5', '1.', 'x', 'NaN', 'Infinity', ' 1', '1 ', '01.5', '--1'];
for (const value of invalidNumbers) {
  test('number schema invalid ' + JSON.stringify(value), () => {
    schemaViolation({ A: value }, { keys: { A: { type: 'number' } } });
  });
}

for (const value of ['true', 'false']) {
  test('boolean schema valid ' + value, () => {
    assert.equal(validateSchema({ A: value }, { keys: { A: { type: 'boolean' } } }).ok, true);
  });
}
for (const value of ['TRUE', 'False', '0', '1', 'yes', '']) {
  test('boolean schema invalid ' + JSON.stringify(value), () => {
    schemaViolation({ A: value }, { keys: { A: { type: 'boolean' } } });
  });
}

const enumValues = ['development', 'test', 'production', 'staging'];
for (const value of enumValues) {
  test('enum schema valid ' + value, () => {
    assert.equal(validateSchema({ A: value }, { keys: { A: { type: 'enum', values: enumValues } } }).ok, true);
  });
}
for (const value of ['dev', 'PRODUCTION', '', 'local']) {
  test('enum schema invalid ' + JSON.stringify(value), () => {
    schemaViolation({ A: value }, { keys: { A: { type: 'enum', values: enumValues } } });
  });
}

const validUrls = ['https://example.com/', 'http://localhost:3000/x', 'postgres://host/db', 'custom+v1://host/path'];
for (const value of validUrls) {
  test('url schema valid ' + value, () => {
    assert.equal(validateSchema({ A: value }, { keys: { A: { type: 'url' } } }).ok, true);
  });
}
for (const value of ['', 'example.com', '/relative', '://', 'not a url']) {
  test('url schema invalid ' + JSON.stringify(value), () => {
    schemaViolation({ A: value }, { keys: { A: { type: 'url' } } });
  });
}

test('url protocol allowlist is enforced', () => {
  schemaViolation({ A: 'http://example.com/' }, { keys: { A: { type: 'url', protocols: ['https:'] } } });
  assert.equal(validateSchema({ A: 'https://example.com/' }, { keys: { A: { type: 'url', protocols: ['https:'] } } }).ok, true);
});

const validJson = ['{}', '[]', 'null', 'true', '1', '"x"', '{"a":1}', '[1,2,3]'];
for (const value of validJson) {
  test('json schema valid ' + JSON.stringify(value), () => {
    assert.equal(validateSchema({ A: value }, { keys: { A: { type: 'json' } } }).ok, true);
  });
}
for (const value of ['', '{', '[1,]', 'undefined', "{'a':1}"]) {
  test('json schema invalid ' + JSON.stringify(value), () => {
    schemaViolation({ A: value }, { keys: { A: { type: 'json' } } });
  });
}

for (const value of ['a'.repeat(12), 'x'.repeat(32), 'token-with-hyphens']) {
  test('secret schema valid length ' + value.length, () => {
    assert.equal(validateSchema({ A: value }, { keys: { A: { type: 'secret' } } }).ok, true);
  });
}
for (const value of ['short', 'has space', '<placeholder>', 'paste-token-here', 'replace-me']) {
  test('secret schema invalid ' + JSON.stringify(value), () => {
    schemaViolation({ A: value }, { keys: { A: { type: 'secret' } } });
  });
}

test('string length bounds are enforced', () => {
  schemaViolation({ A: 'x' }, { keys: { A: { type: 'string', minLength: 2 } } });
  schemaViolation({ A: 'xxx' }, { keys: { A: { type: 'string', maxLength: 2 } } });
  assert.equal(validateSchema({ A: 'xx' }, { keys: { A: { type: 'string', minLength: 2, maxLength: 2 } } }).ok, true);
});

test('string pattern is enforced', () => {
  schemaViolation({ A: 'abc' }, { keys: { A: { type: 'string', pattern: '^[0-9]+$' } } });
  assert.equal(validateSchema({ A: '123' }, { keys: { A: { type: 'string', pattern: '^[0-9]+$' } } }).ok, true);
});

test('RegExp schema patterns preserve their flags', () => {
  assert.equal(validateSchema({ A: 'ABC' }, { keys: { A: { type: 'string', pattern: /^abc$/i } } }).ok, true);
});

test('required keys are enforced', () => {
  schemaViolation({}, { required: ['A'], keys: { A: { type: 'string' } } });
});

test('rule required true is enforced', () => {
  schemaViolation({}, { keys: { A: { type: 'string', required: true } } });
});

test('empty required value is rejected', () => {
  schemaViolation({ A: '' }, { keys: { A: { type: 'string', required: true } } });
});

test('empty optional value can be allowed', () => {
  assert.equal(validateSchema({ A: '' }, { keys: { A: { type: 'string', allowEmpty: true } } }).ok, true);
});

test('unknown keys are rejected by default', () => {
  schemaViolation({ UNKNOWN: 'x' }, { keys: {} });
});

test('unknown keys can be explicitly allowed', () => {
  assert.equal(validateSchema({ UNKNOWN: 'x' }, { keys: {}, allowUnknown: true }).ok, true);
});

const invalidSchemas = [
  null,
  [],
  { keys: [] },
  { keys: { '1A': { type: 'string' } } },
  { keys: { A: null } },
  { keys: { A: { type: 'unknown' } } },
  { keys: { A: { type: 'enum' } } },
  { keys: { A: { type: 'string', pattern: '[' } } },
];
for (const [index, schema] of invalidSchemas.entries()) {
  test('invalid schema rejected ' + index, () => {
    expectCode(() => validateSchema({}, schema), 'INVALID_SCHEMA');
  });
}

test('safeLoad writes new keys to target', () => {
  const target = {};
  const result = safeLoad('A=1\nB=2', { target });
  assert.deepEqual(result.loaded, ['A', 'B']);
  assert.equal(target.A, '1');
  assert.equal(target.B, '2');
});

test('safeLoad does not override by default', () => {
  const target = { A: 'existing' };
  const result = safeLoad('A=new', { target });
  assert.deepEqual(result.skipped, ['A']);
  assert.equal(target.A, 'existing');
});

test('safeLoad override true replaces existing keys', () => {
  const target = { A: 'existing' };
  const result = safeLoad('A=new', { target, override: true });
  assert.deepEqual(result.overridden, ['A']);
  assert.equal(target.A, 'new');
});

test('safeLoad onExisting error is transactional', () => {
  const target = { A: 'existing', Z: 'kept' };
  expectCode(() => safeLoad('A=new\nZ=new', { target, onExisting: 'error' }), 'OVERRIDE_DENIED');
  assert.equal(target.A, 'existing');
  assert.equal(target.Z, 'kept');
});

test('safeLoad schema failure is transactional', () => {
  const target = {};
  expectCode(() => safeLoad('PORT=99999\nA=1', { target, schema: { keys: { PORT: { type: 'integer', max: 65535 }, A: { type: 'string' } } } }), 'SCHEMA_VIOLATION');
  assert.deepEqual(target, {});
});

test('safeLoad parse failure is transactional', () => {
  const target = {};
  expectCode(() => safeLoad('PATH=/bad\nA=1', { target }), 'DANGEROUS_KEY');
  assert.deepEqual(target, {});
});

test('safeLoad expands values before loading', () => {
  const target = {};
  safeLoad('A=${B}\nB=x', { target });
  assert.equal(target.A, 'x');
});

test('safeLoad accepts inputType path', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-load-'));
  try {
    const file = path.join(scratch, 'input.env');
    fs.writeFileSync(file, 'A=file-value\n', 'utf8');
    const target = {};
    const result = safeLoad(file, { target, inputType: 'path' });
    assert.deepEqual(result.loaded, ['A']);
    assert.equal(target.A, 'file-value');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('safeLoad accepts path option', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-load-'));
  try {
    const file = path.join(scratch, 'input.env');
    fs.writeFileSync(file, 'A=file-value\n', 'utf8');
    const target = {};
    safeLoad(undefined, { target, path: file });
    assert.equal(target.A, 'file-value');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('safeLoad missing file reports IO_ERROR', () => {
  expectCode(() => safeLoad('missing-file', { inputType: 'path', target: {} }), 'IO_ERROR');
});

test('safeLoad rejects a directory path before parsing', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-load-'));
  try {
    expectCode(() => safeLoad(scratch, { inputType: 'path', target: {} }), 'IO_ERROR');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

const posixFileTest = process.platform === 'win32' ? test.skip : test;

posixFileTest('safeLoad rejects symlink file input', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-load-'));
  try {
    const file = path.join(scratch, 'real.env');
    const link = path.join(scratch, 'linked.env');
    fs.writeFileSync(file, 'A=file-value\n', 'utf8');
    fs.symlinkSync(file, link);
    expectCode(() => safeLoad(link, { inputType: 'path', target: {} }), 'IO_ERROR');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

posixFileTest('safeLoad rejects fifo file input without blocking', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-load-'));
  try {
    const fifo = path.join(scratch, 'input.fifo');
    execFileSync('mkfifo', [fifo]);
    expectCode(() => safeLoad(fifo, { inputType: 'path', target: {} }), 'IO_ERROR');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('safeLoad rejects an oversize regular file before reading it fully', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-load-'));
  try {
    const file = path.join(scratch, 'large.env');
    fs.writeFileSync(file, 'A=' + 'x'.repeat(64), 'utf8');
    expectCode(() => safeLoad(file, { inputType: 'path', target: {}, limits: { maxBytes: 16 } }), 'INPUT_TOO_LARGE');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('safeLoad result omits values', () => {
  const result = safeLoad('A=secret-value', { target: {} });
  assert.equal(JSON.stringify(result).includes('secret-value'), false);
});

test('diff detects added removed changed and unchanged keys', () => {
  const result = diffDotenv('A=1\nB=left\nC=3', 'A=1\nB=right\nD=4');
  assert.deepEqual(result.added, ['D']);
  assert.deepEqual(result.removed, ['C']);
  assert.deepEqual(result.unchanged, ['A']);
  assert.deepEqual(result.changed.map((item) => item.key), ['B']);
  assert.equal(result.same, false);
});

test('diff same inputs are same', () => {
  const result = diffDotenv('A=1', 'A=1');
  assert.equal(result.same, true);
});

test('diff redacts changed values by default without fingerprints', () => {
  const result = diffDotenv('A=left', 'A=right');
  assert.equal(result.changed[0].left, '<redacted>');
  assert.equal(result.changed[0].right, '<redacted>');
  assert.equal(Object.prototype.hasOwnProperty.call(result.changed[0], 'leftSha256'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.changed[0], 'rightSha256'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.changed[0], 'leftLength'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.changed[0], 'rightLength'), false);
});

test('diff can reveal values explicitly', () => {
  const result = diffDotenv('A=left', 'A=right', { redact: false });
  assert.equal(result.changed[0].left, 'left');
  assert.equal(result.changed[0].right, 'right');
});

test('diff accepts values objects', () => {
  const result = diffDotenv({ A: '1' }, { A: '1', B: '2' });
  assert.deepEqual(result.added, ['B']);
});

test('diff accepts parse results', () => {
  const left = parseDotenv('A=1');
  const right = parseDotenv('A=2');
  assert.equal(diffDotenv(left, right).same, false);
});

for (let count = 0; count <= 30; count += 1) {
  test('diff unchanged matrix count ' + count, () => {
    const entries = Array.from({ length: count }, (_, index) => 'K' + index + '=v' + index).join('\n');
    assert.equal(diffDotenv(entries, entries).same, true);
  });
}

test('redactInput never exposes value edges', () => {
  assert.equal(redactInput('edge-secret-value'), '<redacted>');
  assert.equal(redactInput('x'), '<redacted>');
  assert.equal(redactInput(''), '');
  assert.equal(redactInput(null), '');
});

test('redactDotenv redacts simple assignments', () => {
  const output = redactDotenv('A=secret\nB=two\n');
  assert.equal(output.includes('secret'), false);
  assert.match(output, /A=<redacted>/);
  assert.match(output, /B=<redacted>/);
});

test('redactDotenv preserves comments and blank lines', () => {
  const output = redactDotenv('# top\n\nA=secret # keep\n');
  assert.equal(output.includes('# top'), true);
  assert.equal(output.includes('# keep'), true);
});

test('redactDotenv handles quoted values', () => {
  const output = redactDotenv('A="secret value"\nB=\'hidden\'\n');
  assert.equal(output.includes('secret value'), false);
  assert.equal(output.includes('hidden'), false);
});

test('redactDotenv removes multiline continuation content', () => {
  const output = redactDotenv('A="first\nsecond secret\nthird"\nB=safe\n');
  assert.equal(output.includes('second secret'), false);
  assert.equal(output.includes('third'), false);
});

test('redactDotenv values object redacts all non-empty values', () => {
  const output = redactDotenv({ A: 'secret', B: '' });
  assert.equal(output.A, '<redacted>');
  assert.equal(output.B, '');
});

test('redactDotenv custom placeholder', () => {
  assert.match(redactDotenv('A=x', { placeholder: '[hidden]' }), /A=\[hidden\]/);
});

const redactKeys = [];
for (let index = 0; index < 40; index += 1) redactKeys.push('K' + index);
for (const key of redactKeys) {
  test('redact key matrix ' + key, () => {
    const output = redactDotenv(key + '=value-' + key);
    assert.equal(output.includes('value-' + key), false);
    assert.equal(output.includes(key + '=<redacted>'), true);
  });
}

for (const quote of ['"', "'"]) {
  for (let index = 0; index < 20; index += 1) {
    test('redact quoted matrix ' + quote + ' ' + index, () => {
      const secret = 'secret' + index;
      const output = redactDotenv('A=' + quote + secret + quote);
      assert.equal(output.includes(secret), false);
    });
  }
}
