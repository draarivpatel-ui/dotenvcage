# Changelog

## 1.0.0

Initial local release candidate.

- Strict bounded dotenv parser with duplicate-key, quoting, control-character, Unicode, and line-ending defenses.
- Bounded `${VAR}` expansion with undefined-reference, depth, step-count, output-size, and circular-reference enforcement.
- Loader, runtime, shell substitution, prototype key, and process environment shadowing defenses.
- Secret-material detectors for cloud keys, repository tokens, payment keys, private keys, JWTs, and credentialed database URLs.
- Safe process environment loading with `override: false` by default and regular-file-only bounded file reads that reject symlinks, FIFOs, directories, devices, and oversize files.
- Typed schema validation, redaction, fingerprint-free diffing, CLI, examples, ESM, CommonJS, and TypeScript declarations.
