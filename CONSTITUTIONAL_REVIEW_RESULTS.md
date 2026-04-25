# Constitutional Review Results — ConnectedICD
**Date**: 2026-04-24 | **Files scanned**: 153 | **Total violations**: 141
**CRITICAL**: 0 | **HIGH**: 134 | **MEDIUM**: 7 | **LOW**: 0
**Verdict**: ✅ PASSED

## HIGH (134)
### DOM-02 — §2 Domain
**Issue**: UPDATE without change tracking (no changed_by/updated_by) | **Fix**: Include changed_by, changed_at in every UPDATE statement
| File | Line |
|------|------|
| packages/ai-services/src/repositories/parse-job-repository.ts | 65 |
| packages/ai-services/src/repositories/parse-job-repository.ts | 67 |
| packages/ai-services/src/services/document-parser-service.ts | 251 |
| packages/core-services/src/db/base-repository.ts | 96 |
| packages/core-services/src/db/base-repository.ts | 103 |
| packages/core-services/src/services/baseline-service.ts | 454 |
| packages/core-services/src/services/baseline-service.ts | 463 |
| packages/core-services/src/services/baseline-service.ts | 464 |
| packages/core-services/src/services/baseline-service.ts | 470 |
| packages/core-services/src/services/baseline-service.ts | 471 |
| packages/core-services/src/services/baseline-service.ts | 477 |
| packages/core-services/src/services/baseline-service.ts | 478 |
| packages/core-services/src/services/baseline-service.ts | 605 |
| packages/core-services/src/services/baseline-service.ts | 619 |
| packages/core-services/src/services/baseline-service.ts | 633 |
| ... +55 more | |

### BE-02 — §2 Backend
**Issue**: Type assertion on req.body instead of Zod validation | **Fix**: Use Zod .strict() schema: const input = MySchema.parse(req.body)
| File | Line |
|------|------|
| packages/api-gateway/src/main.ts | 39 |
| packages/api-gateway/src/main.ts | 50 |
| packages/api-gateway/src/main.ts | 55 |
| packages/api-gateway/src/main.ts | 80 |

### BE-01 — §1 Backend
**Issue**: Business logic (DB queries) in route handler — must be in services/ | **Fix**: Move DB logic to a service class, call it from the route handler
| File | Line |
|------|------|
| packages/api-gateway/src/routes/ai-analysis-routes.ts | 5 |
| packages/api-gateway/src/routes/ai-analysis-routes.ts | 10 |
| packages/api-gateway/src/routes/ai-analysis-routes.ts | 11 |
| packages/api-gateway/src/routes/audit-routes.ts | 23 |
| packages/api-gateway/src/routes/audit-routes.ts | 25 |
| packages/api-gateway/src/routes/audit-routes.ts | 26 |
| packages/api-gateway/src/routes/audit-routes.ts | 27 |
| packages/api-gateway/src/routes/audit-routes.ts | 28 |
| packages/api-gateway/src/routes/audit-routes.ts | 29 |
| packages/api-gateway/src/routes/audit-routes.ts | 30 |
| packages/api-gateway/src/routes/audit-routes.ts | 33 |
| packages/api-gateway/src/routes/audit-routes.ts | 34 |
| packages/api-gateway/src/routes/audit-routes.ts | 35 |
| packages/api-gateway/src/routes/audit-routes.ts | 36 |
| packages/api-gateway/src/routes/baseline-routes.ts | 24 |
| ... +45 more | |

## MEDIUM (7)
### FE-01 — Frontend
**Issue**: fetch() without AbortSignal timeout — can freeze UI | **Fix**: Add signal: AbortSignal.timeout(10000) to every fetch call
| File | Line |
|------|------|
| packages/web-client/src/app/anomalies/page.tsx | 27 |
| packages/web-client/src/app/baselines/page.tsx | 34 |
| packages/web-client/src/app/hw-templates/page.tsx | 27 |
| packages/web-client/src/app/hw-templates/page.tsx | 41 |
| packages/web-client/src/lib/api-client.ts | 29 |
| packages/web-client/src/lib/auth-context.tsx | 29 |
| packages/web-client/src/lib/auth-context.tsx | 59 |
