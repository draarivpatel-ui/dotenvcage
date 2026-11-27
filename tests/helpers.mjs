import assert from 'node:assert/strict';
import { auditDotenv, DotenvCageError, parseDotenv } from '../src/index.mjs';

export function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof DotenvCageError, 'expected DotenvCageError, got ' + error);
    assert.equal(error.code, code, error.stack);
    return error;
  }
  assert.fail('expected ' + code);
}

export function expectParseCode(input, code, options) {
  return expectCode(() => parseDotenv(input, options), code);
}

export function codesFromAudit(input, options) {
  return auditDotenv(input, options).findings.map((finding) => finding.code);
}

export function expectAuditCode(input, code, options) {
  const report = auditDotenv(input, options);
  assert.equal(report.findings.some((finding) => finding.code === code), true, 'missing ' + code + ' in ' + JSON.stringify(report.findings));
  return report;
}

export function awsFixture() {
  return 'A' + 'KIA' + '0'.repeat(16);
}

export function githubFixture() {
  return 'g' + 'hp_' + 'a'.repeat(36);
}

export function stripeFixture() {
  return 's' + 'k_' + 'live_' + 'a'.repeat(20);
}

export function jwtFixture() {
  return 'e' + 'yJ' + 'a'.repeat(12) + '.' + 'b'.repeat(18) + '.' + 'c'.repeat(16);
}

export function privateKeyFixture() {
  return '-----BEGIN ' + 'PRIVATE KEY-----\nredacted\n-----END ' + 'PRIVATE KEY-----';
}

export function databaseUrlFixture() {
  return 'postgres://appuser:apppass@db.internal:5432/appdb';
}
