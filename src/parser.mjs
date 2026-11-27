import { DEFAULT_LIMITS } from './constants.mjs';
import { ERROR_CODES, makeFinding, throwFirstError } from './errors.mjs';
import { keyFindings, scanRawLineSecurity, scanValueSecurity } from './security.mjs';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LINE_PATTERN = /^ *(export +)?([A-Za-z_][A-Za-z0-9_]*) *= *(.*)$/;

function byteLength(text) {
  return Buffer.byteLength(text, 'utf8');
}

function addFinding(findings, finding, limits) {
  if (findings.length < limits.maxFindings) findings.push(finding);
}

function mergeLimits(options) {
  const limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('limit ' + key + ' must be a positive safe integer');
  }
  return limits;
}

function decodeInput(input, limits, findings) {
  let bytes = 0;
  let text = null;
  if (typeof input === 'string') {
    bytes = byteLength(input);
    text = input;
  } else if (input instanceof Uint8Array) {
    bytes = input.byteLength;
    if (bytes <= limits.maxBytes) {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(input);
      } catch (error) {
        addFinding(findings, makeFinding(ERROR_CODES.INVALID_ENCODING, 'error', 'input is not valid UTF-8'), limits);
      }
    }
  } else {
    addFinding(findings, makeFinding(ERROR_CODES.INVALID_INPUT, 'error', 'input must be a string or UTF-8 bytes'), limits);
    return null;
  }
  if (bytes > limits.maxBytes) {
    addFinding(findings, makeFinding(ERROR_CODES.INPUT_TOO_LARGE, 'error', 'input exceeds the bounded byte limit'), limits);
    return null;
  }
  return text;
}

function isCommentTerminator(rest, index) {
  return rest[index] === '#' && (index === 0 || rest[index - 1] === ' ');
}

function parseUnquoted(rest) {
  let end = rest.length;
  for (let index = 0; index < rest.length; index += 1) {
    if (isCommentTerminator(rest, index)) {
      end = index;
      break;
    }
  }
  return rest.slice(0, end).replace(/ +$/, '');
}

function trailingIsClean(trailing) {
  return /^ *(#.*)?$/.test(trailing);
}

function parseQuoted(lines, startIndex, startColumn, quote, findings, limits) {
  let value = '';
  let rawValue = '';
  let lineIndex = startIndex;
  let column = startColumn;
  let closed = false;
  let trailing = '';
  let invalidEscapeReported = false;

  while (lineIndex < lines.length && !closed) {
    const line = lines[lineIndex];
    while (column < line.length) {
      const ch = line[column];
      if (ch === quote) {
        closed = true;
        trailing = line.slice(column + 1);
        column += 1;
        break;
      }
      if (quote === '"' && ch === '\\') {
        if (column + 1 >= line.length) {
          if (!invalidEscapeReported) {
            addFinding(findings, makeFinding(ERROR_CODES.INVALID_ESCAPE, 'error', 'escape character ends a line', { line: lineIndex + 1 }), limits);
            invalidEscapeReported = true;
          }
          value += '\\';
          rawValue += '\\';
          column += 1;
          continue;
        }
        const next = line[column + 1];
        const escapes = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'", $: '\\$' };
        if (!Object.prototype.hasOwnProperty.call(escapes, next)) {
          if (!invalidEscapeReported) {
            addFinding(findings, makeFinding(ERROR_CODES.INVALID_ESCAPE, 'error', 'unsupported escape sequence in double-quoted value', { line: lineIndex + 1 }), limits);
            invalidEscapeReported = true;
          }
        } else {
          value += escapes[next];
        }
        rawValue += ch + next;
        column += 2;
        continue;
      }
      value += ch;
      rawValue += ch;
      column += 1;
    }
    if (!closed) {
      if (lineIndex + 1 >= lines.length) break;
      value += '\n';
      rawValue += '\n';
      lineIndex += 1;
      column = 0;
    }
  }

  return { value, rawValue, closed, trailing, endIndex: lineIndex, endLine: lineIndex + 1 };
}

function extractReferences(value, key, line, findings, limits) {
  const references = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '$' || value[index + 1] !== '{') continue;
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
    if (slashes % 2 === 1) continue;
    const close = value.indexOf('}', index + 2);
    if (close === -1) {
      addFinding(findings, makeFinding(ERROR_CODES.INVALID_EXPANSION, 'error', 'unclosed variable expansion reference', { key, line }), limits);
      continue;
    }
    const name = value.slice(index + 2, close);
    if (!KEY_PATTERN.test(name)) {
      addFinding(findings, makeFinding(ERROR_CODES.INVALID_EXPANSION, 'error', 'variable expansion reference is not a valid key', { key, line }), limits);
    } else if (!seen.has(name)) {
      seen.add(name);
      references.push(name);
    }
  }
  return references;
}

