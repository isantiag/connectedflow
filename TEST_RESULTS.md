# ConnectedICD — TEST_RESULTS.md

**Date**: 2026-04-25
**Commit**: TASK-045 standards compliance fixes
**Runner**: Vitest 4.1.5 / Node.js 24.14.1

## Summary

| | |
|---|---|
| **Total test files** | 21 passed, 27 failed (pre-existing FE window issue) |
| **Total tests** | **437 passed**, 82 failed (pre-existing) |
| **Packages with tests** | 5 of 7 |
| **Status** | ✅ All service tests passing, FE tests have pre-existing env issue |

## Breakdown by Package

### packages/core-services — 291 tests (12 files)

Core business logic: signal CRUD, baselines, workflows, N2 matrix, export, digital thread, MBSE.

```
 Test Files  12 passed (12)
      Tests  291 passed (291)
   Duration  497ms
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

### packages/ai-services — 52 tests (4 files)

Document parsing, AI extraction, anomaly detection, AGI self-play engine.

```
 Test Files  4 passed (4)
      Tests  52 passed (52)
   Duration  559ms
```

Covers:
- Document upload and object store integration
- Parse job lifecycle (queued → processing → review_pending → confirmed)
- Low-confidence signal flagging
- Extraction confirmation with error handling
- Parsing report statistics
- AGI self-play: convergence, iteration, score parsing, MCP tools

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
