# Technical Design — ConnectedICD Architecture Model Phase 1

## Overview

Phase 1 enriches ConnectedICD's existing ICD hierarchy (migration 002) with systems architecture capabilities. The existing four primitives (system, system_port, connection, message/parameter) remain unchanged. This phase adds hierarchy, budgets, bus instances, diagram visualization, and cross-product traceability.

## Database Schema Changes

### Migration 017: Architecture Model Phase 1

```sql
-- ============================================================
-- 1. Enrich system table
-- ============================================================
ALTER TABLE system ADD COLUMN IF NOT EXISTS canonical_id TEXT;
ALTER TABLE system ADD COLUMN IF NOT EXISTS parent_system_id UUID REFERENCES system(id);
ALTER TABLE system ADD COLUMN IF NOT EXISTS dal_level TEXT NOT NULL DEFAULT '';
ALTER TABLE system ADD COLUMN IF NOT EXISTS redundancy_group TEXT NOT NULL DEFAULT '';
ALTER TABLE system ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE system ADD COLUMN IF NOT EXISTS mass_kg NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS power_watts NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS volume_cm3 NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS length_mm NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS width_mm NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS height_mm NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS budget_status TEXT NOT NULL DEFAULT 'estimated';
ALTER TABLE system ADD COLUMN IF NOT EXISTS diagram_x REAL NOT NULL DEFAULT 0;
ALTER TABLE system ADD COLUMN IF NOT EXISTS diagram_y REAL NOT NULL DEFAULT 0;
ALTER TABLE system ADD COLUMN IF NOT EXISTS profile_data JSONB NOT NULL DEFAULT '{}';

-- Expand system_type CHECK constraint
-- (drop old if exists, add new)
ALTER TABLE system DROP CONSTRAINT IF EXISTS system_system_type_check;
ALTER TABLE system ADD CONSTRAINT system_system_type_check
  CHECK (system_type IN ('aircraft','system','subsystem','lru','sensor','actuator',
                          'switch','bus_coupler','hw_item','sw_item','equipment'));

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_system_parent ON system(parent_system_id);
CREATE INDEX IF NOT EXISTS idx_system_dal ON system(dal_level) WHERE dal_level != '';
CREATE INDEX IF NOT EXISTS idx_system_type ON system(system_type);
CREATE INDEX IF NOT EXISTS idx_system_canonical ON system(canonical_id) WHERE canonical_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_project_type ON system(project_id, system_type);

-- ============================================================
-- 2. Bus instance table
-- ============================================================
CREATE TABLE IF NOT EXISTS bus_instance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  canonical_id TEXT,
  name TEXT NOT NULL,
  protocol_id UUID REFERENCES protocol_definition(id),
  redundancy TEXT NOT NULL DEFAULT 'single'
    CHECK (redundancy IN ('single','dual','triple')),
  bandwidth_kbps NUMERIC,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bus_instance_project ON bus_instance(project_id);
CREATE INDEX IF NOT EXISTS idx_bus_instance_canonical ON bus_instance(canonical_id)
  WHERE canonical_id IS NOT NULL;

-- ============================================================
-- 3. Power modes table
-- ============================================================
CREATE TABLE IF NOT EXISTS system_power_mode (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_id UUID NOT NULL REFERENCES system(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  power_watts NUMERIC NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(system_id, mode)
);

-- ============================================================
-- 4. Add profile_data to connection table
-- ============================================================
ALTER TABLE connection ADD COLUMN IF NOT EXISTS profile_data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE connection ADD COLUMN IF NOT EXISTS canonical_id TEXT;

-- ============================================================
-- 5. Ensure bus_id FK on connection points to bus_instance
-- ============================================================
-- connection.bus_id already exists in migration 002 as:
--   bus_id UUID REFERENCES bus(id)
-- Since bus table was never created, we need to:
--   a) Drop the orphaned FK if it exists
--   b) Re-add pointing to bus_instance
ALTER TABLE connection DROP CONSTRAINT IF EXISTS connection_bus_id_fkey;
ALTER TABLE connection ADD CONSTRAINT connection_bus_id_fkey
  FOREIGN KEY (bus_id) REFERENCES bus_instance(id) ON DELETE SET NULL;
```

### Entity Relationship Diagram

