# ConnectedICD Independent Audit Report

Date: 2026-04-24  
Scope audited: `api-server.js`, `services/`, `lib/`, `packages/*/src/`, `migrations/`, `seeds/`, `k8s/`, `.env.example`, `docker-compose.yml`, `flags.json`, `package.json`  
Excluded from deep analysis: `node_modules/`, `dist/`, `.next/`, `package-lock.json`

## Executive Summary

The codebase has strong functional breadth, but independent verification found critical gaps in authentication enforcement, workflow independence, secret management, and multi-tenant/compliance controls. Most severe issues are concentrated in `api-server.js` and foundation migration claims that are not backed by schema changes.

---

## Findings

### 1) Hardcoded Gemini API key in source
- Severity: **CRITICAL**
- Category: Security / Secrets
- Issue: A live API key is hardcoded in runtime code.
- Impact: Credential leakage, external API abuse, and key compromise through source exposure.
- Evidence:
  - `api-server.js:673`
- Recommended fix: Remove the hardcoded key, require `GEMINI_API_KEY` from environment only, fail closed if missing, and rotate the exposed key.

### 2) Authentication bypass on privileged/mutating routes
- Severity: **CRITICAL**
- Category: Security / AuthZ
- Issue: Permission checks are conditional on `session` existing; if `session` is null, several privileged operations proceed.
- Impact: Unauthenticated users can create/delete baselines and approve/reject workflows in some states.
- Evidence:
  - `api-server.js:278`
  - `api-server.js:280`
  - `api-server.js:360`
  - `api-server.js:362`
  - `api-server.js:396`
  - `api-server.js:398`
  - `api-server.js:423`
  - `api-server.js:425`
- Recommended fix: Enforce `if (!session) return 401` before any role/permission checks, then enforce role checks unconditionally.

### 3) ARP 4754B independence check is broken and bypassable
- Severity: **CRITICAL**
- Category: Aerospace Compliance / Independence
- Issue: Approval check compares `cr.created_by` to approver, but workflow records use `submitted_by`; additionally unauthenticated approval is not blocked.
- Impact: Creator-approver separation can fail silently, violating independence intent.
- Evidence:
  - `api-server.js:403`
  - `api-server.js:388`
  - `packages/core-services/src/db/migrations/003_user_rbac_workflow.sql:56`
- Recommended fix: Compare `cr.submitted_by` against `session.userId`, require authenticated approver, and add a DB-level constraint/trigger to prevent self-approval.

### 4) Command injection risk in CAN adapter command execution
- Severity: **CRITICAL**
- Category: Security / Injection
- Issue: User-controlled values flow into shell `exec` command strings without sanitization.
- Impact: Potential remote command execution via crafted `adapterId`, `canId`, or `data` payloads.
- Evidence:
  - `api-server.js:1519`
  - `api-server.js:1551`
  - `api-server.js:1654`
  - `lib/socketcan-adapter.js:122`
  - `lib/socketcan-adapter.js:39`
- Recommended fix: Replace `exec` with `spawn` argument arrays, validate strict allowlists (`^[a-zA-Z0-9_]+$` for interfaces; strict hex for CAN payload), and reject invalid input.

### 5) Multi-tenant enforcement claim does not match schema or runtime
- Severity: **HIGH**
- Category: Security / Aerospace Compliance
- Issue: No audited runtime query or schema in scope applies `tenant_id` filters for business tables.
- Impact: Cross-tenant data isolation is not enforceable as implemented.
- Evidence:
  - `migrations/010_foundation_tenant_custom_fields.sql:1`
  - `migrations/010_foundation_tenant_custom_fields.sql:4`
  - `packages/core-services/src/db/migrations/001_initial_schema.sql:12`
  - `migrations/002_icd_hierarchy.sql:58`
  - `api-server.js:174`
- Recommended fix: Add `tenant_id` (NOT NULL + FK) to all tenant-scoped tables, add composite indexes, and require tenant scoping in all repository/query paths.

### 6) `custom_fields JSONB` foundation claim not implemented on domain tables
- Severity: **HIGH**
- Category: Data Model / Compliance
- Issue: Foundation migration states `custom_fields` rollout, but no such columns are added in audited schema files.
- Impact: Extensibility/compliance claim is not fulfilled; downstream assumptions may break.
- Evidence:
  - `migrations/010_foundation_tenant_custom_fields.sql:1`
  - `migrations/010_foundation_tenant_custom_fields.sql:4`
  - `packages/core-services/src/db/migrations/001_initial_schema.sql:12`
  - `migrations/002_icd_hierarchy.sql:58`
