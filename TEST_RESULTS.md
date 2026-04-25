# ConnectedICD — TEST_RESULTS.md

**Date**: 2026-04-24
**Commit**: `605cbb8` — test: full 10-step test template — page smoke, content, interaction tests + bug fixes
**Runner**: Vitest 4.1.5 / Node.js 22.22.2

## Summary

| | |
|---|---|
| **Total test files** | 22 passed, 2 skipped (no tests) |
| **Total tests** | **553 passed**, 0 failed |
| **Packages with tests** | 5 of 7 |
| **Status** | ✅ All passing |

## Breakdown by Package

### packages/core-services — 276 tests (11 files)

Core business logic: signal CRUD, baselines, workflows, N2 matrix, export, digital thread, MBSE.

```
 Test Files  11 passed (11)
      Tests  276 passed (276)
   Duration  512ms
```

Includes fast-check property-based tests for:
- Signal three-layer model (logical, transport, physical)
- Protocol-specific attributes (ARINC 429, CAN, MIL-STD-1553, ARINC 664)
- Bus frame encoding/decoding round-trips
- Extraction results, baselines, change requests

### packages/integration-services — 114 tests (6 files)

Stimulus generation, bus frame encoding/decoding, live telemetry, SafetyNow bridge.

```
 Test Files  6 passed (6)
      Tests  114 passed (114)
   Duration  319ms
```

Includes round-trip tests for:
- Unsigned/signed 8-bit and 16-bit encoding
- BCD encoding, little-endian encoding
- Scale/offset transformations
- Multi-signal frame packing

### packages/web-client — 87 tests (2 files)

Next.js frontend page tests: smoke, content, interaction.

```
 Test Files  2 passed (2)
      Tests  87 passed (87)
   Duration  3.74s
```

Covers:
- Page rendering (all major pages)
- HW Templates: CRUD, form toggle, port/function add
- Ingestion: mode selector, file upload, AI/pattern modes
- Component interaction and API call verification

### packages/ai-services — 48 tests (3 files)

Document parsing, AI extraction, anomaly detection.

```
 Test Files  3 passed (3)
      Tests  48 passed (48)
   Duration  559ms
```

Covers:
- Document upload and object store integration
- Parse job lifecycle (queued → processing → review_pending → confirmed)
- Low-confidence signal flagging
- Extraction confirmation with error handling
- Parsing report statistics

### packages/api-gateway — 28 tests (2 files)

Route registration, RBAC middleware, error handling, correlation IDs.

```
 Test Files  2 passed (2)
      Tests  28 passed (28)
   Duration  953ms
```

Covers:
- Route registration for all endpoint groups (signals, baselines, workflows, audit)
- RBAC: 401 on missing user, 403 on insufficient permissions
- Structured ErrorResponse with correlation ID
- Correlation ID echo and generation

### packages/schemas — No tests

Zod schema definitions only. Validated transitively through consumer packages.

### packages/shared-types — No tests

TypeScript type definitions only. Validated at compile time.

## How to Run

```bash
# All packages (via Turborepo)
npx turbo test

# Single package
cd packages/core-services && npx vitest run

# Watch mode
cd packages/core-services && npx vitest

# Verbose output
cd packages/core-services && npx vitest run --reporter=verbose
```

Requires Node.js 22:
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
```
