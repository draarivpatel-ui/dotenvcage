const { invalidArgument } = require('./errors.cjs');
const { parseDotenv } = require('./parser.cjs');

function valuesFrom(input, options) {
  if (typeof input === 'string' || input instanceof Uint8Array) return parseDotenv(input, options).values;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (input.values && typeof input.values === 'object') return input.values;
    return input;
  }
  throw invalidArgument('diff inputs must be dotenv content, parse results, or values objects');
}

function diffDotenv(leftInput, rightInput, options = {}) {
  const left = valuesFrom(leftInput, options);
  const right = valuesFrom(rightInput, options);
  const redacted = options.redact !== false;
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  const keys = Array.from(new Set(Object.keys(left).concat(Object.keys(right)))).sort();
  for (const key of keys) {
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);
    if (hasLeft && !hasRight) removed.push(key);
    else if (!hasLeft && hasRight) added.push(key);
    else if (left[key] === right[key]) unchanged.push(key);
    else {
      const item = { key };
      if (redacted) {
        item.left = '<redacted>';
        item.right = '<redacted>';
      } else {
        item.left = left[key];
        item.right = right[key];
      }
      changed.push(Object.freeze(item));
    }
  }
  return Object.freeze({
    same: added.length === 0 && removed.length === 0 && changed.length === 0,
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    changed: Object.freeze(changed),
    unchanged: Object.freeze(unchanged),
    redacted,
  });
}

exports.diffDotenv = diffDotenv;
