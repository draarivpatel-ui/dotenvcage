import { auditDotenv, redactDotenv } from 'dotenvcage';

const source = [
  '# local application settings',
  'PORT=8080',
  'NODE_OPTIONS=--require=evil',
].join('\n');

const report = auditDotenv(source, { context: 'committed' });
for (const finding of report.findings) {
  console.log(finding.line, finding.severity, finding.code, finding.key || '-');
}

console.log(redactDotenv(source));
