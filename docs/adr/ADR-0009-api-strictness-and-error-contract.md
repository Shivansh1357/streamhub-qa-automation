# ADR-0009: API strictness and error contract

- Status: Accepted, 2026-10-28

## 1 — Problem

The mock Audience Analytics API exists to be tested. How strict should it be about input, and what should errors look like, so
that the API suite can demonstrate meaningful negative testing rather than documenting leniency?

## 3 — Options

### A. Lenient: ignore unknown query parameters, coerce loosely, return 404 for anything unmatched

- First-order: the common default; fewer validation rules to write.
- Second-order: a client typo (`?genere=drama`) silently returns unfiltered data and nobody notices; the negative test suite
  would be thin because little is actually rejected; `404` for a malformed id hides a client bug behind "not found".

### B. Strict: reject unknown parameters, validate every parameter and report every issue at once, distinguish `INVALID_ID`
(400) from `NOT_FOUND` (404), answer wrong methods with 405 and an `Allow` header, one error envelope everywhere

- First-order: more validation code (zod schemas with `.strict()`), an explicit 405 handler, and the obligation to keep the
  OpenAPI document honest.
- Second-order: clients fail fast with actionable messages; the test suite gains dozens of precise negative cases; unknown
  parameters become a breaking change to add, so the contract must be versioned under `/api/v1`. The review found a gap
  (single-resource routes ignored unknown parameters) precisely because the contract was strict enough to check.

### C. Lenient with warnings (accept and add a `Warning` header)

- First-order: friendly to clients.
- Second-order: nobody reads warning headers; the test suite would have to assert on an advisory signal, which is weaker than a
  status code.

## 1 — Decision

**Option B**, implemented with Express 5 (native async handlers, universally understood) and zod, over Fastify (built-in JSON
schema validation, but less familiar to reviewers) and NestJS (too much framework for six read-only endpoints). `/health` is the
one documented exception that tolerates extra parameters, because probes append cache-busters. Revisit if the API grows write
endpoints; then request-body validation and idempotency rules join the contract.
