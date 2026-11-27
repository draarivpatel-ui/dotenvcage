const ERROR_CODES = Object.freeze({
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_ENCODING: 'INVALID_ENCODING',
  INVALID_LINE: 'INVALID_LINE',
  INVALID_KEY: 'INVALID_KEY',
  PROTOTYPE_KEY: 'PROTOTYPE_KEY',
  DANGEROUS_KEY: 'DANGEROUS_KEY',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  COMMAND_SUBSTITUTION: 'COMMAND_SUBSTITUTION',
  CONTROL_CHARACTER: 'CONTROL_CHARACTER',
  BIDI_CONTROL: 'BIDI_CONTROL',
  UNICODE_SMUGGLING: 'UNICODE_SMUGGLING',
  CR_LINE_ENDING: 'CR_LINE_ENDING',
  MULTILINE_VALUE: 'MULTILINE_VALUE',
  QUOTE_SYNTAX: 'QUOTE_SYNTAX',
  INVALID_ESCAPE: 'INVALID_ESCAPE',
  INVALID_EXPANSION: 'INVALID_EXPANSION',
  EXPANSION_CIRCULAR: 'EXPANSION_CIRCULAR',
  EXPANSION_UNDEFINED: 'EXPANSION_UNDEFINED',
  EXPANSION_TOO_DEEP: 'EXPANSION_TOO_DEEP',
  EXPANSION_TOO_LARGE: 'EXPANSION_TOO_LARGE',
  SECRET_LIKE_VALUE: 'SECRET_LIKE_VALUE',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  SCHEMA_VIOLATION: 'SCHEMA_VIOLATION',
  OVERRIDE_DENIED: 'OVERRIDE_DENIED',
  IO_ERROR: 'IO_ERROR',
});

class DotenvCageError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DotenvCageError';
    this.code = code;
    this.reason = message;
    for (const [key, value] of Object.entries(details)) {
      if (key !== 'code' && key !== 'message' && key !== 'name' && key !== 'stack') this[key] = value;
    }
  }
}

function cageError(code, message, details = {}) {
  return new DotenvCageError(code, message, details);
}

function invalidArgument(message, details = {}) {
  return new DotenvCageError(ERROR_CODES.INVALID_INPUT, message, details);
}

function makeFinding(code, severity, message, details = {}) {
  return Object.freeze({
    code,
    severity,
    message,
    line: details.line === undefined ? null : details.line,
    key: details.key === undefined ? null : details.key,
  });
}

function firstError(findings) {
  return findings.find((finding) => finding.severity === 'error') || null;
}

function throwFirstError(findings) {
  const finding = firstError(findings);
  if (!finding) return;
  throw new DotenvCageError(finding.code, finding.message, {
    line: finding.line,
    key: finding.key,
    findings,
  });
}

function redactInput(value) {
  if (value === undefined || value === null || String(value).length === 0) return '';
  return '<redacted>';
}

exports.ERROR_CODES = ERROR_CODES;
exports.DotenvCageError = DotenvCageError;
exports.cageError = cageError;
exports.invalidArgument = invalidArgument;
exports.makeFinding = makeFinding;
exports.firstError = firstError;
exports.throwFirstError = throwFirstError;
exports.redactInput = redactInput;