```
project
  ├── system (hierarchy via parent_system_id)
  │     ├── system_port
  │     │     └── connection (source_port_id, dest_port_id)
  │     │           ├── bus_id → bus_instance
  │     │           ├── protocol_id → protocol_definition
  │     │           └── message
  │     │                 └── parameter
  │     ├── system_function
  │     └── system_power_mode
  └── bus_instance
        └── protocol_id → protocol_definition
```

## API Design

### New Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/systems/:id/children` | List direct children of a system |
| GET | `/api/systems/:id/subtree?depth=N` | Get full subtree to N levels |
| GET | `/api/systems/:id/budget-rollup` | Compute mass/power/volume rollup |
| POST | `/api/bus-instances` | Create a bus instance |
| GET | `/api/bus-instances` | List bus instances (filter by project) |
| GET | `/api/bus-instances/:id` | Get bus instance with loading analysis |
| GET | `/api/bus-instances/:id/loading` | Compute bus loading breakdown |
| GET | `/api/bus-instances/:id/messages` | List all messages on this bus |
| POST | `/api/systems/:id/power-modes` | Add a power mode |
| GET | `/api/systems/:id/power-modes` | List power modes |
| PUT | `/api/systems/:id/diagram-position` | Update diagram x/y |
| GET | `/api/projects/:id/architecture-diagram` | Get all data for diagram rendering |

### Modified Endpoints

| Method | Path | Change |
|---|---|---|
| POST | `/api/systems` | Accept new fields: parent_system_id, dal_level, redundancy_group, location, mass_kg, power_watts, volume_cm3, length_mm, width_mm, height_mm, budget_status, profile_data |
| PUT | `/api/systems/:id` | Accept updates to all new fields |
| POST | `/api/connections` | Accept bus_id, profile_data; validate protocol match with bus_instance |
| POST | `/api/messages` | Enforce protocol validation rules from protocol_definition.validation_rules |

### Validation Rules Engine

```typescript
// Protocol validation on message creation
async validateMessage(connection: Connection, message: CreateMessageInput): Promise<ValidationResult> {
  const protocol = await this.protocolRepo.findById(connection.protocol_id);
  const rules = protocol.validation_rules as ProtocolRules;

  const errors: string[] = [];

  // Count existing messages on this bus
  if (connection.bus_id) {
    const busConnections = await this.connectionRepo.findByBusId(connection.bus_id);
    const totalMessages = await this.messageRepo.countByConnectionIds(busConnections.map(c => c.id));

    if (rules.max_labels_per_channel && totalMessages >= rules.max_labels_per_channel) {
      errors.push(`Bus label limit exceeded: ${totalMessages}/${rules.max_labels_per_channel}`);
    }
  }

  // Protocol-specific checks
  if (protocol.protocol_name === 'ARINC 429') {
    if (rules.word_size && message.word_count !== rules.word_size) {
      errors.push(`A429 word size must be ${rules.word_size} bits`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### Bus Loading Computation

```typescript
async computeBusLoading(busInstanceId: string): Promise<BusLoadingResult> {
  const bus = await this.busInstanceRepo.findById(busInstanceId);
  const connections = await this.connectionRepo.findByBusId(busInstanceId);
  const protocol = await this.protocolRepo.findById(bus.protocol_id);

  let totalLoadBps = 0;
  const breakdown: ConnectionLoading[] = [];

  for (const conn of connections) {
    const messages = await this.messageRepo.findByConnectionId(conn.id);
    let connLoadBps = 0;

    for (const msg of messages) {
      const rateBps = computeMessageBitRate(protocol.protocol_name, msg);
      connLoadBps += rateBps;
    }

    totalLoadBps += connLoadBps;
    breakdown.push({ connectionId: conn.id, name: conn.name, loadBps: connLoadBps });
  }

  const capacityBps = (bus.bandwidth_kbps ?? 0) * 1000;
  const utilizationPct = capacityBps > 0 ? (totalLoadBps / capacityBps) * 100 : 0;

  return {
    busInstanceId, name: bus.name, protocol: protocol.protocol_name,
    capacityBps, totalLoadBps, utilizationPct,
    status: utilizationPct > 100 ? 'error' : utilizationPct > 80 ? 'warning' : 'ok',
    breakdown,
  };
}
```

## Frontend Design

### Architecture Diagram Page

Built with `@xyflow/react` (already used in AssureFlow trace graph).

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Architecture │ [Project: eVTOL FCS ▾]                   │
│                                                          │
│ Filters: [DAL ▾] [Type ▾] [ATA ▾] [Location ▾]        │
│ View:    [All] [By ATA] [By Location] [By Redundancy]  │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │                                                      ││
│ │   [ADIRU] ──── A429 Bus 1 ────→ [FCC]              ││
│ │   DAL:A         67%              DAL:A              ││
│ │   12.3kg                         8.7kg              ││
│ │      │                              │                ││
│ │      │ AFDX VL042                   │ CAN Bus A     ││
│ │      ▼                              ▼                ││
│ │   [DMC]                          [BMS]              ││
│ │   DAL:B                          DAL:C              ││
│ │                                                      ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ Budget Summary:                                          │
│ Mass: 47.2 / 50.0 kg (94%) ⚠️  Power: 340W normal     │
└─────────────────────────────────────────────────────────┘
```

