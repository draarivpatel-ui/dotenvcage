import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotenv, scanDotenv } from '../src/index.mjs';
import { expectAuditCode, expectParseCode } from './helpers.mjs';

const validCases = [
  ['simple', 'A=1', 'A', '1'],
  ['empty', 'A=', 'A', ''],
  ['spaces trimmed', '  A  =  value  ', 'A', 'value'],
  ['inner spaces kept', 'A=a b c', 'A', 'a b c'],
  ['inline comment', 'A=value # comment', 'A', 'value'],
  ['hash starts empty comment', 'A=# comment', 'A', ''],
  ['hash inside value', 'A=a#b', 'A', 'a#b'],
  ['export prefix', 'export A=value', 'A', 'value'],
  ['export wide spacing', 'export   A   =   value', 'A', 'value'],
  ['underscore key', '_A=value', '_A', 'value'],
  ['digit in key', 'A1=value', 'A1', 'value'],
  ['lower key', 'a=value', 'a', 'value'],
  ['mixed key', 'Ab_C9=value', 'Ab_C9', 'value'],
  ['unicode value', 'A=café', 'A', 'café'],
  ['symbols value', 'A=!%&*+,-./:?@[]^_{}~', 'A', '!%&*+,-./:?@[]^_{}~'],
  ['single quoted empty', "A=''", 'A', ''],
  ['single quoted spaces', "A=' a b '", 'A', ' a b '],
  ['single quoted hash', "A='a # b'", 'A', 'a # b'],
  ['single quoted double quote', "A='a\"b'", 'A', 'a"b'],
  ['double quoted empty', 'A=""', 'A', ''],
  ['double quoted spaces', 'A=" a b "', 'A', ' a b '],
  ['double quoted hash', 'A="a # b"', 'A', 'a # b'],
  ['double quoted quote escape', 'A="a\\"b"', 'A', 'a"b'],
  ['double quoted backslash escape', 'A="a\\\\b"', 'A', 'a\\b'],
  ['double quoted single escape', 'A="a\\\'b"', 'A', "a'b"],
  ['comment after quote', "A='x' # comment", 'A', 'x'],
  ['equals in quoted value', "A='x=y'", 'A', 'x=y'],
  ['equals in unquoted value', 'A=x=y', 'A', 'x=y'],
  ['blank lines around', '\nA=1\n\n', 'A', '1'],
  ['comment lines around', '# one\nA=1\n# two', 'A', '1'],
];

for (const [name, input, key, expected] of validCases) {
  test('valid assignment ' + name, () => {
    const parsed = parseDotenv(input, { expand: false });
    assert.equal(parsed.values[key], expected);
    assert.equal(parsed.entries[0].key, key);
  });
}

test('export metadata is recorded', () => {
  const parsed = parseDotenv('export A=1\nB=2', { expand: false });
  assert.equal(parsed.entries[0].exported, true);
  assert.equal(parsed.entries[1].exported, false);
});

test('first value wins in values object while duplicate is rejected', () => {
  const scanned = scanDotenv('A=1\nA=2', { expand: false });
  assert.equal(scanned.values.A, '1');
  assert.equal(scanned.findings.some((finding) => finding.code === 'DUPLICATE_KEY'), true);
});

const invalidLines = [
  '1A=value',
  'A B=value',
  'A-value=1',
  'A.value=1',
  'A',
  'export',
  '=x',
  'A x',
  'A\t=1',
  'é=1',
  'A\x7f=1',
  'A B',
  'EXPORT A=1',
  'A :=1',
];

for (const line of invalidLines) {
  test('invalid line shape ' + JSON.stringify(line), () => {
    const scanned = scanDotenv(line, { expand: false });
    assert.equal(scanned.findings.length > 0, true);
  });
}

const validKeys = [];
for (let index = 0; index < 26; index += 1) validKeys.push('K_' + String.fromCharCode(65 + index) + index);
for (const key of validKeys) {
  test('valid key matrix ' + key, () => {
    assert.equal(parseDotenv(key + '=x', { expand: false }).values[key], 'x');
  });
}

const invalidKeys = ['0A', '9_', '-A', 'A-B', 'A.B', 'A B', 'é', '_é', 'Aé'];
for (const key of invalidKeys) {
  test('invalid key matrix ' + JSON.stringify(key), () => {
    expectParseCode(key + '=x', 'INVALID_LINE', { expand: false });
  });
}

for (let cp = 0; cp < 32; cp += 1) {
  if (cp === 10 || cp === 13) continue;
  test('raw control character rejected ' + cp, () => {
    const input = 'A=a' + String.fromCharCode(cp) + 'b';
    expectParseCode(input, 'CONTROL_CHARACTER', { expand: false });
  });
}
for (let cp = 127; cp < 160; cp += 1) {
  test('raw c1 delete control rejected ' + cp, () => {
    const input = 'A=a' + String.fromCharCode(cp) + 'b';
    expectParseCode(input, 'CONTROL_CHARACTER', { expand: false });
  });
}