function substituteReferences(value, resolver, maxBytes) {
  let output = '';
  let outputBytes = 0;
  let exceeded = false;
  const append = (part) => {
    if (exceeded) return;
    outputBytes += byteLength(part);
    if (outputBytes > maxBytes) {
      exceeded = true;
      output = '';
      return;
    }
    output += part;
  };
  let index = 0;
  while (index < value.length && !exceeded) {
    if (value[index] === '\\') {
      let slashEnd = index;
      while (value[slashEnd] === '\\') slashEnd += 1;
      const slashCount = slashEnd - index;
      if (value[slashEnd] === '$' && value[slashEnd + 1] === '{') {
        const close = value.indexOf('}', slashEnd + 2);
        const name = close === -1 ? '' : value.slice(slashEnd + 2, close);
        if (close !== -1 && KEY_PATTERN.test(name)) {
          if (slashCount % 2 === 1) {
            append('\\'.repeat(slashCount - 1) + value.slice(slashEnd, close + 1));
            index = close + 1;
          } else {
            append('\\'.repeat(slashCount));
            index = slashEnd;
          }
          continue;
        }
      }
      append(value.slice(index, slashEnd));
      index = slashEnd;
      continue;
    }
    if (value[index] === '$' && value[index + 1] === '{') {
      const close = value.indexOf('}', index + 2);
      if (close !== -1) {
        const name = value.slice(index + 2, close);
        if (KEY_PATTERN.test(name)) {
          append(resolver(name));
          index = close + 1;
          continue;
        }
      }
    }
    append(value[index]);
    index += 1;
  }
  return { output, exceeded };
}

