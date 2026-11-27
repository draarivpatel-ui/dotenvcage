import { invalidArgument } from './errors.mjs';

const ASSIGNMENT = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;
const DEFAULT_PLACEHOLDER = '<redacted>';

function splitUnquotedComment(rest) {
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '#' && (index === 0 || rest[index - 1] === ' ' || rest[index - 1] === '\t')) {
      return [rest.slice(0, index), rest.slice(index)];
    }
  }
  return [rest, ''];
}

function closesOnLine(text, quote, startIndex = 1) {
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] !== quote) continue;
    if (quote === "'") return true;
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashes += 1;
    if (slashes % 2 === 0) return true;
  }
  return false;
}

export function redactDotenv(input, options = {}) {
  const placeholder = options.placeholder === undefined ? DEFAULT_PLACEHOLDER : String(options.placeholder);
  if (placeholder.length === 0 || placeholder.length > 128) throw invalidArgument('placeholder must be 1 to 128 characters');
  if (input && typeof input === 'object' && !Array.isArray(input) && !(input instanceof Uint8Array)) {
    const output = Object.create(null);
    for (const [key, value] of Object.entries(input)) output[key] = value === '' ? '' : placeholder;
    return output;
  }
  if (input instanceof Uint8Array) input = new TextDecoder('utf-8', { fatal: false }).decode(input);
  if (typeof input !== 'string') throw invalidArgument('input must be a string, bytes, or values object');
  const lines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const output = [];
  let skipMultiline = false;
  let multilineQuote = null;
  for (const line of lines) {
    if (skipMultiline) {
      if (multilineQuote && closesOnLine(line, multilineQuote, 0)) skipMultiline = false;
      continue;
    }
    const match = ASSIGNMENT.exec(line);
    if (!match) {
      output.push(line);
      continue;
    }
    const prefix = match[1] + match[2] + match[3];
    const rest = match[4];
    if (rest.length === 0) {
      output.push(line);
      continue;
    }
    const first = rest[0];
    if (first === "'" || first === '"') {
      output.push(prefix + first + placeholder + first);
      if (!closesOnLine(rest, first)) {
        skipMultiline = true;
        multilineQuote = first;
      }
      continue;
    }
    const parts = splitUnquotedComment(rest);
    const value = parts[0].replace(/[ \t]+$/, '');
    const comment = parts[1];
    if (value.length === 0) output.push(prefix + comment);
    else output.push(prefix + placeholder + (comment ? ' ' + comment : ''));
  }
  return output.join('\n');
}
