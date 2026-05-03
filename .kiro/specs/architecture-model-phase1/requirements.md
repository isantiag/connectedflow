# Requirements Document — ConnectedICD Architecture Model Phase 1: Systems Architecture & LRU Connectivity

## Introduction

ConnectedICD Architecture Model Phase 1 enriches the existing ICD hierarchy data model (migration 002) with systems architecture capabilities needed for design reviews, safety analysis, and cross-product traceability. This phase adds system hierarchy (decomposition), bus instance grouping, component budgets (mass/power/volume), diagram visualization, and protocol validation enforcement.

The primary use case: a cognizant engineer opens ConnectedICD and sees an LRU connectivity diagram showing every box on the aircraft connected by labeled bus lines. They can zoom into subsystems, overlay DAL levels, check bus loading, review mass/power budgets, and click any line to see the full ICD data dictionary (messages, parameters, bit-level detail). The diagram is the single visual entry point for design reviews (PDR/CDR), safety analysis (PSSA/CCA), and ICD coordination.

### Design Influences

This specification incorporates lessons from:
- **PEERSS/dBricks** — Bus as named typed connection (not a component), device template/instance separation, physical+logical layer separation, automated ICD generation, protocol-specific validation
- **MATLAB System Composer** — Four architecture primitives (component, port, connection, interface), stereotypes for extensible metadata, allocations as first-class relationships, query-based filtered views
- **CPACS (DLR)** — Parametric component budgets (mass, power, volume), hierarchical system decomposition
- **GENESYS (Zuken Vitech)** — Entity-Relationship-Attribute language, design completeness and integrity checks, N² diagrams (both physical and interface)

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Bus modeled as grouping entity (`bus_instance`), not as a component | Validated by dBricks, System Composer, CPACS, and practitioner experience. Buses appear as labeled lines on diagrams, not boxes. GENESYS models bus as component but this conflicts with avionics ICD practice. |
| System hierarchy via `parent_system_id` self-reference | Both GENESYS (`built from`) and CPACS (XML nesting) use hierarchical decomposition. Self-referencing FK is the simplest relational pattern. |
| Extensible metadata via `profile_data` JSONB | Inspired by System Composer stereotypes. Avoids schema changes when adding new component properties (MTBF, cooling type, MIL-SPEC, etc.). |
| Budgets (mass/power/volume) as first-class columns, not JSONB | These are universally needed for every design review. First-class columns enable SQL aggregation (SUM for rollups, comparison for budget checks). |
| Power modes as separate table | Aircraft power analysis requires mode-dependent loads (normal, standby, emergency, peak) per DO-160 and MIL-STD-704. A single `power_watts` column is insufficient. |
| Diagram positions stored in DB | Enables persistent layout across sessions. Users position LRUs once; the layout is saved. |
| Filtered views via query parameters, not separate diagrams | Inspired by System Composer. One model, many views. Filter by DAL, ATA chapter, location, redundancy group. |
| ConnectedICD owns the architecture model; AssureFlow and SafetyNow are consumers | Architecture is "how it's built" — belongs with the ICD/systems tool. Requirements ("what it shall do") stay in AssureFlow. Safety ("how it can fail") stays in SafetyNow. Cross-references via canonical IDs. |

### Glossary

- **System**: A physical or logical entity in the aircraft architecture — can be an aircraft, system, subsystem, LRU, sensor, actuator, bus coupler, HW item, or SW item
- **System Hierarchy**: Parent-child decomposition of systems (e.g., Aircraft → Flight Control System → FCC → FCC Software)
- **System Port**: A physical connection point on a system (connector pin, bus channel, discrete I/O)
- **Connection**: A physical link between two system ports, carrying data via a specific protocol
- **Bus Instance**: A named grouping of connections that share the same physical bus medium (e.g., "A429 Bus 1" groups all connections on that ARINC 429 channel)
- **Protocol Definition**: A reusable definition of a communication protocol with field schemas and validation rules (e.g., ARINC 429 v3, AFDX 664p7)
- **Message**: A protocol-specific data unit carried on a connection (e.g., A429 label, CAN frame, AFDX virtual link)
- **Parameter**: A data element within a message (e.g., altitude in bits 28:10 of A429 label 0203)
- **System Function**: A logical capability hosted by a system (e.g., "Air Data Processing" on the ADIRU)
- **Budget**: A quantitative property of a system subject to rollup and limit checking (mass, power, volume)
- **Budget Status**: The maturity level of a budget value: `estimated`, `calculated`, `measured`, `verified`
- **Power Mode**: A named operating condition with a specific power consumption (e.g., normal=120W, standby=15W, emergency=85W, peak=180W)
- **Profile Data**: Extensible JSONB metadata on any entity, inspired by System Composer stereotypes (e.g., MTBF, cooling type, environmental qualification)
- **Canonical ID**: A globally unique identifier in the format `ee-aero.{entity_type}.{unique_id}` used for cross-product traceability between ConnectedICD, AssureFlow, and SafetyNow
- **Filtered View**: A query-based subset of the architecture diagram showing only entities matching filter criteria (e.g., "DAL A systems only")
- **LRU Connectivity Diagram**: A block-and-line diagram showing systems as boxes and connections as labeled lines, the primary visualization for design reviews

