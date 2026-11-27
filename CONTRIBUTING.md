# Contributing

Contributions are welcome once the public repository is open.

## Local verification

Run these commands before sending a change:

```sh
npm test
node scripts/build-cjs.mjs --check
node scripts/check-types.mjs
node scripts/cli-smoke.mjs
node scripts/check-pack.mjs
```

The project has zero runtime dependencies. `fast-check` is the only development dependency and is used only for property-based fuzz tests.

## Rules for security changes

- Add regression tests for every rejected malicious input and every accepted benign input.
- Keep failure closed: ambiguous input must not reach `process.env`.
- Never commit live tokens, private keys, passwords, or realistic test secrets. Build detector fixtures by concatenating fragments in tests.
- Keep generated CommonJS files in `cjs/` synchronized with `src/` using `node scripts/build-cjs.mjs`.
