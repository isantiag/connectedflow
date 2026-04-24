# ConnectedICD — TEST_RESULTS.md

## Last Run
- **Date**: 2026-04-24
- **Commit**: 313f3ae (fix: significant #4 — remove hardcoded 'dev-secret' JWT fallback)

## Summary
| Suite | Pass | Fail | Skip | Total |
|-------|------|------|------|-------|
| Web Client (vitest) | 5 | 0 | 0 | 5 |
| **Total** | **5** | **0** | **0** | **5** |

## Web Client Tests (packages/web-client)
| Test | Status |
|------|--------|
| LoginScreen > renders email and password fields | ✅ |
| LoginScreen > renders sign in button | ✅ |
| LoginScreen > calls login with email and password on submit | ✅ |
| LoginScreen > shows error message on failed login | ✅ |
| LoginScreen > shows test account credentials | ✅ |

## API Endpoint Verification (manual, from pre-demo test)
| Endpoint | Status |
|----------|--------|
| GET /health | ✅ 200 |
| GET /api/signals | ✅ 200 |
| GET /api/n2-matrix | ✅ 200 |
| GET /api/baselines | ✅ 200 |
| GET /api/workflows | ✅ 200 |
| GET /api/audit | ✅ 200 |
| GET /api/notifications | ✅ 200 |
| GET /api/handshakes/pending | ✅ 200 |
| GET /api/organizations | ✅ 200 |
| GET /api/ai/providers | ✅ 200 |
| POST /api/auth/login | ✅ 200 |
| GET /api/auth/me | ✅ 200 |

## Known Issues
- No API integration test suite yet (only web component tests)
- Error responses return generic message (by design — blocker #1 fix)

## How to Run
```bash
# Web client component tests
cd packages/web-client && npx vitest run

# Start API for manual testing
cd /mnt/c/Users/Valued\ Customer/Documents/ConnectedICD
node api-server.js
```
