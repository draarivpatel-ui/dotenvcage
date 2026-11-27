import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDotenv, scanDotenv } from '../src/index.mjs';
import { expectParseCode } from './helpers.mjs';

test('simple braced expansion resolves regardless of order', () => {
  const parsed = parseDotenv('A=${B}\nB=value');
  assert.equal(parsed.values.A, 'value');
});

test('multiple references in one value resolve', () => {
  const parsed = parseDotenv('A=${B}-${C}\nB=one\nC=two');
  assert.equal(parsed.values.A, 'one-two');
});

test('nested references resolve recursively', () => {
  const parsed = parseDotenv('A=${B}\nB=${C}\nC=final');
  assert.equal(parsed.values.A, 'final');
});

test('same reference can be used repeatedly', () => {
  const parsed = parseDotenv('A=${B}/${B}\nB=x');
  assert.equal(parsed.values.A, 'x/x');
});

test('external expansion environment is explicit', () => {
  const parsed = parseDotenv('A=${EXTERNAL}', { expansionEnv: { EXTERNAL: 'outside' } });
  assert.equal(parsed.values.A, 'outside');
});

test('process environment is not implicitly read', () => {
  process.env.DOTENVCAGE_IMPLICIT = 'leak';
  try {
    expectParseCode('A=${DOTENVCAGE_IMPLICIT}', 'EXPANSION_UNDEFINED');
  } finally {
    delete process.env.DOTENVCAGE_IMPLICIT;
  }
});

test('undefined reference is rejected', () => {
  expectParseCode('A=${MISSING}', 'EXPANSION_UNDEFINED');
});

test('undefined reference is rejected even when expansion is disabled', () => {
  expectParseCode('A=${MISSING}', 'EXPANSION_UNDEFINED', { expand: false });
});

const undefinedNames = ['B', 'MISSING', 'X1', 'VERY_LONG_NAME', '_PRIVATE'];
for (const name of undefinedNames) {
  test('undefined reference matrix ' + name, () => {
    expectParseCode('A=${' + name + '}', 'EXPANSION_UNDEFINED');
  });
}

for (let length = 2; length <= 20; length += 1) {
  test('circular chain rejected length ' + length, () => {
    const lines = [];
    for (let index = 0; index < length; index += 1) lines.push('X' + index + '=${X' + ((index + 1) % length) + '}');
    expectParseCode(lines.join('\n'), 'EXPANSION_CIRCULAR');
  });
}

test('self reference is circular', () => {
  expectParseCode('A=${A}', 'EXPANSION_CIRCULAR');
});

test('duplicate keys in circular input report duplicate first or circular finding exists', () => {
  const scanned = scanDotenv('A=${B}\nB=${A}\nA=x');
  assert.equal(scanned.findings.some((finding) => finding.code === 'EXPANSION_CIRCULAR' || finding.code === 'DUPLICATE_KEY'), true);
});

const malformedReferences = [
  ['unclosed', 'A=${B'],
  ['empty', 'A=${}'],
  ['space', 'A=${B C}'],
  ['digit start', 'A=${1B}'],
  ['dash', 'A=${B-C}'],
  ['nested opener', 'A=${${B}}'],
  ['unicode', 'A=${é}'],
];
for (const [name, input] of malformedReferences) {
  test('malformed expansion reference ' + name, () => {
    expectParseCode(input, 'INVALID_EXPANSION');
  });
}

test('escaped reference remains literal when expansion is enabled', () => {
  const parsed = parseDotenv('A=\\${B}\nB=value');
  assert.equal(parsed.values.A, '${B}');
});

test('escaped reference in double quotes remains literal', () => {
  const parsed = parseDotenv('A="\\${B}"\nB=value');
  assert.equal(parsed.values.A, '${B}');
});

test('escaped reference in single quotes remains literal', () => {
  const parsed = parseDotenv("A='\\${B}'\nB=value");
  assert.equal(parsed.values.A, '${B}');
});

test('even backslashes before a reference preserve slashes and expand', () => {
  const slashes = '\\'.repeat(2);
  const parsed = parseDotenv('A=' + slashes + '${B}\nB=value');
  assert.equal(parsed.values.A, slashes + 'value');
});

test('odd backslashes before a reference preserve parity and stay literal', () => {
  const parsed = parseDotenv('A=' + '\\'.repeat(3) + '${B}\nB=value');
  assert.equal(parsed.values.A, '\\'.repeat(2) + '${B}');
});

test('even-backslash references participate in undefined validation', () => {
  expectParseCode('A=' + '\\'.repeat(2) + '${MISSING}', 'EXPANSION_UNDEFINED');
});