## Requirements

### Requirement 1: System Hierarchy (Decomposition)

**User Story:** As a systems engineer, I want to decompose systems into subsystems and items in a parent-child hierarchy, so that I can represent the aircraft architecture at multiple levels of abstraction and zoom into any level during design reviews.

#### Acceptance Criteria

1. WHEN a user creates a system with a `parent_system_id` referencing another system in the same project THEN the system SHALL be stored as a child of that parent and appear in the hierarchy tree
2. WHEN a user queries a system THEN the response SHALL include the parent system reference and a list of direct children
3. WHEN a user queries a system with `?depth=N` THEN the response SHALL return the full subtree to N levels deep
4. WHEN a user deletes a parent system THEN the system SHALL either cascade-delete all children or reject the deletion if children exist, based on a `force` parameter
5. WHEN a user moves a system to a different parent THEN the system SHALL update the `parent_system_id` and maintain all existing ports, connections, and functions
6. WHEN the hierarchy depth exceeds 6 levels THEN the system SHALL accept it (no artificial depth limit) but log a warning
7. WHEN a system has `parent_system_id = NULL` THEN it SHALL be treated as a root-level system (aircraft or top-level system)

### Requirement 2: System Type Expansion

**User Story:** As a systems architect, I want to classify systems by type (aircraft, system, subsystem, LRU, sensor, actuator, HW item, SW item), so that I can filter and visualize the architecture by component category.

#### Acceptance Criteria

1. WHEN a user creates a system THEN the `system_type` field SHALL accept the following values: `aircraft`, `system`, `subsystem`, `lru`, `sensor`, `actuator`, `switch`, `bus_coupler`, `hw_item`, `sw_item`, `equipment`
2. WHEN a user queries systems with `?system_type=lru` THEN the response SHALL return only systems of that type
3. WHEN a user creates a system with an invalid `system_type` THEN the system SHALL reject the request with a validation error
4. WHEN rendering the LRU connectivity diagram THEN the system SHALL use distinct visual styles (shape, color, icon) for each system type

### Requirement 3: DAL Level Assignment

**User Story:** As a safety engineer, I want to assign Design Assurance Levels to systems, so that I can visualize DAL distribution across the architecture and support FDAL/IDAL allocation per ARP 4761A Appendix P.

#### Acceptance Criteria

1. WHEN a user sets `dal_level` on a system THEN the system SHALL accept values: `A`, `B`, `C`, `D`, `E`, or empty string (unassigned)
2. WHEN a user queries systems with `?dal_level=A` THEN the response SHALL return only DAL A systems
3. WHEN rendering the diagram with DAL overlay THEN the system SHALL color-code systems by DAL level using the standard color scheme (A=red, B=orange, C=yellow, D=green, E=blue, unassigned=gray)
4. WHEN a system's DAL level changes THEN the system SHALL record the change in the audit trail with the previous and new values

### Requirement 4: Redundancy Group

**User Story:** As a systems engineer, I want to group systems into redundancy sets (e.g., "FCC-dual" for FCC-L and FCC-R), so that I can visualize redundancy architecture and support independence analysis for safety assessment.

#### Acceptance Criteria

1. WHEN a user sets `redundancy_group` on a system THEN the system SHALL store the free-text group name
2. WHEN a user queries systems with `?redundancy_group=FCC-dual` THEN the response SHALL return all systems in that group
3. WHEN rendering the diagram with redundancy overlay THEN the system SHALL visually group systems with the same `redundancy_group` (shared border, background, or badge)
4. WHEN a redundancy group has only one member THEN the system SHALL flag a warning: "Redundancy group has single member — verify architecture intent"

### Requirement 5: Physical Location

**User Story:** As a systems engineer, I want to record the physical location of each system on the aircraft, so that I can support Zonal Safety Analysis (ZSA per ARP 4761A Appendix K) and installation planning.

#### Acceptance Criteria

