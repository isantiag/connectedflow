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

## Database Schema — 46 Tables + tenant table

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

## Auth Model
- **AuthProvider interface**: `services/auth-provider.js` — EmailPasswordProvider
- **Methods**: login(), logout(), getUser(), validateToken()
- **Roles**: Admin, Lead, Analyst, Reviewer, Viewer
- **Independence**: Creator ≠ approver enforced on workflow approve endpoint
- **JWT**: Configurable secret via JWT_SECRET env var, random fallback with warning
- **API Keys**: SHA-256 hashed, prefix stored for identification

## Infrastructure
- **Runtime**: Node.js + Fastify
- **Database**: PostgreSQL 16 via Docker (port 5434)
- **Cache**: Redis 7 via Docker (port 6380)
- **Query Builder**: Knex.js
- **Validation**: Zod strict schemas on all POST/PUT endpoints
- **Logging**: Pino (built into Fastify)
- **Error Handling**: Global error handler — never leaks DB internals
- **Feature Flags**: flags.json + lib/feature-flags.js

## Integration Points
- **AssureFlow**: ConnectedICD signals consumed via AssureFlow's connectedicd module
- **MCP Artifact Interface**: Port 4102 — artifacts.list, artifacts.get, artifacts.export
- **Admin MCP**: Port 4100 — remote administration