- Recommended fix: Add `custom_fields JSONB NOT NULL DEFAULT '{}'` to required tables and migrate service/repository typings accordingly.

### 7) Audit trail is not immutable and write failures are suppressed
- Severity: **HIGH**
- Category: Security / Aerospace Compliance
- Issue: Audit writes are wrapped with `.catch(() => {})`; schema has no immutability enforcement (no trigger/permission policy).
- Impact: Mutations can occur without durable audit evidence; audit integrity cannot be trusted.
- Evidence:
  - `api-server.js:72`
  - `api-server.js:81`
  - `packages/core-services/src/db/migrations/003_user_rbac_workflow.sql:72`
  - `packages/core-services/src/db/base-repository.ts:96`
  - `packages/core-services/src/db/base-repository.ts:108`
- Recommended fix: Fail request on audit-write failure for critical mutations, add DB trigger/policy to block `UPDATE`/`DELETE` on `audit_entry`, and restrict write path to append-only role.

### 8) Local mode auto-authenticates first user with no credentials
- Severity: **HIGH**
- Category: Security / AuthN
- Issue: If JWT secret is absent and no auth header/api key is provided, provider returns first DB user.
- Impact: Environment misconfiguration becomes full auth bypass.
- Evidence:
  - `services/auth-provider.js:16`
  - `services/auth-provider.js:50`
  - `services/auth-provider.js:51`
  - `api-server.js:50`
- Recommended fix: Remove auto-login behavior entirely or gate it behind explicit dev-only flag disabled in non-local environments.

### 9) Runtime auth endpoints use undefined crypto/bcrypt identifiers
- Severity: **HIGH**
- Category: Code Quality / Reliability
- Issue: `bcrypt` and `crypto` are used in `api-server.js` without local imports.
- Impact: Password-change and API key endpoints can throw runtime `ReferenceError`, causing reliability/security regressions.
- Evidence:
  - `api-server.js:109`
  - `api-server.js:112`
  - `api-server.js:124`
  - `api-server.js:125`
  - `api-server.js:155`
  - `api-server.js:166`
- Recommended fix: Import required modules explicitly at file top and add endpoint-level tests.

### 10) Input validation is inconsistent across endpoints
- Severity: **MEDIUM**
- Category: Security / Code Quality
- Issue: Some routes use strict Zod validation; many others accept raw `req.body`/`req.query` directly.
- Impact: Increased risk of malformed data, privilege misuse, and inconsistent behavior.
- Evidence:
  - `api-server.js:231`
  - `api-server.js:624`
  - `api-server.js:1678`
  - `api-server.js:1744`
  - `api-server.js:2039`
- Recommended fix: Apply schema validation uniformly to all mutating and query-bearing endpoints.

### 11) Unbounded Excel/base64 processing and prompt construction
- Severity: **MEDIUM**
- Category: Security / Availability
- Issue: Base64 payloads are loaded directly into memory and transformed into large prompt text without explicit size caps.
- Impact: Memory pressure and request amplification DoS risk.
- Evidence:
  - `api-server.js:688`
  - `api-server.js:690`
  - `api-server.js:882`
  - `api-server.js:898`
  - `api-server.js:926`
- Recommended fix: Enforce upload size/time limits, stream parse where possible, and cap rows/sheets/tokens before LLM calls.

### 12) Header-content construction uses unsanitized project names
- Severity: **MEDIUM**
- Category: Security / Output Handling
- Issue: `Content-Disposition` filenames include `project.name` directly.
- Impact: Potential header formatting issues and unsafe filename behavior.
- Evidence:
  - `api-server.js:1285`
  - `api-server.js:1357`
  - `api-server.js:1421`
  - `api-server.js:1485`
- Recommended fix: Sanitize to strict filename charset and quote-escape defensively.

### 13) Architecture split is inconsistent (parallel server implementations)
- Severity: **MEDIUM**
- Category: Architecture
- Issue: Repo contains both large monolithic `api-server.js` and separate package-gateway server with overlapping routes.
- Impact: Divergent behavior, duplicated logic, and audit/test drift.
- Evidence:
  - `README.md:11`
  - `api-server.js:27`
  - `packages/api-gateway/src/main.ts:12`
  - `packages/api-gateway/src/main.ts:54`
- Recommended fix: Consolidate to one runtime entrypoint and route stack; deprecate duplicate path.