1. WHEN a user sets `location` on a system THEN the system SHALL store the free-text location string (e.g., "Avionics Bay Rack 2", "Left Wing Root", "Nose Section")
2. WHEN a user queries systems with `?location=Avionics Bay` THEN the response SHALL return all systems whose location contains the search string (case-insensitive partial match)
3. WHEN rendering the diagram with location grouping THEN the system SHALL arrange systems into location-based swimlanes or clusters

### Requirement 6: Mass Budget

**User Story:** As a systems engineer, I want to track mass (weight) for each system and compute rollups at each hierarchy level, so that I can manage the aircraft mass budget and detect overruns early.

#### Acceptance Criteria

1. WHEN a user sets `mass_kg` on a system THEN the system SHALL store the numeric value (nullable, precision to 3 decimal places)
2. WHEN a user queries a parent system with `?include_budget_rollup=true` THEN the response SHALL include `mass_rollup_kg` computed as the sum of all children's `mass_kg` values (recursively)
3. WHEN the sum of children's masses exceeds the parent's `mass_kg` value THEN the response SHALL include a warning: "Mass budget exceeded: children total {X} kg > parent budget {Y} kg"
4. WHEN any child in the subtree has `mass_kg = NULL` THEN the rollup SHALL include a flag: `mass_rollup_complete: false` with a count of systems missing mass data
5. WHEN `mass_kg` is modified THEN the system SHALL record the change in the audit trail per §2 Domain

### Requirement 7: Power Budget and Power Modes

**User Story:** As an electrical engineer, I want to track power consumption per system across multiple operating modes (normal, standby, emergency, peak), so that I can perform Electrical Load Analysis (ELA) and verify power source adequacy.

#### Acceptance Criteria

1. WHEN a user sets `power_watts` on a system THEN the system SHALL store the nominal power consumption (nullable)
2. WHEN a user creates a power mode for a system THEN the system SHALL store the mode name, power value in watts, and optional description in the `system_power_mode` table
3. WHEN a user queries a system THEN the response SHALL include all defined power modes
4. WHEN a user queries a parent system with `?include_budget_rollup=true` THEN the response SHALL include `power_rollup_watts` per mode, computed as the sum of all children's power values for each mode
5. WHEN the total power for any mode exceeds a defined limit THEN the response SHALL include a warning
6. WHEN a power mode is added, modified, or deleted THEN the system SHALL record the change in the audit trail per §2 Domain
7. WHEN a system has `power_watts` set but no power modes defined THEN the system SHALL treat `power_watts` as the "normal" mode value

### Requirement 8: Volume and Dimensions Budget

**User Story:** As a mechanical engineer, I want to track physical dimensions and volume for each system, so that I can plan avionics bay layouts and rack installations.

#### Acceptance Criteria

1. WHEN a user sets `volume_cm3`, `length_mm`, `width_mm`, or `height_mm` on a system THEN the system SHALL store the numeric values (all nullable)
2. WHEN `length_mm`, `width_mm`, and `height_mm` are all set but `volume_cm3` is not THEN the system SHALL compute `volume_cm3` as `(length_mm × width_mm × height_mm) / 1000`
3. WHEN a user queries a parent system with `?include_budget_rollup=true` THEN the response SHALL include `volume_rollup_cm3` as the sum of children's volumes

### Requirement 9: Budget Status Tracking

**User Story:** As a program manager, I want to track the maturity of budget data (estimated vs measured vs verified), so that I can assess confidence in mass/power/volume numbers at each design review milestone.

#### Acceptance Criteria

1. WHEN a user sets `budget_status` on a system THEN the system SHALL accept values: `estimated`, `calculated`, `measured`, `verified`
2. WHEN a user queries systems with `?budget_status=estimated` THEN the response SHALL return only systems with that status
3. WHEN rendering the diagram THEN the system SHALL indicate budget status visually (e.g., dashed border for estimated, solid for verified)
4. WHEN generating a budget report THEN the system SHALL include a maturity summary: count of systems per budget status

### Requirement 10: Bus Instance (Named Bus Grouping)

**User Story:** As an ICD engineer, I want to define named bus instances that group connections sharing the same physical bus medium, so that I can manage bus loading, generate per-bus ICDs, and trace bus-level failures for safety analysis.

#### Acceptance Criteria

