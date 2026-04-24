# ConnectedICD

**AI-native interface control document management platform for digital engineering and MBSE integration.**

ConnectedICD manages the complete lifecycle of signals, interfaces, and ICDs across aerospace systems — from logical definition through transport and physical layers — with built-in traceability, change control, and AI-assisted analysis.

## Quick Start

```bash
docker compose up -d          # Start Postgres + Redis
node api-server.js            # Start API on port 4001
cd packages/web-client && npx next dev  # Start frontend on port 4000
```

## Key Capabilities

- **106 REST API endpoints** — full ICD lifecycle management
- **3-layer ICD model** — logical → transport → physical
- **Digital thread** — trace from requirement → interface → signal → physical
- **Impact analysis** — interface change → all affected items
- **MBSE integration** — SysML v2 import, ReqIF sync, auto-generate ICD
- **AI-assisted** — signal extraction, anomaly detection, troubleshooting
- **Change control** — baselines, diff, approval workflow with independence check
- **Multi-tenancy** — tenant_id on all 46 tables, enterprise-ready

## Architecture

- **API**: Node.js + Fastify (port 4001)
- **Frontend**: Next.js + shadcn/ui (port 4000)
- **Database**: PostgreSQL 16 (port 5434)
- **Cache**: Redis 7 (port 6380)
- **Validation**: Zod strict schemas
- **Logging**: Pino (structured JSON)
- **Auth**: JWT + RBAC (Admin, Lead, Analyst, Reviewer, Viewer)

## Test Accounts

- `admin@enteraero.com` / `Admin1!`
- `editor@enteraero.com` / `Editor1!`
- `viewer@supplier.com` / `Viewer1!`

## Docs

- [SPEC.md](SPEC.md) — Requirements
- [DESIGN.md](DESIGN.md) — Architecture
- [TEST_RESULTS.md](TEST_RESULTS.md) — Test status
