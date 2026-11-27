# dotenvcage

Zero-dependency strict dotenv security firewall for Node.js 18 and newer.

dotenvcage parses `.env` content as hostile input. It blocks shell command substitution, runtime loader hijacking keys, duplicate key shadowing, silent process environment replacement, malformed quoting, unbounded expansion work, circular `${VAR}` references, control characters, bidirectional Unicode controls, and secret material leaked into example or committed files.

## Install

```sh
npm install dotenvcage
```

Node.js 18 or newer is required. There are no runtime dependencies.

## Quick start

```js
import { parseDotenv, safeLoad } from 'dotenvcage';

const parsed = parseDotenv('PORT=8080\nHOST=localhost\n');
console.log(parsed.values.PORT);

const result = safeLoad('PORT=8080\n', {
  override: false,
  schema: {
    required: ['PORT'],
    keys: {
      PORT: { type: 'integer', min: 1, max: 65535 },
    },
  },
});
console.log(result.loaded, result.skipped);
```

`safeLoad` is transactional. The file is parsed, security checked, expanded, and schema validated before any key is written. `override` is `false` by default, so existing process environment keys are skipped and reported rather than silently replaced.

## API

### `parseDotenv(input, options)`

Parses a string or UTF-8 bytes and returns frozen parse metadata:

- `values`: first-value key mapping after bounded expansion.
- `entries`: key, value, quote style, line, and export metadata.
- `references`: variable expansion references by key.

It throws `DotenvCageError` on the first error and attaches the full `findings` list.

### `auditDotenv(input, options)`

Returns a report instead of throwing:

```js
import { auditDotenv } from 'dotenvcage';

const report = auditDotenv(source, { context: 'example' });
if (!report.ok) console.error(report.findings);
```

Contexts are `runtime`, `example`, and `committed`. Secret-shaped values are warnings in runtime context because real local secrets are expected there. They are errors in example and committed contexts.

### `safeLoad(inputOrPath, options)`

Loads values into `process.env` or a caller-supplied `target` object. Input is content by default. Pass `{ inputType: 'path' }` or `{ path }` to read a file.

```js
safeLoad('.env.production', {
  inputType: 'path',
  override: false,
  onExisting: 'error',
  schema,
});
```

`onExisting: 'error'` makes pre-existing keys a hard failure. The default is `skip`. File input is opened without following symlinks, must be a regular file, and is read under the same byte limit as string input. Directories, FIFOs, devices, symlinks, and oversize files fail closed.

### `redactDotenv(input, options)`

Redacts assignment values while preserving comments and unassigned lines. String input returns a redacted string. A values object returns a redacted values object. Multiline quoted payloads are removed rather than partially leaked.

### `diffDotenv(left, right, options)`

Compares two dotenv sources, parse results, or values objects. Values are redacted by default without hash fingerprints or lengths that could confirm secret guesses. Pass `{ redact: false }` only when exposing values is safe.

### `validateSchema(values, schema)`

Strict typed validation for required and optional keys. Supported types are `string`, `integer`, `number`, `boolean`, `enum`, `url`, `json`, and `secret`. Unknown keys are rejected unless `allowUnknown: true`.

## Security behavior

The strict parser rejects or reports:

- `$(` and backtick shell substitution markers.
- Loader, shell, version-control, and runtime control keys such as `PATH`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `NODE_OPTIONS`, `PYTHONPATH`, `BASH_ENV`, `PROMPT_COMMAND`, `IFS`, and `GIT_SSH_COMMAND`.
- Prototype and introspection keys such as `__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, and dunder-form keys.
- Duplicate keys, including later shadowing attempts and case variants that collide on case-insensitive platforms.
- Raw control characters, NUL bytes, carriage-return smuggling, bidirectional controls, and zero-width formatting.
- Unterminated quotes, unsupported escapes, trailing content after a quote, and multiline values unless `allowMultiline: true`.
- Undefined, malformed, circular, too-deep, too-large, or too-frequent variable expansion.
- Secret-shaped cloud keys, repository tokens, payment keys, private keys, JWTs, and database URLs with embedded passwords when auditing.

Expansion is bounded and enabled by default. Only braced `${NAME}` references expand. Use `\${NAME}` for a literal reference. Backslash escaping follows parity: an odd number of backslashes keeps the reference literal, while an even number preserves the backslashes and expands the reference. External expansion values are not read from the real process environment unless supplied through `expansionEnv`.

## Parser dialect

Accepted lines are blank lines, comments, and strict assignments:

```dotenv
# comment
PORT=8080
HOST="localhost"
export MODE=production
```

Keys must match `[A-Za-z_][A-Za-z0-9_]*`. Unquoted values may contain spaces and use ` #` for an inline comment. Single quotes are literal. Double quotes support `\\`, `\"`, `\'`, `\$`, `\n`, `\r`, and `\t` escapes, but decoded control characters are rejected unless the relevant bounded multiline behavior is explicitly enabled.

CRLF line endings are accepted as line endings. Bare carriage returns are rejected. Input is bounded to 64 KiB, 1024 lines, 256 assignments, 128-byte keys, and 8192-byte values by default. Limits can be tightened through `options.limits`; they cannot be disabled.

## CLI

```sh
dotenvcage audit .env --committed
dotenvcage parse .env
dotenvcage redact .env
dotenvcage diff .env .env.production
dotenvcage validate .env --schema schema.json
```

`parse` and `diff` redact values unless `--show-values` is explicitly passed. Audit exits 1 when errors are present. Usage errors exit 2.

## CommonJS and TypeScript

```js
const { parseDotenv } = require('dotenvcage');
```

TypeScript declarations are included. ESM, CommonJS, and type exports are part of the package contract.

## Examples

See `examples/basic-load.mjs`, `examples/audit-and-redact.mjs`, and `examples/schema-and-diff.mjs`.

## License

MIT
