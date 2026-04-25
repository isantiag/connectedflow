## What changed
<!-- Brief description of the change -->

## Why
<!-- Link to tracking issue: TASK-NNN -->

## How it was tested
<!-- What tests were run, what was verified -->

## Pre-merge checklist

**Architecture**
- [ ] Business logic in `services/`, not handler
- [ ] No direct DB access from handlers
- [ ] If both REST and MCP expose this, both call the same service

**Contracts**
- [ ] Zod schema with `.strict()`
- [ ] No field-name variant fallbacks

**Database**
- [ ] Parameterized queries only (no string-concatenated SQL)
- [ ] Migrations included if schema changed

**Errors & Security**
- [ ] Typed error classes, consistent `{error: {code, message}}` envelope
- [ ] Input validated
- [ ] No secrets in the diff
- [ ] Audit log written for state changes

**Frontend**
- [ ] Server state via TanStack Query
- [ ] Loading, error, empty states handled
- [ ] Semantic HTML, keyboard accessible
- [ ] No tokens in localStorage

**Tests**
- [ ] Unit tests for service functions
- [ ] All existing tests pass
