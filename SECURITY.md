# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/dotenvcage/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| 1.x | Supported |

Security fixes are applied to the latest release line.

## Scope

This policy covers strict dotenv parsing, expansion, safe loading, schema validation, redaction, diffing, and CLI output.

In scope:

- A parser, expansion or file-loading bypass that allows command substitution, runtime hijack keys, prototype keys, control characters or duplicate shadowing to reach application configuration.
- A transactional failure in safe loading that partially writes hostile values to the target environment.
- A redaction, audit, diff or CLI flaw that exposes secret values in output.
- A bound bypass for input size, line count, expansion depth or expanded output size.

Out of scope:

- Compromise of the host, process environment or application after it ignores a validation failure.
- Secret values that are intentionally supplied to runtime configuration and never logged or committed.
- Vulnerabilities in downstream applications that use unvalidated input instead of the parsed result.

## Coordinated disclosure

- Acknowledgment: within 48 hours.
- Initial assessment: within 7 calendar days.
- Fix or mitigation plan: within 30 calendar days for confirmed high-impact reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