### 14) Test execution evidence is shallow for critical backend risks
- Severity: **MEDIUM**
- Category: Test Coverage
- Issue: Last reported run includes only web-client tests; no API integration/security/compliance test suite evidence.
- Impact: Critical auth/tenant/workflow regressions can ship undetected.
- Evidence:
  - `TEST_RESULTS.md:10`
  - `TEST_RESULTS.md:11`
  - `TEST_RESULTS.md:39`
  - `packages/web-client/src/components/login-screen.test.tsx:13`
- Recommended fix: Add API integration tests for auth gates, workflow independence, tenant scoping, and audit logging integrity.

### 15) Legacy auth implementation appears stale and unreferenced
- Severity: **LOW**
- Category: Code Quality / Dead Code
- Issue: `services/auth.service.js` duplicates auth logic and includes insecure fallback behavior but appears unused by runtime.
- Impact: Maintenance confusion and accidental reintroduction risk.
- Evidence:
  - `services/auth.service.js:29`
  - `services/auth.service.js:80`
- Recommended fix: Remove or explicitly deprecate legacy file; keep one auth implementation.

### 16) Development credentials are hardcoded in compose defaults
- Severity: **LOW**
- Category: Security Hygiene
- Issue: Static credentials are embedded in `docker-compose.yml`.
- Impact: Risky if reused beyond local development.
- Evidence:
  - `docker-compose.yml:8`
  - `docker-compose.yml:9`
  - `docker-compose.yml:55`
  - `docker-compose.yml:56`
- Recommended fix: Move secrets to environment/secret manager and enforce non-default values in non-dev environments.

---

## Foundation Fix Verification

### 1) `tenant_id` on every table
- Status: **FAIL**
- Evidence:
  - `migrations/010_foundation_tenant_custom_fields.sql:1`
  - `packages/core-services/src/db/migrations/001_initial_schema.sql:12`
  - `migrations/002_icd_hierarchy.sql:58`
- Notes: Foundation migration creates only `tenant` table; no table-wide `tenant_id` rollout is present in audited schema.

### 2) `custom_fields JSONB` present
- Status: **FAIL**
- Evidence:
  - `migrations/010_foundation_tenant_custom_fields.sql:1`
  - `packages/core-services/src/db/migrations/001_initial_schema.sql:12`
- Notes: No audited domain table definitions include `custom_fields`.

### 3) AuthProvider interface exists and is isolated
- Status: **PARTIAL / FAIL**
- Evidence:
  - `services/auth-provider.js:6`
  - `api-server.js:48`
- Notes: There is a provider class abstraction, but no explicit typed interface contract in the audited JS runtime path; legacy duplicate auth module also exists.

### 4) Independence check works
- Status: **FAIL**
- Evidence:
  - `api-server.js:401`
  - `api-server.js:403`
  - `packages/core-services/src/db/migrations/003_user_rbac_workflow.sql:56`
- Notes: Wrong field checked (`created_by` vs `submitted_by`) and unauthenticated path is not rejected.

### 5) `/ready` endpoint status behavior
- Status: **PASS (basic)**
- Evidence:
  - `api-server.js:33`
  - `api-server.js:35`
  - `api-server.js:38`
- Notes: Returns `ready: true` when DB probe succeeds and HTTP 503 when probe fails.

---

## Additional Review Notes

### Security checks requested (summary)
- SQL injection: No direct SQL string concatenation into query text found in audited first-party runtime routes; most DB access uses Knex builders/parameterized `whereRaw`.
- Auth bypass: **Present** (critical, multiple routes).
- Path traversal: No direct file path traversal pattern observed in audited path-handling routes.
- Secrets in code: **Present** (hardcoded Gemini key).
- Input validation gaps: **Present** (multiple endpoints bypass schemas).

### Repository hygiene
- `.gitignore` includes `.next` and `.env` entries (`.gitignore:5`, `.gitignore:7`), but cleanup enforcement should be verified in CI to prevent committing generated artifacts/secrets.

---

## Prioritized Remediation Order

### P0 (Immediate)
1. Remove and rotate hardcoded Gemini key (`api-server.js:673`).
2. Enforce mandatory authentication + authorization checks on all privileged routes.
3. Fix workflow independence logic to use `submitted_by` and block unauth approvals.
4. Eliminate shell command injection paths in SocketCAN command execution.

### P1 (Next)
1. Implement real multi-tenant schema (`tenant_id`) and query scoping.
2. Implement `custom_fields JSONB` across required domain tables.
3. Make audit trail append-only and fail closed on audit write failures.
4. Add backend integration/security/compliance tests.

### P2 (Stabilization)
1. Consolidate duplicate API server implementations.
2. Remove stale/duplicate auth module.
3. Harden input validation consistency and export filename sanitization.
4. Remove hardcoded compose secrets from shared defaults.