**Node component:** Custom React Flow node showing system name, DAL badge, mass, and type icon.

**Edge component:** Custom React Flow edge showing bus name, protocol icon, and loading percentage.

**Interactions:**
- Drag to reposition → saves diagram_x/y via PUT
- Double-click box → drill into children
- Click box → side panel with full system details + allocated requirements (from AssureFlow via MCP)
- Click line → side panel with bus details + message list + loading breakdown
- Right-click → context menu (edit, delete, add connection, add child)

## Cross-Product Integration

### AssureFlow → ConnectedICD

AssureFlow references ConnectedICD systems by canonical ID in trace links:
```json
{
  "sourceCanonicalId": "ee-aero.requirement.sys001",
  "targetCanonicalId": "ee-aero.block.fcc-primary",
  "linkType": "allocated-to"
}
```

### SafetyNow → ConnectedICD

SafetyNow references ConnectedICD systems in FHA/PSSA entries:
```json
{
  "failureCondition": "Loss of flight control",
  "affectedSystems": ["ee-aero.block.fcc-primary", "ee-aero.block.fcc-backup"],
  "commonBus": "ee-aero.bus.a429-bus-1"
}
```

### MCP Artifacts

The `artifacts.list` tool returns architecture artifacts:
```json
{
  "artifacts": [{
    "id": "ARCH-proj123",
    "artifactType": "ARCHITECTURE",
    "title": "eVTOL FCS Architecture (23 systems, 45 connections, 8 buses)",
    "completeness": 0.78,
    "status": "draft",
    "metrics": {
      "systems": 23, "connections": 45, "busInstances": 8,
      "budgetCoverage": { "mass": 0.85, "power": 0.70, "volume": 0.45 }
    }
  }]
}
```

## Implementation Phases

| Phase | Scope | Files Changed |
|---|---|---|
| **1a** | Run migration 002 (ICD hierarchy foundation) | DB only |
| **1b** | Run migration 017 (this spec — enrichments) | DB only |
| **1c** | API: system hierarchy, budgets, new fields | `system-service.ts`, `system-routes.ts` |
| **1d** | API: bus_instance CRUD + loading | New: `bus-instance-service.ts`, `bus-instance-routes.ts` |
| **1e** | API: power modes CRUD | New: `power-mode-routes.ts` |
| **1f** | API: protocol validation enforcement | `message-service.ts` (modify) |
| **1g** | Frontend: architecture diagram page | New: `architecture/page.tsx` with @xyflow/react |
| **1h** | Frontend: filtered views | Filter controls on diagram page |
| **1i** | MCP: update artifacts.list/get/export for architecture | `mcp-server/server.py` |

## Standards Compliance

| Standard | How This Spec Complies |
|---|---|
| §1 Backend | All business logic in services (bus-instance-service, system-service). Routes are thin. |
| §2 Backend | Zod .strict() schemas for all new inputs (CreateBusInstanceSchema, UpdateSystemSchema, etc.) |
| §3 Backend | SysML export returns 501 until implemented |
| §6 Backend | All queries parameterized via Knex builder |
| §7 Domain | Audit trail on all mutations, immutability trigger applied |
| §8 Backend | Error envelope {error: {code, message, details?}} on all validation failures |
| §9 Backend | No secrets, rate limiting inherited from server.ts |
| §9.2 MCP | artifacts.list/get/export updated for architecture data |
