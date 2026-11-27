#!/usr/bin/env node
import { auditDotenv, diffDotenv, DotenvCageError, parseDotenv, redactDotenv, validateSchema, VERSION } from '../src/index.mjs';
import { readDotenvFileSecure } from '../src/file.mjs';

function usage() {
  return [
    'usage:',
    '  dotenvcage audit <file> [--example|--committed] [--json]',
    '  dotenvcage parse <file> [--show-values] [--json]',
    '  dotenvcage redact <file> [--placeholder TEXT]',
    '  dotenvcage diff <left-file> <right-file> [--show-values] [--json]',
    '  dotenvcage validate <file> --schema <schema.json> [--json]',
    '  dotenvcage --version',
  ].join('\n');
}

function parseArgs(argv) {
  const out = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      out.positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === 'json' || key === 'example' || key === 'committed' || key === 'show-values') {
      out[key] = true;
      continue;
    }
    index += 1;
    if (index >= argv.length) throw new Error('missing value for --' + key);
    out[key] = argv[index];
  }
  return out;
}

function readInput(path) {
  if (!path) throw new Error('missing file path\n' + usage());
  return readDotenvFileSecure(path);
}

function emit(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function referenceObject(references) {
  const out = Object.create(null);
  for (const [key, refs] of references.entries()) out[key] = refs;
  return out;
}

function redactedValues(values) {
  const out = Object.create(null);
  for (const key of Object.keys(values)) out[key] = values[key] === '' ? '' : '<redacted>';
  return out;
}

function main(argv) {
  if (argv.length === 1 && argv[0] === '--version') {
    process.stdout.write('dotenvcage ' + VERSION + '\n');
    return 0;
  }
  if (argv.length === 0) {
    process.stderr.write(usage() + '\n');
    return 2;
  }
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (command === 'audit') {
    const input = readInput(args.positional[0]);
    const context = args.example ? 'example' : args.committed ? 'committed' : 'runtime';
    const result = auditDotenv(input, { context });
    const output = {
      ok: result.ok,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      entryCount: result.entryCount,
      keys: result.keys,
      findings: result.findings,
      references: referenceObject(result.references),
    };
    if (args.json) emit(output);
    else {
      for (const finding of result.findings) process.stdout.write((finding.line === null ? '-' : String(finding.line)) + ' ' + finding.severity + ' ' + finding.code + (finding.key ? ' ' + finding.key : '') + '\n');
      process.stdout.write(result.ok ? 'ok\n' : 'failed\n');
    }
    return result.ok ? 0 : 1;
  }

  if (command === 'parse') {
    const input = readInput(args.positional[0]);
    const result = parseDotenv(input);
    const values = args['show-values'] ? result.values : redactedValues(result.values);
    emit({ ok: true, values, keys: Object.keys(result.values).sort(), entries: result.entries.length });
    return 0;
  }

  if (command === 'redact') {
    const input = readInput(args.positional[0]);
    const options = {};
    if (args.placeholder !== undefined) options.placeholder = args.placeholder;
    process.stdout.write(redactDotenv(input, options));
    if (input.length === 0 || input[input.length - 1] !== 0x0a) process.stdout.write('\n');
    return 0;
  }

  if (command === 'diff') {
    if (!args.positional[0] || !args.positional[1]) throw new Error('diff requires two file paths\n' + usage());
    const left = readInput(args.positional[0]);
    const right = readInput(args.positional[1]);
    const result = diffDotenv(left, right, { redact: !args['show-values'] });
    emit(result);
    return result.same ? 0 : 1;
  }

  if (command === 'validate') {
    const input = readInput(args.positional[0]);
    if (!args.schema) throw new Error('validate requires --schema\n' + usage());
    const schema = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readInput(args.schema)));
    const parsed = parseDotenv(input);
    const result = validateSchema(parsed.values, schema);
    emit(result);
    return 0;
  }

  throw new Error('unknown command ' + command + '\n' + usage());
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof DotenvCageError) {
    emit({ ok: false, code: error.code, message: error.reason, line: error.line === undefined ? null : error.line, key: error.key === undefined ? null : error.key });
    process.exitCode = 1;
  } else {
    process.stderr.write((error && error.message ? error.message : String(error)) + '\n');
    process.exitCode = 2;
  }
}