const literalContexts = [
  ['prefix', 'x\\${B}'],
  ['suffix', '\\${B}x'],
  ['middle', 'x\\${B}y'],
  ['twice', '\\${B}\\${B}'],
];
for (const [name, value] of literalContexts) {
  test('escaped reference context ' + name, () => {
    const parsed = parseDotenv('A=' + value + '\nB=z');
    assert.equal(parsed.values.A, value.replace(/\\\$\{/g, '${'));
  });
}

for (let depth = 3; depth <= 15; depth += 1) {
  test('valid nested chain depth ' + depth, () => {
    const lines = ['A=${X0}'];
    for (let index = 0; index < depth; index += 1) lines.push('X' + index + '=${X' + (index + 1) + '}');
    lines.push('X' + depth + '=final');
    const parsed = parseDotenv(lines.join('\n'));
    assert.equal(parsed.values.A, 'final');
  });
}

test('depth bound is enforced', () => {
  const lines = ['A=${X0}'];
  for (let index = 0; index < 8; index += 1) lines.push('X' + index + '=${X' + (index + 1) + '}');
  lines.push('X8=final');
  expectParseCode(lines.join('\n'), 'EXPANSION_TOO_DEEP', { limits: { maxExpansionDepth: 3 } });
});

test('expanded output length bound is enforced', () => {
  const input = 'A=' + 'x'.repeat(30) + '\nB=${A}${A}${A}';
  expectParseCode(input, 'EXPANSION_TOO_LARGE', { limits: { maxExpandedLength: 40 } });
});

test('step count bound is enforced', () => {
  const lines = [];
  for (let index = 0; index < 20; index += 1) lines.push('K' + index + '=v' + index);
  lines.push('A=' + Array.from({ length: 20 }, (_, index) => '${K' + index + '}').join('-'));
  expectParseCode(lines.join('\n'), 'EXPANSION_TOO_LARGE', { limits: { maxExpansionSteps: 4, maxExpansionDepth: 30 } });
});

test('expansion cannot smuggle command substitution from external env', () => {
  expectParseCode('A=${EXTERNAL}', 'COMMAND_SUBSTITUTION', { expansionEnv: { EXTERNAL: '$(id)' } });
});

test('expansion cannot smuggle control characters from external env', () => {
  expectParseCode('A=${EXTERNAL}', 'CONTROL_CHARACTER', { expansionEnv: { EXTERNAL: 'a\nb' } });
});

test('references metadata records dependency names', () => {
  const parsed = parseDotenv('A=${B}-${C}\nB=x\nC=y');
  assert.deepEqual(Array.from(parsed.references.get('A')), ['B', 'C']);
});

const expansionShapes = [
  ['empty value', '${B}', '', ''],
  ['prefix suffix', 'pre-${B}-post', 'X', 'pre-X-post'],
  ['adjacent', '${B}${B}', 'X', 'XX'],
  ['slash join', '${B}/${B}', 'x', 'x/x'],
  ['equals value', 'a=${B}', 'b=c', 'a=b=c'],
  ['unicode value', 'u-${B}', 'é', 'u-é'],
  ['space value', 'x ${B} y', 'mid', 'x mid y'],
  ['empty reference target', 'a${B}b', '', 'ab'],
];
for (const [name, template, replacement, expected] of expansionShapes) {
  test('expansion shape ' + name, () => {
    const parsed = parseDotenv('A=' + template + '\nB=' + replacement);
    assert.equal(parsed.values.A, expected);
  });
}

for (let count = 1; count <= 25; count += 1) {
  test('fanout expansion count ' + count, () => {
    const template = Array.from({ length: count }, () => '${B}').join('-');
    const parsed = parseDotenv('A=' + template + '\nB=x');
    assert.equal(parsed.values.A, Array.from({ length: count }, () => 'x').join('-'));
  });
}

test('expansion disabled leaves references literal after validation', () => {
  const parsed = parseDotenv('A=${B}\nB=x', { expand: false });
  assert.equal(parsed.values.A, '${B}');
});

test('external undefined empty string is a defined value', () => {
  const parsed = parseDotenv('A=${EXTERNAL}', { expansionEnv: { EXTERNAL: '' } });
  assert.equal(parsed.values.A, '');
});

test('numeric external values are stringified when explicitly supplied', () => {
  const parsed = parseDotenv('A=${EXTERNAL}', { expansionEnv: { EXTERNAL: 42 } });
  assert.equal(parsed.values.A, '42');
});

const memoryTest = process.platform === 'win32' ? test.skip : test;

memoryTest('expansion size cap is enforced before large output allocation', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-expansion-'));
  try {
    const child = path.join(scratch, 'expansion-child.mjs');
    const indexUrl = new URL('../src/index.mjs', import.meta.url).href;
    fs.writeFileSync(child, `
import { parseDotenv } from ${JSON.stringify(indexUrl)};
const mode = process.argv[2];
let input = 'A0=x\\n';
if (mode === 'bomb') {
  input = 'A0=' + 'x'.repeat(8192) + '\\n';
  for (let index = 1; index <= 12; index += 1) input += 'A' + index + '=\${A' + (index - 1) + '}\${A' + (index - 1) + '}\\n';
}
let code = 'none';
try { parseDotenv(input); } catch (error) { code = error && error.code ? error.code : 'unknown'; }
if (global.gc) global.gc();
console.log(JSON.stringify({ code, maxRSS: process.resourceUsage().maxRSS }));
`, 'utf8');
    const run = (mode) => {
      const result = spawnSync(process.execPath, ['--expose-gc', child, mode], { encoding: 'utf8', timeout: 10000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      return JSON.parse(result.stdout.trim());
    };
    const control = run('control');
    const bomb = run('bomb');
    assert.equal(bomb.code, 'EXPANSION_TOO_LARGE');
    const ratio = bomb.maxRSS / control.maxRSS;
    assert.ok(ratio < 1.4, 'expansion bomb peak memory ratio was ' + ratio.toFixed(2));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
