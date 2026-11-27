import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'bin', 'dotenvcage.mjs');
const scratch = fs.mkdtempSync(join(os.tmpdir(), 'dotenvcage-cli-'));

function run(args, expectedStatus) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: process.env,
  });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, expectedStatus, 'dotenvcage ' + args.join(' ') + ' exited ' + result.status + ': ' + result.stderr + result.stdout);
  assert.equal(result.stderr.includes('/' + 'Users' + '/'), false);
  assert.equal(result.stdout.includes('/' + 'Users' + '/'), false);
  return result;
}

try {
  const envFile = join(scratch, 'safe.env');
  const leftFile = join(scratch, 'left.env');
  const rightFile = join(scratch, 'right.env');
  const schemaFile = join(scratch, 'schema.json');
  fs.writeFileSync(envFile, 'PORT=8080\nHOST=localhost\n', 'utf8');
  fs.writeFileSync(leftFile, 'A=1\nB=left\n', 'utf8');
  fs.writeFileSync(rightFile, 'A=1\nB=right\nC=3\n', 'utf8');
  fs.writeFileSync(schemaFile, JSON.stringify({ required: ['PORT'], keys: { PORT: { type: 'integer', min: 1, max: 65535 }, HOST: { type: 'string', minLength: 1 } } }), 'utf8');

  assert.match(run(['--version'], 0).stdout, /^dotenvcage 1\.0\.0\n?$/);
  const parsed = JSON.parse(run(['parse', envFile], 0).stdout);
  assert.equal(parsed.values.PORT, '<redacted>');
  const audit = JSON.parse(run(['audit', envFile, '--json'], 0).stdout);
  assert.equal(audit.ok, true);
  const validated = JSON.parse(run(['validate', envFile, '--schema', schemaFile], 0).stdout);
  assert.equal(validated.ok, true);
  const redacted = run(['redact', envFile], 0).stdout;
  assert.match(redacted, /PORT=<redacted>/);
  assert.equal(redacted.includes('8080'), false);
  const diff = JSON.parse(run(['diff', leftFile, rightFile], 1).stdout);
  assert.deepEqual(diff.added, ['C']);
  assert.equal(diff.changed[0].left, '<redacted>');
  const dangerousFile = join(scratch, 'dangerous.env');
  fs.writeFileSync(dangerousFile, 'NODE_OPTIONS=--require=/tmp/x\n', 'utf8');
  const badAudit = JSON.parse(run(['audit', dangerousFile, '--json'], 1).stdout);
  assert.equal(badAudit.findings.some((finding) => finding.code === 'DANGEROUS_KEY'), true);
  const invalidUtf8File = join(scratch, 'invalid.env');
  fs.writeFileSync(invalidUtf8File, Buffer.from([0x41, 0x3d, 0xff, 0x0a]));
  const invalidAudit = JSON.parse(run(['audit', invalidUtf8File, '--json'], 1).stdout);
  assert.equal(invalidAudit.findings.some((finding) => finding.code === 'INVALID_ENCODING'), true);
  assert.equal(run([], 2).status, 2);
  console.log('cli smoke tests passed');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
