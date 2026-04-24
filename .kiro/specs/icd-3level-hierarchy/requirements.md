# 3-Level ICD Hierarchy: Requirements

## Requirement 1

**User Story:** As a systems integration engineer, I want to navigate ICDs by system (LRU) → bus type → message → parameter, so that I can drill down from a high-level system interconnect view to bit-level parameter detail without switching tools.

#### Acceptance Criteria

1. WHEN a user selects a project THEN the system SHALL display all systems (LRUs) in that project with name, type, manufacturer, and connection count
2. WHEN a user selects a system THEN the system SHALL display all connections to/from that system, grouped by connected system and bus type
3. WHEN a user selects a connection THEN the system SHALL display all messages on that connection with protocol-specific columns (A429: label#, SDI, rate | A825: CAN ID, DLC | AFDX: VL ID, BAG)
4. WHEN a user selects a message THEN the system SHALL display all parameters within that message with bit-level detail (offset, length, encoding, range, resolution, units)
5. WHEN navigating between levels THEN the system SHALL maintain breadcrumb context showing the full path (Project → System → Connection → Message → Parameter)

## Requirement 2

**User Story:** As an avionics engineer, I want protocol-flexible data storage using declarative field schemas, so that new bus protocols can be added without code changes.

#### Acceptance Criteria

1. WHEN a protocol definition exists with a field_schema JSONB THEN the system SHALL use that schema to determine which fields are valid for messages and parameters of that bus type
2. WHEN creating a message for a specific protocol THEN the system SHALL render a form with fields matching that protocol's field_schema, not a hardcoded form
3. WHEN a new protocol is added by inserting a row into protocol_definition THEN the system SHALL support CRUD operations for messages and parameters of that protocol without any code deployment
4. WHEN validating message or parameter data THEN the system SHALL apply the validation_rules from the protocol_definition for that bus type

## Requirement 3

**User Story:** As a systems engineer, I want the data model to separate physical ports from logical functions, so that the same parameter can be traced across multiple physical interfaces and the same port can carry parameters from multiple functions.

#### Acceptance Criteria

1. WHEN a system is created THEN the system SHALL allow defining both ports (physical connection points with protocol and direction) and functions (logical purposes with criticality and DAL)
2. WHEN a parameter is created within a message THEN the system SHALL allow linking it to a system function for logical traceability
3. WHEN querying a function's parameters THEN the system SHALL return all parameters linked to that function regardless of which port or connection carries them
4. WHEN querying a port's messages THEN the system SHALL return all messages on connections using that port regardless of which function the parameters belong to

## Requirement 4

**User Story:** As a systems integration engineer, I want to filter all interfaces for a specific LRU, so that I can see everything connected to one system regardless of bus type.

#### Acceptance Criteria

1. WHEN a user selects a system and requests "all interfaces" THEN the system SHALL display every connection involving that system across all bus types
2. WHEN filtering by system THEN the system SHALL show the total count of connections, messages, and parameters for that system
3. WHEN a system has connections via multiple bus types (e.g., A429 + Discrete + AFDX) THEN the system SHALL group or tag connections by bus type for clarity

## Requirement 5

**User Story:** As a project lead, I want the new hierarchical model to coexist with the existing flat signal table, so that current functionality is not broken during the transition.

#### Acceptance Criteria

1. WHEN the migration runs THEN the system SHALL NOT modify or drop any existing tables
2. WHEN a parameter in the new model corresponds to an existing signal THEN the system SHALL allow linking them via signal_parameter_link
3. WHEN the existing /api/signals endpoint is called THEN the system SHALL continue to return signals from the existing signal table unchanged
4. WHEN the new system explorer endpoints are called THEN the system SHALL return data from the new hierarchy tables

## Requirement 6

**User Story:** As a systems engineer, I want seed data representing a realistic eVTOL avionics architecture, so that I can test the 3-level drill-down with real-world data patterns.

#### Acceptance Criteria

1. WHEN seed data is loaded THEN the system SHALL contain at least 6 systems (FCC, ADC, AHRS, BMS, EPS, NAV) with appropriate ports and functions
2. WHEN seed data is loaded THEN the system SHALL contain connections using at least 3 different bus types (A429, Discrete, Analog)
3. WHEN seed data is loaded THEN the system SHALL contain at least 10 messages with protocol-specific attributes populated per the field_schema
4. WHEN seed data is loaded THEN the system SHALL contain at least 20 parameters with bit-level detail (offset, length, encoding, range, resolution)
