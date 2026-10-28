# ADR-0004: Environment configuration

- Status: Accepted, 2026-10-28

## 1 — Problem

The brief forbids hardcoded URLs. A fresh clone must run with no manual setup, CI must be able to override values, and a typo in
a setting must not silently change behaviour.

## 3 — Options

### A. A single git-ignored `.env` read with dotenv

- First-order: conventional and simple.
- Second-order: a fresh clone has no configuration, so the reviewer's first run fails until they craft a file; nothing validates
  the values, so `HEADLESS=flase` silently runs headed.

### B. Committed per-environment files (`config/env/local.env`, `ci.env`) plus a typed loader

- First-order: zero-setup clone; `TEST_ENV` selects the file; a git-ignored `.env` and real environment variables override it.
- Second-order: the precedence (shell > `.env` > env file) has to be documented and tested by use; values are validated at load
  (required URLs, enumerated browser/trace/provider values), so a mistake fails before any test runs. No secrets can live in the
  committed files, which is the right discipline anyway.

### C. JSON/TS configuration modules per environment

- First-order: typed by construction.
- Second-order: CI cannot override a value without a code change; environment variables are the common currency of every CI
  system and container, and we would be fighting that.

## 1 — Decision

**Option B.** `config/env.ts` is the only module that reads `process.env`; everything else imports `env`. Consequences accepted:
two small files to keep in sync when a variable is added. Revisit if secrets ever enter the picture; then a secret manager or
CI-provided variables, never a committed file.