1. WHEN a user creates a bus instance THEN the system SHALL store: project_id, name (unique per project), protocol_id (FK to protocol_definition), redundancy (`single`, `dual`, `triple`), bandwidth_kbps, description, and status
2. WHEN a user assigns a connection to a bus instance via `bus_id` THEN the system SHALL validate that the connection's protocol matches the bus instance's protocol
3. WHEN a user queries a bus instance THEN the response SHALL include the count of connections, total message count, and computed bus loading percentage
4. WHEN bus loading exceeds 80% THEN the response SHALL include a warning; WHEN it exceeds 100% THEN the response SHALL include an error
5. WHEN a user queries connections with `?bus_id={id}` THEN the response SHALL return all connections on that bus instance
6. WHEN a bus instance is deleted THEN the system SHALL set `bus_id = NULL` on all associated connections (not cascade-delete the connections)
7. WHEN rendering the diagram THEN connections belonging to the same bus instance SHALL be rendered as a single labeled line (or parallel lines for dual/triple redundancy) between the connected systems
8. WHEN a user clicks a bus line on the diagram THEN the system SHALL display the bus instance details: name, protocol, redundancy, bandwidth, loading percentage, and a list of all messages/parameters carried

### Requirement 11: Bus Loading Analysis

**User Story:** As an ICD engineer, I want automated bus loading computation per bus instance, so that I can verify bandwidth adequacy and identify overloaded buses before integration testing.

#### Acceptance Criteria

1. WHEN computing bus loading for an ARINC 429 bus instance THEN the system SHALL calculate: `(count of labels × average word rate) / max_channel_rate` and report as a percentage
2. WHEN computing bus loading for a CAN bus instance THEN the system SHALL calculate: `sum(message_rate × (header_bits + dlc × 8 + overhead_bits)) / bandwidth_bps` and report as a percentage
3. WHEN computing bus loading for an AFDX bus instance THEN the system SHALL calculate: `sum(max_frame_bytes / bag_ms) / bandwidth_kbps` per virtual link and report total utilization
4. WHEN a bus instance has no messages defined on its connections THEN the loading SHALL be reported as 0% with a flag: "No messages defined — loading cannot be computed"
5. WHEN bus loading results are requested THEN the response SHALL include per-connection breakdown showing each connection's contribution to total loading

### Requirement 12: Extensible Metadata (Profile Data)

**User Story:** As a systems engineer, I want to attach arbitrary metadata to systems, ports, and connections without schema changes, so that I can capture project-specific properties (MTBF, cooling type, MIL-SPEC qualification, environmental rating) as the design matures.

#### Acceptance Criteria

1. WHEN a user sets `profile_data` on a system THEN the system SHALL store the JSONB object and return it on subsequent queries
2. WHEN a user sets `profile_data` on a connection THEN the system SHALL store the JSONB object (add `profile_data` column to `connection` table)
3. WHEN a user queries systems with `?profile_data.cooling=convection` THEN the system SHALL support JSONB path queries for filtering
4. WHEN `profile_data` is modified THEN the system SHALL record the change in the audit trail per §2 Domain
5. WHEN exporting systems THEN the system SHALL include `profile_data` in the export payload

### Requirement 13: Canonical ID for Cross-Product Traceability

**User Story:** As a systems architect, I want every system, bus instance, and connection to have a globally unique canonical ID, so that AssureFlow can allocate requirements to architecture blocks and SafetyNow can reference them in fault trees.

#### Acceptance Criteria

1. WHEN a system is created THEN the system SHALL auto-generate a `canonical_id` in the format `ee-aero.block.{unique_id}` if not provided
2. WHEN a bus instance is created THEN the system SHALL auto-generate a `canonical_id` in the format `ee-aero.bus.{unique_id}`
3. WHEN a connection is created THEN the system SHALL auto-generate a `canonical_id` in the format `ee-aero.connection.{unique_id}`
4. WHEN a canonical ID is assigned THEN it SHALL be immutable — updates to the entity SHALL NOT change the canonical ID
5. WHEN querying by canonical ID THEN the system SHALL support lookup via `?canonical_id={value}` across all entity types
6. WHEN the `artifacts.list` MCP tool is called THEN the response SHALL include canonical IDs for all architecture entities

### Requirement 14: LRU Connectivity Diagram

**User Story:** As a cognizant engineer, I want a visual block-and-line diagram showing all systems connected by labeled bus lines, so that I can present the architecture at design reviews and navigate the ICD data visually.

#### Acceptance Criteria

1. WHEN a user opens the architecture diagram for a project THEN the system SHALL render all root-level systems as boxes and all connections as lines between them
2. WHEN a user double-clicks a system box THEN the system SHALL zoom into that system's children (drill-down into the hierarchy)
3. WHEN a user drags a system box to a new position THEN the system SHALL persist the `diagram_x` and `diagram_y` coordinates
4. WHEN connections share a `bus_instance` THEN they SHALL be rendered as a single labeled line between the connected systems (not individual lines per connection)
5. WHEN a user hovers over a system box THEN the system SHALL display a tooltip with: name, type, DAL, mass, power, location, and port count
6. WHEN a user hovers over a bus line THEN the system SHALL display a tooltip with: bus name, protocol, loading percentage, and message count
7. WHEN the diagram loads THEN the system SHALL auto-layout systems if no saved positions exist, using a force-directed or hierarchical layout algorithm
8. WHEN the diagram contains more than 50 systems THEN the system SHALL maintain interactive frame rate (>30fps pan/zoom) via virtualization or level-of-detail rendering