function expansionAnalysis(entries, options, limits, findings) {
  const rawValues = new Map();
  const references = new Map();
  for (const entry of entries) {
    if (!rawValues.has(entry.key)) rawValues.set(entry.key, entry.value);
    references.set(entry.key, extractReferences(entry.value, entry.key, entry.line, findings, limits));
  }

  const state = new Map();
  const reportedCycles = new Set();
  const visit = (key, path) => {
    const mark = state.get(key);
    if (mark === 'done') return;
    if (mark === 'visiting') {
      const start = path.indexOf(key);
      const cycle = path.slice(start).concat(key);
      const label = cycle.slice().sort().join('|');
      if (!reportedCycles.has(label)) {
        reportedCycles.add(label);
        addFinding(findings, makeFinding(ERROR_CODES.EXPANSION_CIRCULAR, 'error', 'circular variable expansion reference: ' + cycle.join(' -> '), { key, line: entries.find((entry) => entry.key === key)?.line || null }), limits);
      }
      return;
    }
    state.set(key, 'visiting');
    const nextPath = path.concat(key);
    for (const reference of references.get(key) || []) {
      if (rawValues.has(reference)) visit(reference, nextPath);
    }
    state.set(key, 'done');
  };
  for (const key of rawValues.keys()) visit(key, []);
  if (reportedCycles.size > 0) return { references, expanded: new Map(), circular: true };

  const external = options.expansionEnv && typeof options.expansionEnv === 'object' ? options.expansionEnv : {};
  const undefinedReported = new Set();
  for (const [key, refs] of references.entries()) {
    for (const reference of refs) {
      if (!rawValues.has(reference) && !Object.prototype.hasOwnProperty.call(external, reference)) {
        const label = key + '|' + reference;
        if (!undefinedReported.has(label)) {
          undefinedReported.add(label);
          addFinding(findings, makeFinding(ERROR_CODES.EXPANSION_UNDEFINED, 'error', 'variable expansion reference is undefined: ' + reference, { key, line: entries.find((entry) => entry.key === key)?.line || null }), limits);
        }
      }
    }
  }

  const expanded = new Map();
  if (options.expand === false || undefinedReported.size > 0) return { references, expanded, circular: false };
  const memo = new Map();
  const steps = { count: 0 };
  const tooDeep = new Set();
  const tooLarge = new Set();
  const expandKey = (key, depth) => {
    if (memo.has(key)) return memo.get(key);
    if (depth > limits.maxExpansionDepth) {
      if (!tooDeep.has(key)) {
        tooDeep.add(key);
        addFinding(findings, makeFinding(ERROR_CODES.EXPANSION_TOO_DEEP, 'error', 'variable expansion exceeds the bounded depth', { key, line: entries.find((entry) => entry.key === key)?.line || null }), limits);
      }
      return '';
    }
    steps.count += 1;
    if (steps.count > limits.maxExpansionSteps) {
      addFinding(findings, makeFinding(ERROR_CODES.EXPANSION_TOO_LARGE, 'error', 'variable expansion exceeds the bounded step count', { key, line: entries.find((entry) => entry.key === key)?.line || null }), limits);
      return '';
    }
    const source = rawValues.get(key) || '';
    const substituted = substituteReferences(source, (reference) => {
      if (rawValues.has(reference)) return expandKey(reference, depth + 1);
      return Object.prototype.hasOwnProperty.call(external, reference) ? String(external[reference]) : '${' + reference + '}';
    }, limits.maxExpandedLength);
    const output = substituted.output;
    if ((substituted.exceeded || byteLength(output) > limits.maxExpandedLength) && !tooLarge.has(key)) {
      tooLarge.add(key);
      addFinding(findings, makeFinding(ERROR_CODES.EXPANSION_TOO_LARGE, 'error', 'variable expansion exceeds the bounded output length', { key, line: entries.find((entry) => entry.key === key)?.line || null }), limits);
    }
    memo.set(key, output);
    return output;
  };

  for (const key of rawValues.keys()) expanded.set(key, expandKey(key, 0));
  return { references, expanded, circular: false };
}

