import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const declaration = fs.readFileSync(path.join(root, 'types', 'index.d.ts'), 'utf8');
if (/(:|=>)\s*any\b|\bas\s+any\b|\bArray<\s*any\s*>|\bany\s*\[\s*\]/u.test(declaration)) {
  console.error('types/index.d.ts must not use an explicit any type');
  process.exit(1);
}
for (const required of ['parseDotenv', 'auditDotenv', 'safeLoad', 'redactDotenv', 'diffDotenv', 'validateSchema', 'DotenvCageError']) {
  if (!declaration.includes(required)) {
    console.error('types/index.d.ts does not declare ' + required);
    process.exit(1);
  }
}

const command = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
const probe = spawnSync(command, ['--version'], { encoding: 'utf8', shell: false, windowsHide: true });
if (probe.error || probe.status !== 0) {
  console.log('strict type check skipped: tsc is not installed');
  process.exitCode = 0;
} else {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvcage-types-'));
  try {
    fs.copyFileSync(path.join(root, 'types', 'index.d.ts'), path.join(scratch, 'index.d.ts'));
    fs.writeFileSync(path.join(scratch, 'check.ts'), [
      'import {',
      '  auditDotenv,',
      '  diffDotenv,',
      '  DotenvCageError,',
      '  parseDotenv,',
      '  redactDotenv,',
      '  safeLoad,',
      '  validateSchema,',
      '  VERSION,',
      '} from "./index";',
      'const version: "1.0.0" = VERSION;',
      'const parsed = parseDotenv("A=1", { expand: true });',
      'const audit = auditDotenv("A=1", { context: "committed" });',
      'const diff = diffDotenv("A=1", "A=2");',
      'const redacted: string = redactDotenv("A=secret");',
      'const schema = validateSchema({ PORT: "443" }, { keys: { PORT: { type: "integer", min: 1, max: 65535 } }, required: ["PORT"] });',
      'const target: Record<string, string | undefined> = {};',
      'const loaded = safeLoad("A=1", { target, expand: true });',
      'const err = new DotenvCageError("X", "x");',
      'if (audit.ok && schema.ok && loaded.ok && !diff.same) {',
      '  console.log(version, parsed.values.A, redacted, err.code);',
      '}',
    ].join('\n'), 'utf8');
    const result = spawnSync(command, ['--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', 'check.ts'], { cwd: scratch, encoding: 'utf8', shell: false, windowsHide: true });
    if (result.status !== 0) {
      process.stderr.write(result.stderr + result.stdout);
      process.exitCode = 1;
    } else {
      console.log('strict type check ok');
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