### Requirement 15: Filtered Views

**User Story:** As a systems engineer, I want to filter the architecture diagram by DAL level, system type, ATA chapter, location, or redundancy group, so that I can focus on specific aspects of the architecture during reviews.

#### Acceptance Criteria

1. WHEN a user selects a DAL filter (e.g., "DAL A only") THEN the diagram SHALL show only systems with that DAL level and their interconnecting buses
2. WHEN a user selects a system type filter (e.g., "LRUs only") THEN the diagram SHALL show only systems of that type
3. WHEN a user selects an ATA chapter filter (e.g., "27 — Flight Controls") THEN the diagram SHALL show only systems with that ATA chapter
4. WHEN a user selects a location filter (e.g., "Avionics Bay") THEN the diagram SHALL show only systems at that location
5. WHEN a user selects a redundancy group filter THEN the diagram SHALL show only systems in that group
6. WHEN multiple filters are active THEN they SHALL be combined with AND logic
7. WHEN a filter is active THEN external connections (to systems outside the filter) SHALL be shown as stub lines with the external system name labeled

### Requirement 16: Protocol Validation Enforcement

**User Story:** As an ICD engineer, I want the system to enforce protocol-specific validation rules when creating or modifying messages and parameters, so that I can catch specification violations before they reach integration testing.

#### Acceptance Criteria

1. WHEN a user creates a message on an ARINC 429 connection THEN the system SHALL validate: label number is octal 3-digit (000-377), word size is 32 bits, and the total label count on the bus does not exceed 256
2. WHEN a user creates a message on a CAN connection THEN the system SHALL validate: CAN ID is within range, DLC does not exceed 8 bytes
3. WHEN a user creates a message on an AFDX connection THEN the system SHALL validate: VL ID is within range, BAG is ≥ 1ms, max frame size does not exceed 1471 bytes
4. WHEN a validation rule is violated THEN the system SHALL reject the request with an error envelope `{error: {code: 'PROTOCOL_VALIDATION', message: '...', details: {rule, value, limit}}}` per §8 Backend
5. WHEN a user queries validation rules for a protocol THEN the system SHALL return the rules from `protocol_definition.validation_rules`

### Requirement 17: Audit Trail on All Architecture Mutations

**User Story:** As a configuration manager, I want every change to architecture data (systems, connections, bus instances, budgets) recorded in an immutable audit trail, so that I can provide certification evidence per ARP 4754B §5.6 Configuration Management.

#### Acceptance Criteria

1. WHEN any system, connection, bus_instance, system_port, message, parameter, or system_power_mode is created, updated, or deleted THEN the system SHALL write an audit entry with: entity type, entity ID, canonical ID, action (create/update/delete), previous values, new values, actor ID, and timestamp
2. WHEN an audit entry is written THEN it SHALL be immutable — UPDATE and DELETE operations on the audit table SHALL be blocked by a database trigger
3. WHEN a user queries the audit trail for an entity THEN the response SHALL return all changes in chronological order
4. WHEN exporting architecture data via `artifacts.export` THEN the export SHALL include the audit trail for all included entities

### Requirement 18: MCP Artifacts Interface for Architecture

**User Story:** As an AI agent or external tool, I want to query ConnectedICD architecture data via the MCP artifacts interface, so that I can perform cross-product analysis (e.g., "which requirements are allocated to systems with no redundancy?").

#### Acceptance Criteria

1. WHEN `artifacts.list` is called with `artifact_type=ARCHITECTURE` THEN the response SHALL include an artifact representing the project's architecture model with completeness metrics (systems defined, connections defined, buses defined, budget coverage)
2. WHEN `artifacts.get` is called for an architecture artifact THEN the response SHALL include the full system hierarchy, bus instances, and connection summary
3. WHEN `artifacts.export` is called for an architecture artifact THEN the response SHALL include all systems, ports, connections, bus instances, messages, parameters, and budget data in a structured JSON format suitable for import by other tools
4. WHEN `artifacts.export` is called with `format=sysml` THEN the system SHALL return a SysML v2-compatible JSON representation (future — return 501 until implemented)
