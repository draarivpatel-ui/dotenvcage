import { ERROR_CODES, firstError, makeFinding } from './errors.mjs';
import { scanDotenv } from './parser.mjs';
import { detectSecretKinds } from './security.mjs';

function secretSeverity(context) {
  return context === 'example' || context === 'committed' ? 'error' : 'warning';
}

export function auditDotenv(input, options = {}) {
  const scanned = scanDotenv(input, options);
  const findings = scanned.findings.slice();
  const context = options.context === undefined ? 'runtime' : options.context;
  if (options.detectSecrets !== false) {
    for (const entry of scanned.entries) {
      const candidate = Object.prototype.hasOwnProperty.call(scanned.values, entry.key) ? scanned.values[entry.key] : entry.value;
      const kinds = new Set(detectSecretKinds(entry.value));
      if (candidate !== entry.value) for (const kind of detectSecretKinds(candidate)) kinds.add(kind);
      if (kinds.size > 0) {
        findings.push(makeFinding(ERROR_CODES.SECRET_LIKE_VALUE, secretSeverity(context), 'value resembles committed secret material: ' + Array.from(kinds).join(', '), { key: entry.key, line: entry.line }));
      }
    }
  }
  findings.sort((a, b) => {
    const lineA = a.line === null ? 0 : a.line;
    const lineB = b.line === null ? 0 : b.line;
    if (lineA !== lineB) return lineA - lineB;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  const error = firstError(findings);
  return Object.freeze({
    ok: error === null,
    findings: Object.freeze(findings),
    errorCount: findings.filter((finding) => finding.severity === 'error').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    keys: Object.freeze(Array.from(new Set(scanned.entries.map((entry) => entry.key))).sort()),
    entryCount: scanned.entries.length,
    references: scanned.references,
  });
}
