# Requirements Document — ConnectedICD Architecture Model Phase 2

## Introduction

Phase 2 adds device templates (reusable LRU definitions from dBricks), cross-product allocation table (from System Composer), ICD document generation, SysML import/export stubs, and TASK-046 signal export.

## Requirements

### Requirement 1: Device Templates

**User Story:** As an ICD engineer, I want to define reusable device templates (by part number) with ports and functions, so that I can instantiate the same LRU type across multiple projects without re-entering data.

#### Acceptance Criteria

1. WHEN a user creates a device template THEN the system SHALL store name, part_number (unique), manufacturer, system_type, description, and profile_data
2. WHEN a user adds ports to a template THEN the system SHALL store port name, direction, protocol_id, and connector_label
3. WHEN a user adds functions to a template THEN the system SHALL store function name, description, criticality, and DAL
4. WHEN a user instantiates a template into a project THEN the system SHALL create a system entity with template_id FK, copying all ports into system_port and all functions into system_function
5. WHEN a template is queried by ID THEN the response SHALL include all ports and functions

### Requirement 2: Allocation Table

**User Story:** As a systems architect, I want to create formal allocation relationships between entities across products (requirements → systems, functions → systems, systems → failure conditions), so that I can trace cross-product dependencies.

#### Acceptance Criteria

1. WHEN a user creates an allocation THEN the system SHALL store source_canonical_id, target_canonical_id, allocation_type, source_product, target_product, and rationale
2. WHEN allocation_type is provided THEN it SHALL be one of: functional, logical, physical, resource, specifies, failure_mode
3. WHEN a user queries allocations THEN the system SHALL support filtering by project_id, source_canonical_id, target_canonical_id, and allocation_type
4. WHEN a duplicate allocation (same source + target + type) is created THEN the system SHALL reject with a conflict error

### Requirement 3: ICD Document Generation

**User Story:** As an ICD engineer, I want to auto-generate an ICD document between two systems, so that I can produce consistent, error-free interface documentation without manual effort.

#### Acceptance Criteria

1. WHEN a user requests ICD export with systemA and systemB IDs THEN the system SHALL query all connections between those systems with their messages and parameters
2. WHEN format=json THEN the response SHALL include cover metadata, protocol-grouped sections, and a flat signal list
3. WHEN format=csv THEN the response SHALL return a CSV with columns: signal_name, source_system, dest_system, protocol, data_type, units, refresh_rate, bit_offset, bit_length, encoding

### Requirement 4: SysML Import/Export Stub

**User Story:** As a systems engineer working with DoD programs, I want SysML interoperability, so that I can exchange architecture data with Cameo/Capella/other MBSE tools.

#### Acceptance Criteria

1. WHEN a user calls POST /api/sysml/import THEN the system SHALL return 501 Not Implemented per §3 Backend
2. WHEN a user calls GET /api/sysml/export?format=json THEN the system SHALL return architecture data mapped to SysML-like structure (blocks, ports, connectors)
3. WHEN a user calls GET /api/sysml/export?format=sysmlv2 THEN the system SHALL return 501 Not Implemented per §3 Backend

### Requirement 5: Signal Export (TASK-046)

**User Story:** As a test engineer, I want to export signals by project as structured data, so that I can feed signal definitions into test benches and simulation tools.

#### Acceptance Criteria

1. WHEN a user calls GET /api/signals/export?projectId=X THEN the system SHALL return all signals for that project joined with logical_layer and transport_layer data
2. WHEN projectId is missing THEN the system SHALL return 400 with error envelope
3. WHEN format=xlsx is requested THEN the system SHALL return JSON data with a note that xlsx format is pending
