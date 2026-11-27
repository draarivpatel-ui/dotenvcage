import { BIDI_CODEPOINTS, DANGEROUS_RUNTIME_KEYS, PROTOTYPE_KEYS, ZERO_WIDTH_CODEPOINTS } from './constants.mjs';
import { ERROR_CODES, makeFinding } from './errors.mjs';

const dangerousSet = new Set(DANGEROUS_RUNTIME_KEYS);
const prototypeSet = new Set(PROTOTYPE_KEYS.map((key) => key.toLowerCase()));
const bidiSet = new Set(BIDI_CODEPOINTS);
const zeroWidthSet = new Set(ZERO_WIDTH_CODEPOINTS);

export function isDangerousRuntimeKey(key) {
  return dangerousSet.has(String(key).toUpperCase());
}

export function isPrototypeKey(key) {
  const text = String(key).toLowerCase();
  return prototypeSet.has(text) || (text.startsWith('__') && text.endsWith('__') && text.length > 4);
}

export function keyFindings(key, line, options = {}) {
  const findings = [];
  const allowed = options.allowRuntimeKeys === true || (Array.isArray(options.allowRuntimeKeys) && options.allowRuntimeKeys.includes(key));
  if (isPrototypeKey(key)) {
    findings.push(makeFinding(ERROR_CODES.PROTOTYPE_KEY, 'error', 'key can mutate object prototypes or runtime introspection surfaces', { key, line }));
  }
  if (!allowed && isDangerousRuntimeKey(key)) {
    findings.push(makeFinding(ERROR_CODES.DANGEROUS_KEY, 'error', 'key can alter loader, runtime, or shell execution behavior', { key, line }));
  }
  return findings;
}

export function scanRawLineSecurity(line, lineNumber) {
  const findings = [];
  if (line.includes('$' + '(')) {
    findings.push(makeFinding(ERROR_CODES.COMMAND_SUBSTITUTION, 'error', 'shell command substitution marker is forbidden', { line: lineNumber }));
  }
  if (line.includes('`')) {
    findings.push(makeFinding(ERROR_CODES.COMMAND_SUBSTITUTION, 'error', 'backtick command substitution is forbidden', { line: lineNumber }));
  }
  for (let index = 0; index < line.length; index += 1) {
    const cp = line.codePointAt(index);
    if (cp > 0xffff) index += 1;
    if (bidiSet.has(cp)) {
      findings.push(makeFinding(ERROR_CODES.BIDI_CONTROL, 'error', 'bidirectional Unicode control is forbidden', { line: lineNumber }));
    } else if (zeroWidthSet.has(cp)) {
      findings.push(makeFinding(ERROR_CODES.UNICODE_SMUGGLING, 'error', 'zero-width Unicode formatting is forbidden', { line: lineNumber }));
    } else if ((cp >= 0 && cp < 32) || (cp >= 127 && cp <= 159)) {
      findings.push(makeFinding(ERROR_CODES.CONTROL_CHARACTER, 'error', 'raw control character is forbidden', { line: lineNumber }));
    }
  }
  return findings;
}

export function scanValueSecurity(value, key, line, options = {}) {
  const findings = [];
  if (value.includes('$' + '(') || value.includes('`')) {
    findings.push(makeFinding(ERROR_CODES.COMMAND_SUBSTITUTION, 'error', 'expanded or literal shell command substitution is forbidden', { key, line }));
  }
  for (let index = 0; index < value.length; index += 1) {
    const cp = value.codePointAt(index);
    if (cp > 0xffff) index += 1;
    if (bidiSet.has(cp)) {
      findings.push(makeFinding(ERROR_CODES.BIDI_CONTROL, 'error', 'value contains a bidirectional Unicode control', { key, line }));
    } else if (zeroWidthSet.has(cp)) {
      findings.push(makeFinding(ERROR_CODES.UNICODE_SMUGGLING, 'error', 'value contains zero-width Unicode formatting', { key, line }));
    } else if ((cp >= 0 && cp < 32) || (cp >= 127 && cp <= 159)) {
      const allowedNewline = cp === 10 && options.allowMultiline === true;
      if (!allowedNewline) {
        findings.push(makeFinding(ERROR_CODES.CONTROL_CHARACTER, 'error', 'value contains a control character', { key, line }));
      }
    }
  }
  return findings;
}

function compactPrefix(parts) {
  return parts.map((part) => String.fromCharCode(...part)).join('');
}

const awsPrefixA = compactPrefix([[0x41, 0x4b, 0x49, 0x41]]);
const awsPrefixB = compactPrefix([[0x41, 0x53, 0x49, 0x41]]);
const githubPrefixA = compactPrefix([[0x67, 0x68, 0x70, 0x5f]]);
const githubPrefixB = compactPrefix([[0x67, 0x69, 0x74, 0x68, 0x75, 0x62, 0x5f, 0x70, 0x61, 0x74, 0x5f]]);
const stripePrefixA = compactPrefix([[0x73, 0x6b, 0x5f]]);
const stripePrefixB = compactPrefix([[0x72, 0x6b, 0x5f]]);
const jwtPrefix = compactPrefix([[0x65, 0x79, 0x4a]]);

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const awsPattern = new RegExp('\\b(?:' + escaped(awsPrefixA) + '|' + escaped(awsPrefixB) + ')[0-9A-Z]{16}\\b');
const githubPattern = new RegExp('\\b(?:' + escaped(githubPrefixA) + '[A-Za-z0-9]{30,}|' + escaped(githubPrefixB) + '[A-Za-z0-9_]{20,}|gh[ousr]_[A-Za-z0-9]{20,})\\b');
const stripePattern = new RegExp('\\b(?:' + escaped(stripePrefixA) + '|' + escaped(stripePrefixB) + ')(?:live|test)_[A-Za-z0-9]{12,}\\b');
const jwtPattern = new RegExp('\\b' + escaped(jwtPrefix) + '[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{8,}\\b');
const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/;
const credentialUrlPattern = /(?:^|\s)[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/?#]+:[^\s/?#@]+@/;

export function detectSecretKinds(value) {
  const text = String(value);
  const kinds = [];
  if (awsPattern.test(text)) kinds.push('aws-access-key');
  if (githubPattern.test(text)) kinds.push('github-token');
  if (stripePattern.test(text)) kinds.push('stripe-key');
  if (privateKeyPattern.test(text)) kinds.push('private-key');
  if (jwtPattern.test(text)) kinds.push('jwt');
  if (credentialUrlPattern.test(text)) kinds.push('database-url-with-password');
  return kinds;
}
