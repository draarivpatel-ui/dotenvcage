import { ERROR_CODES, DotenvCageError, invalidArgument, makeFinding } from './errors.mjs';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TYPES = new Set(['string', 'integer', 'number', 'boolean', 'enum', 'url', 'json', 'secret']);
const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;
const NUMBER_PATTERN = /^-?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)(?:[eE][+-]?[0-9]+)?$/;

function schemaError(message) {
  return new DotenvCageError(ERROR_CODES.INVALID_SCHEMA, message);
}

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw schemaError('schema must be an object');
  const keys = schema.keys === undefined ? {} : schema.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw schemaError('schema.keys must be an object');
  const names = Object.keys(keys);
  if (names.length > 256) throw schemaError('schema has too many keys');
  const normalized = new Map();
  for (const name of names) {
    if (!KEY_PATTERN.test(name)) throw schemaError('schema key is not a valid dotenv key: ' + name);
    const rule = keys[name];
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw schemaError('schema rule must be an object for ' + name);
    if (!TYPES.has(rule.type)) throw schemaError('schema rule has an unknown type for ' + name);
    const copy = Object.assign({}, rule);
    if (copy.type === 'enum') {
      if (!Array.isArray(copy.values) || copy.values.length === 0 || copy.values.length > 256) throw schemaError('enum rule requires 1 to 256 values for ' + name);
      for (const value of copy.values) if (typeof value !== 'string') throw schemaError('enum values must be strings for ' + name);
    }
    if (copy.pattern !== undefined) {
      let flags = '';
      if (copy.pattern instanceof RegExp) {
        flags = copy.pattern.flags;
        copy.pattern = copy.pattern.source;
      }
      if (typeof copy.pattern !== 'string' || copy.pattern.length > 512) throw schemaError('pattern must be a bounded string or RegExp for ' + name);
      try {
        copy.compiledPattern = new RegExp(copy.pattern, flags);
      } catch (error) {
        throw schemaError('pattern does not compile for ' + name);
      }
    }
    for (const field of ['minLength', 'maxLength', 'min', 'max']) {
      if (copy[field] !== undefined && (!Number.isFinite(copy[field]))) throw schemaError(field + ' must be finite for ' + name);
    }
    normalized.set(name, copy);
  }
  const requiredInput = schema.required === undefined ? [] : schema.required;
  if (!Array.isArray(requiredInput)) throw schemaError('schema.required must be an array');
  const required = new Set(requiredInput);
  if (required.size > 256) throw schemaError('schema has too many required keys');
  for (const name of required) {
    if (typeof name !== 'string' || !KEY_PATTERN.test(name)) throw schemaError('required entry is not a valid key');
  }
  for (const [name, rule] of normalized.entries()) if (rule.required === true) required.add(name);
  return { rules: normalized, required, allowUnknown: schema.allowUnknown === true };
}

function checkValue(value, rule) {
  if (rule.type === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) return 'is shorter than minLength';
    if (rule.maxLength !== undefined && value.length > rule.maxLength) return 'is longer than maxLength';
    if (rule.compiledPattern && !rule.compiledPattern.test(value)) return 'does not match the required pattern';
    return null;
  }
  if (rule.type === 'integer') {
    if (!INTEGER_PATTERN.test(value)) return 'is not a strict integer';
    const number = Number(value);
    if (!Number.isSafeInteger(number)) return 'is outside the safe integer range';
    if (rule.min !== undefined && number < rule.min) return 'is below the minimum';
    if (rule.max !== undefined && number > rule.max) return 'is above the maximum';
    return null;
  }
  if (rule.type === 'number') {
    if (!NUMBER_PATTERN.test(value)) return 'is not a strict finite number';
    const number = Number(value);
    if (!Number.isFinite(number)) return 'is not finite';
    if (rule.min !== undefined && number < rule.min) return 'is below the minimum';
    if (rule.max !== undefined && number > rule.max) return 'is above the maximum';
    return null;
  }
  if (rule.type === 'boolean') {
    return value === 'true' || value === 'false' ? null : 'is not exactly true or false';
  }
  if (rule.type === 'enum') {
    return rule.values.includes(value) ? null : 'is not one of the allowed enum values';
  }
  if (rule.type === 'url') {
    let parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      return 'is not an absolute URL';
    }
    if (Array.isArray(rule.protocols) && !rule.protocols.includes(parsed.protocol)) return 'uses a disallowed URL protocol';
    return null;
  }
  if (rule.type === 'json') {
    if (value.length > 8192) return 'JSON value is too large';
    try {
      JSON.parse(value);
    } catch (error) {
      return 'is not valid JSON';
    }
    return null;
  }
  if (rule.type === 'secret') {
    const min = rule.minLength === undefined ? 12 : rule.minLength;
    if (value.length < min) return 'is shorter than the secret minimum';
    if (/\s/.test(value)) return 'contains whitespace';
    if (/^<.*>$/.test(value) || /^paste-/i.test(value) || /^replace-/i.test(value)) return 'appears to be a placeholder';
    return null;
  }
  return 'has an unknown type';
}

export function validateSchema(values, schema) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw invalidArgument('values must be an object');
  const normalized = normalizeSchema(schema);
  const findings = [];
  for (const key of Object.keys(values)) {
    if (!normalized.rules.has(key) && !normalized.allowUnknown) {
      findings.push(makeFinding(ERROR_CODES.SCHEMA_VIOLATION, 'error', 'unknown key is not allowed by the strict schema', { key }));
    }
  }
  for (const key of normalized.required) {
    if (!Object.prototype.hasOwnProperty.call(values, key) || values[key] === '') {
      findings.push(makeFinding(ERROR_CODES.SCHEMA_VIOLATION, 'error', 'required key is missing or empty', { key }));
    }
  }
  for (const [key, rule] of normalized.rules.entries()) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    const value = values[key];
    if (typeof value !== 'string') {
      findings.push(makeFinding(ERROR_CODES.SCHEMA_VIOLATION, 'error', 'value is not a string', { key }));
      continue;
    }
    if (value === '' && rule.allowEmpty === true) continue;
    const problem = checkValue(value, rule);
    if (problem) findings.push(makeFinding(ERROR_CODES.SCHEMA_VIOLATION, 'error', key + ' ' + problem, { key }));
  }
  if (findings.length > 0) {
    throw new DotenvCageError(ERROR_CODES.SCHEMA_VIOLATION, findings[0].message, { key: findings[0].key, findings });
  }
  return Object.freeze({ ok: true, validatedKeys: normalized.rules.size });
}