export function scanDotenv(input, options = {}) {
  const limits = mergeLimits(options);
  const findings = [];
  const entries = [];
  let text = decodeInput(input, limits, findings);
  if (text === null) return { entries, values: Object.create(null), references: new Map(), findings };

  if (options.allowBom !== false && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\r' && text[index + 1] !== '\n') {
      addFinding(findings, makeFinding(ERROR_CODES.CR_LINE_ENDING, 'error', 'bare carriage return line ending or smuggled carriage return is forbidden'), limits);
      break;
    }
  }
  const rawLines = text.split('\n');
  if (rawLines.length > limits.maxLines) {
    addFinding(findings, makeFinding(ERROR_CODES.INPUT_TOO_LARGE, 'error', 'input exceeds the bounded line count'), limits);
  }
  const lines = rawLines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  for (let index = 0; index < lines.length; index += 1) {
    for (const finding of scanRawLineSecurity(lines[index], index + 1)) addFinding(findings, finding, limits);
  }

  const seenKeys = new Map();
  const seenKeyFold = new Map();
  let entryCount = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const line = lines[lineIndex];
    if (/^ *$/.test(line) || /^ *#/.test(line)) continue;
    const match = LINE_PATTERN.exec(line);
    if (!match) {
      addFinding(findings, makeFinding(ERROR_CODES.INVALID_LINE, 'error', 'line is not a strict KEY=value assignment or comment', { line: lineNumber }), limits);
      continue;
    }
    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      addFinding(findings, makeFinding(ERROR_CODES.INPUT_TOO_LARGE, 'error', 'input exceeds the bounded assignment count', { line: lineNumber }), limits);
      continue;
    }
    const exported = match[1] !== undefined;
    const key = match[2];
    const rest = match[3];
    if (byteLength(key) > limits.maxKeyLength) {
      addFinding(findings, makeFinding(ERROR_CODES.INVALID_KEY, 'error', 'key exceeds the bounded length', { key, line: lineNumber }), limits);
    }
    for (const finding of keyFindings(key, lineNumber, options)) addFinding(findings, finding, limits);
    const keyFold = key.toUpperCase();
    if (seenKeys.has(key)) {
      addFinding(findings, makeFinding(ERROR_CODES.DUPLICATE_KEY, 'error', 'duplicate key shadows an earlier assignment', { key, line: lineNumber }), limits);
    } else if (seenKeyFold.has(keyFold)) {
      addFinding(findings, makeFinding(ERROR_CODES.DUPLICATE_KEY, 'error', 'case-variant key shadows an earlier assignment on case-insensitive platforms', { key, line: lineNumber }), limits);
    } else {
      seenKeys.set(key, lineNumber);
      seenKeyFold.set(keyFold, lineNumber);
    }

    let value = '';
    let rawValue = '';
    let quote = 'none';
    let endIndex = lineIndex;
    let endLine = lineNumber;
    if (rest[0] === "'" || rest[0] === '"') {
      quote = rest[0] === "'" ? 'single' : 'double';
      const parsed = parseQuoted(lines, lineIndex, line.length - rest.length + 1, rest[0], findings, limits);
      value = parsed.value;
      rawValue = parsed.rawValue;
      endIndex = parsed.endIndex;
      endLine = parsed.endLine;
      if (!parsed.closed) {
        addFinding(findings, makeFinding(ERROR_CODES.QUOTE_SYNTAX, 'error', 'quoted value is not closed', { key, line: lineNumber }), limits);
      }
      if (endIndex !== lineIndex && options.allowMultiline !== true) {
        addFinding(findings, makeFinding(ERROR_CODES.MULTILINE_VALUE, 'error', 'multiline values are disabled by default', { key, line: lineNumber }), limits);
      }
      if (!trailingIsClean(parsed.trailing)) {
        addFinding(findings, makeFinding(ERROR_CODES.QUOTE_SYNTAX, 'error', 'unexpected content after a closed quoted value', { key, line: lineNumber }), limits);
      }
    } else {
      value = parseUnquoted(rest);
      rawValue = value;
    }
    if (byteLength(value) > limits.maxValueLength) {
      addFinding(findings, makeFinding(ERROR_CODES.INPUT_TOO_LARGE, 'error', 'value exceeds the bounded length', { key, line: lineNumber }), limits);
    }
    for (const finding of scanValueSecurity(value, key, lineNumber, options)) addFinding(findings, finding, limits);
    entries.push(Object.freeze({ key, value, rawValue, line: lineNumber, endLine, quote, exported }));
    lineIndex = endIndex;
  }

  const expansion = expansionAnalysis(entries, options, limits, findings);
  const values = Object.create(null);
  const firstValues = new Map();
  for (const entry of entries) {
    if (!firstValues.has(entry.key)) firstValues.set(entry.key, entry);
  }
  for (const [key, entry] of firstValues.entries()) {
    let finalValue = entry.value;
    if (options.expand !== false && expansion.expanded.has(key)) finalValue = expansion.expanded.get(key);
    if (finalValue !== entry.value) {
      for (const finding of scanValueSecurity(finalValue, key, entry.line, options)) addFinding(findings, finding, limits);
      if (byteLength(finalValue) > limits.maxExpandedLength) {
        addFinding(findings, makeFinding(ERROR_CODES.EXPANSION_TOO_LARGE, 'error', 'expanded value exceeds the bounded length', { key, line: entry.line }), limits);
      }
    }
    values[key] = finalValue;
  }

  return { entries, values, references: expansion.references, findings };
}

export function parseDotenv(input, options = {}) {
  const scanned = scanDotenv(input, options);
  throwFirstError(scanned.findings);
  return Object.freeze({
    values: scanned.values,
    entries: scanned.entries,
    references: scanned.references,
  });
}
