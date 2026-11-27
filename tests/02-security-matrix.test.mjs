import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDotenv, DANGEROUS_RUNTIME_KEYS, detectSecretKinds, parseDotenv, PROTOTYPE_KEYS } from '../src/index.mjs';
import { awsFixture, databaseUrlFixture, expectAuditCode, expectParseCode, githubFixture, jwtFixture, privateKeyFixture, stripeFixture } from './helpers.mjs';

for (const key of DANGEROUS_RUNTIME_KEYS) {
  test('dangerous runtime key rejected ' + key, () => {
    expectParseCode(key + '=x', 'DANGEROUS_KEY', { expand: false });
  });
  test('dangerous runtime key lowercase rejected ' + key, () => {
    expectParseCode(key.toLowerCase() + '=x', 'DANGEROUS_KEY', { expand: false });
  });
  test('dangerous runtime key mixed case rejected ' + key, () => {
    const mixed = key.split('').map((ch, index) => (index % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase())).join('');
    expectParseCode(mixed + '=x', 'DANGEROUS_KEY', { expand: false });
  });
}

test('explicitly allowed runtime key can parse', () => {
  const parsed = parseDotenv('PATH=/safe/bin', { expand: false, allowRuntimeKeys: ['PATH'] });
  assert.equal(parsed.values.PATH, '/safe/bin');
});

test('allowRuntimeKeys true is an explicit escape hatch', () => {
  const parsed = parseDotenv('NODE_OPTIONS=--max-old-space-size=128', { expand: false, allowRuntimeKeys: true });
  assert.equal(parsed.values.NODE_OPTIONS, '--max-old-space-size=128');
});

test('allowRuntimeKeys does not allow prototype keys', () => {
  expectParseCode('__proto__=x', 'PROTOTYPE_KEY', { expand: false, allowRuntimeKeys: true });
});

for (const key of PROTOTYPE_KEYS) {
  test('prototype or dunder key rejected ' + key, () => {
    expectParseCode(key + '=x', 'PROTOTYPE_KEY', { expand: false });
  });
}

const extraDunderKeys = ['__A__', '__CUSTOM__', '__secret__', '__x9__'];
for (const key of extraDunderKeys) {
  test('dunder-form key rejected ' + key, () => {
    expectParseCode(key + '=x', 'PROTOTYPE_KEY', { expand: false });
  });
}

const substitutionCases = [
  ['unquoted dollar', 'A=$(id)'],
  ['single quoted dollar', "A='$(id)'"],
  ['double quoted dollar', 'A="$(id)"'],
  ['comment dollar', '# $(id)\nA=1'],
  ['unquoted backtick', 'A=`id`'],
  ['single quoted backtick', "A='`id`'"],
  ['double quoted backtick', 'A="`id`"'],
  ['comment backtick', '# `id`\nA=1'],
  ['empty substitution', 'A=$()'],
  ['nested substitution', 'A=$(echo $(id))'],
  ['substitution prefix', 'A=x$(id)'],
  ['substitution suffix', 'A=$(id)x'],
  ['substitution middle', 'A=x$(id)y'],
  ['backtick prefix', 'A=x`id`'],
  ['backtick suffix', 'A=`id`x'],
  ['backtick middle', 'A=x`id`y'],
];
for (const [name, input] of substitutionCases) {
  test('command substitution rejected ' + name, () => {
    expectParseCode(input, 'COMMAND_SUBSTITUTION', { expand: false });
  });
}

test('ordinary dollar signs without command syntax are allowed', () => {
  const parsed = parseDotenv('A=$5\nB=price-$10\nC=\\${NOT_EXPANDED}', { expand: false });
  assert.equal(parsed.values.A, '$5');
  assert.equal(parsed.values.B, 'price-$10');
});

for (const key of ['A', 'FIRST', 'SECOND']) {
  test('duplicate key rejected ' + key, () => {
    expectParseCode(key + '=1\n' + key + '=2', 'DUPLICATE_KEY', { expand: false });
  });
}

test('same value duplicate is still rejected', () => {
  expectParseCode('A=1\nA=1', 'DUPLICATE_KEY', { expand: false });
});

test('case-variant duplicate is rejected as cross-platform shadowing', () => {
  expectParseCode('Alpha=1\nALPHA=2', 'DUPLICATE_KEY', { expand: false });
  expectParseCode('a=1\nA=2', 'DUPLICATE_KEY', { expand: false });
});

