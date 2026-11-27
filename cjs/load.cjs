const { ERROR_CODES, DotenvCageError, invalidArgument } = require('./errors.cjs');
const { readDotenvFileSecure } = require('./file.cjs');
const { parseDotenv } = require('./parser.cjs');
const { validateSchema } = require('./schema.cjs');

function readInput(input, options) {
  let path = options.path;
  if (input === undefined && path === undefined) path = '.env';
  if (options.inputType === 'path' && typeof input === 'string') path = input;
  if (path !== undefined) return readDotenvFileSecure(path, options);
  if (input === undefined) throw invalidArgument('input content or a path is required');
  return input;
}

function safeLoad(input, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw invalidArgument('options must be an object');
  const source = readInput(input, options);
  const parsed = parseDotenv(source, options);
  if (options.schema !== undefined) validateSchema(parsed.values, options.schema);
  const target = options.target === undefined ? process.env : options.target;
  if (!target || typeof target !== 'object') throw invalidArgument('target must be an object');
  const override = options.override === true;
  const onExisting = options.onExisting === undefined ? 'skip' : options.onExisting;
  if (onExisting !== 'skip' && onExisting !== 'error') throw invalidArgument('onExisting must be skip or error');

  const keys = Object.keys(parsed.values);
  const conflicts = keys.filter((key) => Object.prototype.hasOwnProperty.call(target, key));
  if (!override && onExisting === 'error' && conflicts.length > 0) {
    throw new DotenvCageError(ERROR_CODES.OVERRIDE_DENIED, 'existing process environment keys would be shadowed', { keys: conflicts });
  }

  const loaded = [];
  const skipped = [];
  const overridden = [];
  for (const key of keys) {
    const exists = Object.prototype.hasOwnProperty.call(target, key);
    if (exists && !override) {
      skipped.push(key);
      continue;
    }
    target[key] = parsed.values[key];
    if (exists) overridden.push(key);
    else loaded.push(key);
  }
  return Object.freeze({
    ok: true,
    count: keys.length,
    loaded: Object.freeze(loaded),
    skipped: Object.freeze(skipped),
    overridden: Object.freeze(overridden),
  });
}

exports.safeLoad = safeLoad;
