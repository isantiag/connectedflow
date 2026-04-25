# ConnectedICD — DESIGN.md

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Next.js Frontend                │
│              (port 4000, App Router)             │
├─────────────────────────────────────────────────┤
│                Fastify API Server                │
│           (port 4001, api-server.js)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │AuthProv. │ │Zod Valid.│ │Global Error Hndlr│ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────┤
│  Knex Query Builder  │  Pino Logger (Fastify)   │
├──────────────────────┼──────────────────────────┤
│   PostgreSQL 16      │      Redis 7             │
│   (port 5434)        │      (port 6380)         │
└──────────────────────┴──────────────────────────┘
```

## Monorepo Structure (Turborepo)

```
connectedflow/
├── api-server.js              # Fastify API — 111 REST endpoints
├── mcp-server/server.py       # Python MCP server — 20 tools
├── packages/
│   ├── api-gateway/           # Route registration, RBAC middleware, error handler, correlation IDs
│   ├── core-services/         # Business logic: signals, baselines, workflows, N2, export, digital thread
│   ├── ai-services/           # Document parsing, AI extraction, anomaly detection
│   ├── integration-services/  # Stimulus generator, bus frame encoding/decoding, live telemetry
│   ├── shared-types/          # TypeScript interfaces and type definitions
│   ├── schemas/               # Zod strict validation schemas for all inputs
│   └── web-client/            # Next.js App Router frontend with shadcn/ui
├── services/
│   ├── auth-provider.js       # Swappable AuthProvider (EmailPasswordProvider)
│   └── python-ai/             # Python AI extraction service
├── lib/
│   ├── feature-flags.js       # Feature flag system (flags.json)
│   └── socketcan-adapter.js   # CAN bus hardware adapter
├── migrations/                # SQL migration files (46 tables)
├── seeds/                     # Seed data (FCS example, ICD hierarchy)
└── k8s/                       # Kubernetes manifests
```

## Package Roles

| Package | Role | Test Files | Tests |
|---------|------|-----------|-------|
| `core-services` | Signal CRUD, baselines, workflows, N2 matrix, export, digital thread, MBSE | 11 | 276 |
| `integration-services` | Stimulus generation, bus frame encoding, live telemetry, SafetyNow bridge | 6 | 114 |
| `ai-services` | Document parsing, AI extraction, anomaly detection | 3 | 48 |
| `api-gateway` | Route registration, RBAC middleware, error handling, correlation IDs | 2 | 28 |
| `web-client` | Next.js frontend — pages, components, API client | 2 | 87 |
| `shared-types` | TypeScript type definitions | — | — |
| `schemas` | Zod strict validation schemas | — | — |

## Database Schema — 46 Tables

All tables have `tenant_id` (NOT NULL, FK, indexed) and `custom_fields` (JSONB, default '{}').

### Core ICD Tables
| Table | Purpose |
|-------|---------|
| signal | Signal definitions (name, criticality, status, project_id) |
| logical_layer | Logical attributes (source/dest system, data type, units, refresh rate) |
| transport_layer | Transport attributes (protocol, bus, encoding, bit layout) |
| physical_layer | Physical attributes (connector, pin, wire gauge, shielding) |
| system | Systems in the architecture |
| system_function | Functions performed by systems |
| system_port | I/O ports on systems |
| connection | System-to-system connections |
| message | Messages carried on connections |
| parameter | Parameters within messages |
| signal_parameter_link | Links signals to parameters |

### ICD Management
| Table | Purpose |
|-------|---------|
| project | Projects/programs |
| baseline | Configuration baselines |
| baseline_snapshot | Frozen signal state at baseline |
| baseline_hierarchy_snapshot | Frozen hierarchy at baseline |
| change_request | Change control workflow |
| audit_entry | Append-only audit trail |
| trace_link | Traceability between artifacts |
| signal_comment | Discussion threads on signals |
| signal_ownership | Ownership and handshake tracking |
| signal_edit_lock | Pessimistic locking for concurrent edits |

### Import & Templates
| Table | Purpose |
|-------|---------|
| parse_job | Excel/document parse jobs |
| extracted_signal | Signals extracted from parsed documents |
| hw_icd_template | Hardware ICD templates |
| hw_icd_template_function | Template functions |
| hw_icd_template_port | Template ports |

### Reference Data
| Table | Purpose |
|-------|---------|
| protocol_definition | Protocol definitions (ARINC 429, MIL-STD-1553, etc.) |
| bus | Bus definitions |
| connector_type | Connector types |
| connector | Connector instances |
| cable_bundle | Cable bundles |
| wire_type | Wire specifications |
| unit_of_measure | Engineering units |
| data_encoding | Data encoding formats |
| software_partition | Software partitions (IMA) |
| partition_function_mapping | Partition-to-function mapping |
| partition_port_mapping | Partition-to-port mapping |

### Auth & Organization
| Table | Purpose |
|-------|---------|
| tenant | Multi-tenancy |
| organization | Organizations |
| user | Users (mfa_enabled, mfa_method, us_person, citizenship_country) |
| role | RBAC roles |
| role_permission | Role-permission mapping |
| user_role | User-role assignment |
| user_scope | Per-project user scopes |
| api_key | API key authentication |
| notification | User notifications |
| live_parameter_readings | Live telemetry data |

## MCP Tool Inventory (20 tools)

Python MCP server (`mcp-server/server.py`, port 4102):

| Tool | Description |
|------|-------------|
| `list_signals` | List signals with optional project/status filter |
| `get_signal` | Get signal by ID with all layers |
| `create_signal` | Create signal with logical/transport/physical data |
| `bulk_import_signals` | Bulk import signals from JSON array |
| `list_baselines` | List all baselines |
| `create_baseline` | Create a new baseline |
| `freeze_baseline` | Freeze a baseline snapshot |
| `icd_quality_check` | Validate signal definition quality |
| `export_template_url` | Get export template URL by protocol |
| `export_signals_url` | Get signal export URL |
| `list_workflows` | List change request workflows |
| `ingest_file` | Ingest a file for AI extraction |
| `preview_ingestion` | Preview file ingestion results |
| `ai_change_impact` | AI-powered change impact analysis |
| `analyze_throughput` | Analyze bus throughput |
| `propose_routing` | Propose signal routing between systems |
| `analyze_trends` | Analyze signal trends over time |
| `validate_constraints` | Validate ICD constraints |
| `architecture_insights` | AI architecture analysis |
| `detect_anomalies` | Detect anomalies in signal definitions |

## Auth Model

- **AuthProvider interface**: `services/auth-provider.js` — EmailPasswordProvider (swappable for SSO)
- **Methods**: login(), logout(), getUser(), validateToken()
- **5 Roles**: Admin, Lead, Analyst, Reviewer, Viewer
- **Independence**: Creator ≠ approver enforced on workflow approve endpoint (ARP 4754B §5.4)
- **JWT**: Configurable secret via JWT_SECRET env var, random fallback with warning
- **API Keys**: SHA-256 hashed, prefix stored for identification
- **Multi-tenancy**: tenant_id on all 46 tables, enforced at query level

## Infrastructure

- **Runtime**: Node.js 22 + Fastify
- **Database**: PostgreSQL 16 via Docker (port 5434)
- **Cache**: Redis 7 via Docker (port 6380)
- **Query Builder**: Knex.js (parameterized queries only — §6, §9)
- **Validation**: Zod `.strict()` schemas on all POST/PUT endpoints (§2)
- **Logging**: Pino (structured JSON, built into Fastify)
- **Error Handling**: Global error handler — typed error classes, consistent envelope `{error: {code, message, details?}}` (§8)
- **Feature Flags**: flags.json + lib/feature-flags.js
- **Build**: Turborepo for monorepo orchestration
- **Tests**: Vitest + fast-check (property-based testing)

## Integration Points

| Product | Integration |
|---------|-------------|
| **SafetyNow** | Accepts safety findings on signals (REQ-CICD-INT-001), provides component registry (REQ-CICD-INT-003) |
| **AssureFlow** | ConnectedICD signals consumed via AssureFlow's connectedicd module |
| **DesignerMind** | Webhook notifications on interface changes (REQ-CICD-INT-004), polling API (REQ-CICD-INT-002) |
| **MCP Artifact Interface** | Port 4102 — artifacts.list, artifacts.get, artifacts.export (§9.2) |

## AGI Architecture (Planned)

### RLVR Scoring Integration

Reinforcement Learning with Verifiable Rewards for AI extraction quality:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  AI Extract  │────▶│  RLVR Score  │────▶│  Strategy    │
│  (parser)    │     │  (verifier)  │     │  Selection   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     ┌──────▼──────┐
                     │ Audit Trail │
                     │ (immutable) │
                     └─────────────┘
```

- Score AI extractions against ground truth (confirmed signals)
- Rank extraction strategies by accuracy
- All scoring events logged to append-only audit trail (§7)

### Constitutional Review

Domain-constraint enforcement for AI-generated ICD content:

- **Protocol rules**: Valid protocol identifiers, correct field ranges
- **Unit consistency**: Compatible units across connected signals
- **Naming conventions**: Enforce signal naming standards
- **Configurable**: Admin-editable rule sets without code changes
- **Gate**: Constitutional review runs before AI content enters baseline

### AGI Self-Play Engine (`packages/ai-services/src/agi-connectedicd.ts`)

Generate-evaluate-select loop for ICD generation, inspired by AlphaEvolve + Voyager.

**Core loop**: generate ICD → evaluate with independent reviewer → improve or store as exemplar

**ConnectedICD wiring**:
- `toolGenerateICD(context, llmCall)` — runs full self-play loop for ICD generation
- `toolScoreICD(artifact, context)` — returns evaluation prompt and dimensions
- In-memory skill library with retrieve/store (Voyager pattern)

**CONNECTED_ICD_CONFIG dimensions**: signal_coverage, type_consistency, owner_assignment, change_impact, bidirectional_trace (threshold: 400/500)
