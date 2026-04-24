# 3-Level ICD Hierarchy: Implementation Tasks

## Tasks

- [x] 1. Database migration
  - [x] 1.1 Audit existing schema (25 tables, identify gaps)
  - [x] 1.2 Write migration SQL for 11 new tables (system, system_port, system_function, connection, message, parameter, signal_parameter_link, wire_type, connector_type, data_encoding, unit_of_measure)
  - [x] 1.3 Seed 6 protocol definitions (ARINC 429, ARINC 825, AFDX, MIL-STD-1553, Discrete, Analog) with field_schema and validation_rules JSONB
  - [x] 1.4 Run migration and verify all tables created
    - _Requirements: 2.1, 5.1_

- [ ] 2. API server — new endpoints
  - [ ] 2.1 Add GET /api/systems (list systems in project, with port/connection counts)
  - [ ] 2.2 Add POST /api/systems (create a system with ports and functions)
  - [ ] 2.3 Add GET /api/systems/:id (system detail with ports, functions, connection summary)
  - [ ] 2.4 Add GET /api/systems/:id/connections (all connections for a system with protocol info)
  - [ ] 2.5 Add GET /api/connections/:id/messages (messages on a connection, protocol-specific columns)
  - [ ] 2.6 Add GET /api/messages/:id/parameters (parameters in a message, bit-level detail)
  - [ ] 2.7 Add POST /api/connections, POST /api/messages, POST /api/parameters (create operations)
  - [ ] 2.8 Add GET /api/protocols (list protocol definitions with field_schema for dynamic form rendering)
  - [ ] 2.9 Verify existing /api/signals endpoint still works unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 5.3, 5.4_

- [ ] 3. Seed data — eVTOL avionics test dataset
  - [ ] 3.1 Create systems: FCC, ADC, AHRS, BMS, EPS, NAV with appropriate system_type and ata_chapter
  - [ ] 3.2 Create ports for each system (A429 Tx/Rx, Discrete I/O, Analog inputs)
  - [ ] 3.3 Create functions for each system (Air Data Processing, Attitude Computation, Battery Management, etc.)
  - [ ] 3.4 Create connections between systems with appropriate bus types (FCC↔ADC/A429, BMS↔EPS/Analog, etc.)
  - [ ] 3.5 Create messages with protocol-specific attrs (A429 labels, discrete pins, analog channels)
  - [ ] 3.6 Create parameters with bit-level detail (offset, length, encoding, range, resolution, units)
  - [ ] 3.7 Link parameters to functions and optionally to existing signals via signal_parameter_link
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 4. Frontend — System Explorer view
  - [ ] 4.1 Create /systems route with system list page (cards showing name, type, connection count)
  - [ ] 4.2 Create /systems/[id] route with system detail (ports table, functions table, connections table)
  - [ ] 4.3 Create /connections/[id] route with message list (columns driven by protocol field_schema)
  - [ ] 4.4 Create /messages/[id] route with parameter detail (columns driven by protocol field_schema)
  - [ ] 4.5 Add breadcrumb navigation (Project → System → Connection → Message → Parameter)
  - [ ] 4.6 Add "Systems" link to sidebar navigation
  - [ ] 4.7 Fetch protocol field_schema from /api/protocols to render dynamic columns
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 4.1, 4.2, 4.3_

- [ ] 5. End-to-end verification
  - [ ] 5.1 Verify 3-level drill-down works with seed data (System → Connection → Message → Parameter)
  - [ ] 5.2 Verify existing /signals page still works
  - [ ] 5.3 Verify protocol-specific columns render correctly for A429, Discrete, and Analog
  - [ ] 5.4 Verify API returns correct data at each level
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4_