const bidiCodepoints = [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
for (const cp of bidiCodepoints) {
  test('bidi control rejected ' + cp.toString(16), () => {
    expectParseCode('A=a' + String.fromCodePoint(cp) + 'b', 'BIDI_CONTROL', { expand: false });
  });
}

const zeroWidthCodepoints = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
for (const cp of zeroWidthCodepoints) {
  test('zero width formatting rejected ' + cp.toString(16), () => {
    const input = cp === 0xfeff ? 'A=a' + String.fromCodePoint(cp) + 'b' : 'A=a' + String.fromCodePoint(cp) + 'b';
    expectParseCode(input, 'UNICODE_SMUGGLING', { expand: false });
  });
}

test('utf8 bom is accepted at the start by default', () => {
  assert.equal(parseDotenv('\ufeffA=1', { expand: false }).values.A, '1');
});

test('utf8 bom can be rejected as smuggling when not allowed', () => {
  expectParseCode('\ufeffA=1', 'UNICODE_SMUGGLING', { expand: false, allowBom: false });
});

test('crlf line endings are accepted', () => {
  const parsed = parseDotenv('A=1\r\nB=2\r\n', { expand: false });
  assert.equal(parsed.values.A, '1');
  assert.equal(parsed.values.B, '2');
});

test('bare carriage return is rejected', () => {
  expectParseCode('A=1\rB=2', 'CR_LINE_ENDING', { expand: false });
});

const quoteErrors = [
  ['unterminated single', "A='abc", 'QUOTE_SYNTAX'],
  ['unterminated double', 'A="abc', 'QUOTE_SYNTAX'],
  ['trailing after single', "A='abc'x", 'QUOTE_SYNTAX'],
  ['trailing after double', 'A="abc"x', 'QUOTE_SYNTAX'],
  ['unknown escape', 'A="a\\q"', 'INVALID_ESCAPE'],
  ['backslash at line end', 'A="abc\\', 'INVALID_ESCAPE'],
];
for (const [name, input, code] of quoteErrors) {
  test('quote error ' + name, () => {
    expectParseCode(input, code, { expand: false });
  });
}

test('single quoted multiline is rejected by default', () => {
  expectParseCode("A='one\ntwo'", 'MULTILINE_VALUE', { expand: false });
});

test('single quoted multiline can be explicitly allowed', () => {
  const parsed = parseDotenv("A='one\ntwo'", { expand: false, allowMultiline: true });
  assert.equal(parsed.values.A, 'one\ntwo');
});

test('double quoted escaped newline is rejected by default', () => {
  expectParseCode('A="one\\ntwo"', 'CONTROL_CHARACTER', { expand: false });
});

test('double quoted escaped newline is allowed only with multiline enabled', () => {
  const parsed = parseDotenv('A="one\\ntwo"', { expand: false, allowMultiline: true });
  assert.equal(parsed.values.A, 'one\ntwo');
});

test('byte input is accepted', () => {
  const parsed = parseDotenv(Buffer.from('A=1\n'), { expand: false });
  assert.equal(parsed.values.A, '1');
});

test('invalid utf8 bytes are rejected', () => {
  expectParseCode(new Uint8Array([0xff, 0xfe, 0x41]), 'INVALID_ENCODING', { expand: false });
});

test('non string input is rejected', () => {
  expectParseCode({ A: '1' }, 'INVALID_INPUT', { expand: false });
});

test('input byte limit is enforced', () => {
  expectParseCode('A=' + 'x'.repeat(100), 'INPUT_TOO_LARGE', { expand: false, limits: { maxBytes: 20 } });
});

test('line limit is enforced', () => {
  expectParseCode('A=1\nB=2\nC=3', 'INPUT_TOO_LARGE', { expand: false, limits: { maxLines: 2 } });
});

test('entry limit is enforced', () => {
  expectParseCode('A=1\nB=2', 'INPUT_TOO_LARGE', { expand: false, limits: { maxEntries: 1 } });
});

test('key length limit is enforced', () => {
  expectParseCode('ABCDEF=x', 'INVALID_KEY', { expand: false, limits: { maxKeyLength: 3 } });
});

test('value length limit is enforced', () => {
  expectParseCode('A=xxxx', 'INPUT_TOO_LARGE', { expand: false, limits: { maxValueLength: 3 } });
});

test('invalid lines never silently become values', () => {
  const report = expectAuditCode('A=1\nnot-an-assignment\nB=2', 'INVALID_LINE', { expand: false });
  assert.equal(report.keys.includes('A'), true);
  assert.equal(report.keys.includes('B'), true);
});
