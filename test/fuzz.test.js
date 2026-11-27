import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import {
  DotenvCageError,
  ERROR_CODES,
  parseDotenv,
} from '../src/index.mjs';

const propertyOptions = { seed: 20261127, numRuns: 120 };
const keyArbitrary = fc.stringMatching(/^SAFE[A-Z0-9_]{0,12}$/);
const valueArbitrary = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._-]{0,30}$/);

function expectParseError(input, code) {
  assert.throws(
    () => parseDotenv(input, { expand: false }),
    (error) => error instanceof DotenvCageError && error.code === code,
  );
}

test('benign assignments parse to their exact values', () => {
  fc.assert(
    fc.property(keyArbitrary, valueArbitrary, (key, value) => {
      const parsed = parseDotenv(`${key}=${value}\n`, { expand: false });
      assert.equal(parsed.values[key], value);
      assert.equal(Object.getPrototypeOf(parsed.values), null);
    }),
    propertyOptions,
  );
});

test('duplicate benign keys always fail closed', () => {
  fc.assert(
    fc.property(keyArbitrary, valueArbitrary, valueArbitrary, (key, first, second) => {
      expectParseError(`${key}=${first}\n${key}=${second}`, ERROR_CODES.DUPLICATE_KEY);
    }),
    propertyOptions,
  );
});

test('generated command substitution payloads are rejected', () => {
  const commandText = fc.stringMatching(/^[a-z][a-z0-9 ]{0,20}$/);
  fc.assert(
    fc.property(keyArbitrary, commandText, (key, command) => {
      expectParseError(`${key}=prefix$(${command})suffix`, ERROR_CODES.COMMAND_SUBSTITUTION);
    }),
    propertyOptions,
  );
});

test('runtime hijack keys are rejected regardless of generated values', () => {
  const dangerousKey = fc.constantFrom('PATH', 'NODE_OPTIONS', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'GIT_SSH_COMMAND');
  fc.assert(
    fc.property(dangerousKey, valueArbitrary, (key, value) => {
      expectParseError(`${key}=${value}`, ERROR_CODES.DANGEROUS_KEY);
    }),
    propertyOptions,
  );
});

test('prototype keys are rejected regardless of generated values', () => {
  const prototypeKey = fc.constantFrom('__proto__', 'constructor', 'prototype', 'toString', 'valueOf');
  fc.assert(
    fc.property(prototypeKey, valueArbitrary, (key, value) => {
      expectParseError(`${key}=${value}`, ERROR_CODES.PROTOTYPE_KEY);
    }),
    propertyOptions,
  );
});

test('control and bidirectional characters are rejected in generated values', () => {
  const hostile = fc.constantFrom(['\0', ERROR_CODES.CONTROL_CHARACTER], ['\u202e', ERROR_CODES.BIDI_CONTROL], ['\u2066', ERROR_CODES.BIDI_CONTROL]);
  fc.assert(
    fc.property(keyArbitrary, valueArbitrary, hostile, (key, value, [character, code]) => {
      expectParseError(`${key}=a${character}${value}`, code);
    }),
    propertyOptions,
  );
});
