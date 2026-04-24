# ConnectedICD — Technical Debt Tracker

**Created:** April 22, 2026
**Deadline:** June 21, 2026 (60 days — feature work pauses if unresolved)

## Tracked Violations

### 1. Shared Services Layer
**Status:** Open
**Rule:** All business logic in services/, not in route handlers
**Current state:** All logic is inline in `api-server.js` route handlers
**Fix plan:** Refactor incrementally — when touching a feature in api-server.js:
  1. Add contract tests for the slice being changed
  2. Extract that slice's logic into `services/`
  3. Build the feature

### 2. TanStack Query Migration
**Status:** Open
**Rule:** Use TanStack Query for all server state, no raw useEffect+fetch
**Current state:** All frontend pages use `useEffect` + `api.get/post`
**Fix plan:** Replace incrementally — when touching a page:
  1. Install `@tanstack/react-query` and add QueryClientProvider
  2. Replace that page's fetch calls with `useQuery`/`useMutation`
  3. New pages MUST use TanStack Query from the start

### 3. Contract Tests for MCP Tools
**Status:** Open
**Rule:** Every MCP tool must have contract tests
**Current state:** 3 artifact MCP tools have no tests
**Fix plan:**
  - New MCP tools: MUST ship with contract tests (blocking)
  - Existing tools: backfill when next modified
  - Test framework: Vitest

## Resolved

### 4. Zod Input Validation
**Status:** ✅ Fixed (April 22, 2026)
**Rule:** Zod strict schemas for all POST/PUT inputs
**Fix:** 15 endpoints validated with strict Zod schemas in `packages/schemas/src/index.js`

### 5. §9.1 MCP Tool Naming
**Status:** ✅ Compliant
**Tools:** `artifacts.list`, `artifacts.get`, `artifacts.export`

### 6. §9.2 Artifact Interface
**Status:** ✅ Compliant
**Port:** 4102, 3 tools, standard artifact schema
