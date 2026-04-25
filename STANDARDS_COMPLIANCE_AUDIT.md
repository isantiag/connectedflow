# ConnectedICD — STANDARDS_COMPLIANCE_AUDIT.md

**Date:** 2026-04-25 | **Auditor:** Kiro AI (TASK-045)

## Summary: 4 FAIL, 2 MARGINAL, 6 PASS

| Rule | Status | Severity |
|------|--------|----------|
| §1 BE: Business logic in services/ | **FAIL** | HIGH |
| §2 BE: Zod .strict() on inputs | **PASS** | — |
| §3 BE: Stubs return 501 | **FAIL** | MEDIUM |
| §5 BE: DB is source of truth | **MARGINAL PASS** | LOW |
| §6 BE: Same DB engine, parameterized queries | **PASS** | — |
| §8 BE: Typed errors, consistent envelope | **FAIL** | HIGH |
| §9 BE: No committed secrets | **PASS** | — |
| §10 BE: Audit logging immutable | **PASS** | — |
| §11 BE: tenant_id on all tables | **PASS** | — |
| §5 FE: Server state = TanStack Query | **FAIL** | HIGH |
| §8 FE: Semantic HTML, a11y | **MARGINAL PASS** | MEDIUM |
| §4 GIT: Conventional commits | **PASS** | — |

## FAIL Details

### §1 BE: Business logic in handlers (HIGH)

`api-server.js` and `packages/api-gateway/src/main.ts` have ALL business logic directly in route handlers with inline `db('table')` calls. ~30+ routes with direct DB access.

**Note:** `packages/api-gateway/src/routes/*.ts` (signal-routes, audit-routes, workflow-routes, baseline-routes) PASS — they delegate to injected services. Only `n2-routes.ts` directly instantiates services.

**Fix:** api-server.js is the legacy monolith; main.ts is the new gateway. The routes/ files are the correct pattern. Mark api-server.js as legacy, ensure main.ts delegates to services.

### §3 BE: No 501 stubs found (MEDIUM)

No 501 responses found anywhere. If any endpoints are stubs, they're not returning 501.

**Fix:** Audit all endpoints for stub behavior, add 501 where needed.

### §8 BE: Inconsistent error envelope (HIGH)

~30+ occurrences of flat `{ error: 'string' }` in api-server.js instead of `{ error: { code, message, details? } }`.

**Fix:** Replace flat error strings with structured envelope in api-server.js.

### §5 FE: Raw useState for server data (HIGH)

10+ pages use `useState` + `useEffect` + `fetch` instead of TanStack Query: signals/[id], systems/[id], connections/[id], messages/[id], live, documents, traceability, project-context, auth-context.

**Fix:** Migrate to TanStack Query hooks. Note: TanStack Query hooks already exist in `lib/queries.ts` — pages just aren't using them.
