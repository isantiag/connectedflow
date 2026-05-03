# Tasks — ConnectedICD Architecture Model Phase 1

## Task 1: Apply ICD Hierarchy Foundation (Migration 002)

**Spec:** Prerequisite — the existing migration 002 creates the foundation tables (system, system_port, system_function, connection, message, parameter, protocol_definition + seed data).

- [ ] Verify ConnectedICD PostgreSQL is running (`docker compose up -d`)
- [ ] Apply migration 002: `docker compose exec -T postgres psql -U connectedflow -d connectedflow < migrations/002_icd_hierarchy.sql`
- [ ] Verify tables created: system, system_port, system_function, connection, message, parameter, protocol_definition
- [ ] Verify protocol seed data: ARINC 429, ARINC 825, AFDX, MIL-STD-1553, Discrete, Analog
- [ ] Run existing tests to confirm no regressions

## Task 2: Create and Apply Migration 017 (Architecture Enrichments)

**Spec:** Requirements 1-13 (system enrichment, bus_instance, power modes, profile_data)

- [ ] Create `migrations/017_architecture_model_phase1.sql` with all schema changes from design doc
- [ ] Apply migration to ConnectedICD database
- [ ] Verify new columns on system table (parent_system_id, dal_level, redundancy_group, location, mass_kg, power_watts, volume_cm3, length_mm, width_mm, height_mm, budget_status, diagram_x, diagram_y, profile_data, canonical_id)
- [ ] Verify bus_instance table created with correct constraints
- [ ] Verify system_power_mode table created
- [ ] Verify connection.bus_id FK now points to bus_instance
- [ ] Verify indexes created

## Task 3: System Hierarchy API

**Spec:** Requirement 1 (hierarchy), Requirement 2 (system types), Requirement 13 (canonical IDs)

- [ ] Add Zod schemas: `UpdateSystemSchema` with new fields (parent_system_id, dal_level, etc.)
- [ ] Update system service: accept and persist new fields on create/update
- [ ] Add `GET /api/systems/:id/children` endpoint
- [ ] Add `GET /api/systems/:id/subtree?depth=N` endpoint (recursive CTE or application-level recursion)
- [ ] Auto-generate canonical_id on system creation (`ee-aero.block.{id}`)
- [ ] Add audit logging on all system mutations
- [ ] Write tests for hierarchy CRUD, subtree query, canonical ID generation

## Task 4: Budget Rollup API

**Spec:** Requirements 6, 7, 8, 9 (mass, power, volume, budget status)

- [ ] Add `GET /api/systems/:id/budget-rollup` endpoint
- [ ] Implement recursive mass rollup (sum children's mass_kg)
- [ ] Implement recursive power rollup per mode (sum children's power_watts + power modes)
- [ ] Implement volume rollup (sum children's volume_cm3)
- [ ] Add budget overrun warnings in response
- [ ] Add `mass_rollup_complete` flag (false if any child missing mass)
- [ ] Write tests for rollup computation, overrun detection, incomplete data handling

## Task 5: Power Modes API

**Spec:** Requirement 7 (power modes)

- [ ] Add Zod schema: `CreatePowerModeSchema` (.strict())
- [ ] Create power mode service with CRUD operations
- [ ] Add `POST /api/systems/:id/power-modes` endpoint
- [ ] Add `GET /api/systems/:id/power-modes` endpoint
- [ ] Add `DELETE /api/systems/:id/power-modes/:modeId` endpoint
- [ ] Include power modes in system GET response
- [ ] Add audit logging on power mode mutations
- [ ] Write tests

## Task 6: Bus Instance API

**Spec:** Requirements 10, 11 (bus instance, bus loading)

- [ ] Add Zod schema: `CreateBusInstanceSchema` (.strict())
- [ ] Create bus instance service with CRUD operations
- [ ] Add `POST /api/bus-instances` endpoint
- [ ] Add `GET /api/bus-instances?projectId=X` endpoint
- [ ] Add `GET /api/bus-instances/:id` endpoint (include connection count, message count, loading)
- [ ] Validate protocol match when assigning connection to bus (connection.protocol_id must match bus_instance.protocol_id)
- [ ] Add `GET /api/bus-instances/:id/loading` endpoint with per-connection breakdown
- [ ] Add `GET /api/bus-instances/:id/messages` endpoint
- [ ] Implement bus loading computation per protocol type (A429, CAN, AFDX)
- [ ] Add canonical_id auto-generation (`ee-aero.bus.{id}`)
- [ ] Add audit logging
- [ ] Write tests for CRUD, protocol validation, loading computation

## Task 7: Protocol Validation Enforcement

**Spec:** Requirement 16 (protocol validation)

- [ ] Read validation_rules from protocol_definition on message creation
- [ ] Implement A429 validation: label range, word size, max labels per channel
- [ ] Implement CAN validation: CAN ID range, DLC limit
- [ ] Implement AFDX validation: VL ID range, BAG minimum, max frame size
- [ ] Return error envelope with rule details on validation failure
- [ ] Write tests for each protocol's validation rules

## Task 8: Architecture Diagram Frontend

**Spec:** Requirements 14, 15 (diagram, filtered views)

- [ ] Create `architecture/page.tsx` in the web client
- [ ] Install/configure @xyflow/react (check if already available)
- [ ] Create custom node component: system box with name, DAL badge, mass, type icon
- [ ] Create custom edge component: bus line with name, protocol, loading percentage
- [ ] Implement data fetching: `GET /api/projects/:id/architecture-diagram`
- [ ] Implement drag-to-reposition with position save (PUT diagram_x/y)
- [ ] Implement double-click drill-down into children
- [ ] Implement click-to-select with side panel (system details or bus details)
- [ ] Implement auto-layout for systems with no saved positions
- [ ] Add filter controls: DAL, system type, ATA chapter, location, redundancy group
- [ ] Implement filter logic: re-query with filter params, re-render
- [ ] Add budget summary bar at bottom (mass total, power total, warnings)
- [ ] Write E2E tests for diagram rendering and interaction

## Task 9: Audit Trail Integration

**Spec:** Requirement 17 (audit on all mutations)

- [ ] Ensure audit interceptor/middleware covers all new endpoints (bus_instance, power_mode, system updates)
- [ ] Verify immutability trigger is applied to ConnectedICD audit table (create if needed, matching AssureFlow pattern)
- [ ] Write test: attempt UPDATE on audit entry → expect error

## Task 10: MCP Artifacts Update

**Spec:** Requirement 18 (MCP artifacts for architecture)

- [ ] Update `artifacts.list` in MCP server to include ARCHITECTURE artifact type
- [ ] Update `artifacts.get` to return full architecture data (systems, buses, connections)
- [ ] Update `artifacts.export` to return structured JSON with all architecture entities
- [ ] Add `format=sysml` parameter that returns 501 (stub per §3)
- [ ] Test MCP tools with architecture data