test('three duplicates produce duplicate findings', () => {
  const report = expectAuditCode('A=1\nA=2\nA=3', 'DUPLICATE_KEY', { expand: false });
  assert.equal(report.findings.filter((finding) => finding.code === 'DUPLICATE_KEY').length, 2);
});

const secretFixtures = [
  ['aws', awsFixture(), 'aws-access-key'],
  ['github', githubFixture(), 'github-token'],
  ['stripe', stripeFixture(), 'stripe-key'],
  ['jwt', jwtFixture(), 'jwt'],
  ['private key', privateKeyFixture(), 'private-key'],
  ['database url', databaseUrlFixture(), 'database-url-with-password'],
];

for (const [name, value, kind] of secretFixtures) {
  test('secret detector identifies ' + name, () => {
    assert.equal(detectSecretKinds(value).includes(kind), true);
  });
  test('secret detector identifies embedded ' + name, () => {
    assert.equal(detectSecretKinds('prefix ' + value + ' suffix').includes(kind), true);
  });
  test('audit flags committed ' + name, () => {
    const report = expectAuditCode('TOKEN=' + JSON.stringify(value), 'SECRET_LIKE_VALUE', { context: 'committed', expand: false });
    const finding = report.findings.find((item) => item.code === 'SECRET_LIKE_VALUE');
    assert.equal(finding.severity, 'error');
  });
  test('audit flags example ' + name, () => {
    const report = expectAuditCode('TOKEN=' + JSON.stringify(value), 'SECRET_LIKE_VALUE', { context: 'example', expand: false });
    const finding = report.findings.find((item) => item.code === 'SECRET_LIKE_VALUE');
    assert.equal(finding.severity, 'error');
  });
  test('runtime secret shape is warning for ' + name, () => {
    const report = expectAuditCode('TOKEN=' + JSON.stringify(value), 'SECRET_LIKE_VALUE', { context: 'runtime', expand: false });
    const finding = report.findings.find((item) => item.code === 'SECRET_LIKE_VALUE');
    assert.equal(finding.severity, 'warning');
  });
}

const negativeSecretValues = [
  '',
  'placeholder',
  'paste-your-token-here',
  'not-a-token',
  'A' + 'KIA' + 'short',
  'g' + 'hp_short',
  's' + 'k_live_short',
  'postgres://user@host/db',
  'postgres://user:@host/db',
  'https://example.com/no-credential',
  '-----BEGIN PUBLIC KEY-----',
];
for (const value of negativeSecretValues) {
  test('secret detector negative ' + JSON.stringify(value), () => {
    assert.deepEqual(detectSecretKinds(value), []);
  });
}

test('audit secret detection can be disabled', () => {
  const report = auditDotenv('TOKEN=' + awsFixture(), { context: 'committed', detectSecrets: false, expand: false });
  assert.equal(report.findings.some((finding) => finding.code === 'SECRET_LIKE_VALUE'), false);
});

test('audit sorts findings by line', () => {
  const report = auditDotenv('PATH=1\nA=1\n__proto__=2', { expand: false });
  const lines = report.findings.map((finding) => finding.line).filter((line) => line !== null);
  assert.deepEqual(lines, lines.slice().sort((a, b) => a - b));
});

test('audit reports keys without exposing values', () => {
  const report = auditDotenv('A=secret-value\nB=2', { expand: false });
  assert.deepEqual(report.keys, ['A', 'B']);
  assert.equal(JSON.stringify(report).includes('secret-value'), false);
});

test('git command transport keys are dangerous runtime keys', () => {
  for (const key of ['GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_ASKPASS', 'SSH_ASKPASS']) {
    expectParseCode(key + '=x', 'DANGEROUS_KEY', { expand: false });
  }
});

test('object introspection keys are rejected case-insensitively', () => {
  for (const key of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString']) {
    expectParseCode(key + '=x', 'PROTOTYPE_KEY', { expand: false });
    expectParseCode(key.toUpperCase() + '=x', 'PROTOTYPE_KEY', { expand: false });
  }
});

test('shadowed duplicate secret material is still audited', () => {
  const report = expectAuditCode('TOKEN=safe\nTOKEN=' + awsFixture(), 'SECRET_LIKE_VALUE', { context: 'committed', expand: false });
  const finding = report.findings.find((item) => item.code === 'SECRET_LIKE_VALUE');
  assert.equal(finding.line, 2);
});
