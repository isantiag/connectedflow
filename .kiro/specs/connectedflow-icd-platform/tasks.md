# Implementation Plan: ConnectedICD — AI-Driven ICD Management Platform

## Overview

This plan implements ConnectedICD as a TypeScript monorepo (with a Python AI service for LLM/ML workloads) with Kubernetes-deployed microservices. Tasks are ordered to build foundational data models first, then core services, AI services, integration layer, and finally the Next.js client. Each service is wired into the API gateway incrementally. Property-based tests use fast-check (TypeScript) and Hypothesis (Python) and are placed close to the implementation they validate.

## Tasks

- [x] 1. Project scaffolding and shared foundations
  - [x] 1.1 Initialize TypeScript monorepo with shared packages
    - Create monorepo structure (e.g., Turborepo or Nx) with packages: `shared-types`, `core-services`, `ai-services`, `integration-services`, `api-gateway`, `web-client`
    - Configure TypeScript, ESLint, Prettier, and fast-check as dev dependency
    - Set up Docker Compose for local development (PostgreSQL, TimescaleDB, Redis, Object Store, Python AI service)
    - _Requirements: 10.5_

  - [x] 1.2 Define core shared types and interfaces
    - Create all shared TypeScript interfaces from the design: `Signal`, `LogicalLayer`, `TransportLayer`, `PhysicalLayer`, `Bus`, `Connector`, `CableBundle`, `Project`, branded ID types (`SignalId`, `BusId`, etc.)
    - Define `ErrorResponse`, `ValidationResult`, `PaginatedResult`, `Pagination` types
    - Define protocol-specific JSONB attribute types for ARINC 429, CAN Bus, MIL-STD-1553, ARINC 664
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 1.3 Create database schema and migrations
    - Write SQL migrations for all tables: `signal`, `logical_layer`, `transport_layer`, `physical_layer`, `bus`, `protocol_definition`, `connector`, `cable_bundle`, `project`
    - Create `baseline`, `baseline_snapshot` tables
    - Create `user`, `role`, `role_permission`, `change_request`, `audit_entry` tables
    - Create `trace_link` table
    - Create TimescaleDB `live_parameter_readings` hypertable
    - Create `parse_job` and `extracted_signal` tables for AI extraction
    - Add foreign key constraints, indexes, and version column for optimistic locking on `signal`
    - _Requirements: 1.1, 1.2, 1.5, 7.2, 8.1_

  - [x] 1.4 Implement database connection layer and repository base
    - Set up database client (e.g., Knex or Prisma) with connection pooling for PostgreSQL and TimescaleDB
    - Set up Redis client for cache and pub/sub
    - Create base repository pattern with transaction support
    - _Requirements: 10.5_

  - [x] 1.5 Implement custom fast-check arbitraries for property tests
    - Create `arbSignal()`, `arbLogicalLayer()`, `arbTransportLayer(protocol)`, `arbPhysicalLayer()`
    - Create `arbProtocolId()`, `arbBusData(icdDef)`, `arbExtractionResult()`, `arbBaseline(signalCount)`, `arbChangeRequest(criticality, role)`
    - Ensure generators produce valid data conforming to schema constraints
    - _Requirements: 1.1, 2.1_

- [x] 2. Signal Management Service
  - [x] 2.1 Implement Signal CRUD operations
    - Implement `createSignal`, `updateSignal`, `deleteSignal`, `getSignal`, `querySignals` per the `SignalService` interface
    - Create signal with all three layers (logical, transport, physical) in a single transaction
    - Implement pagination and filtering for `querySignals`
    - Handle cascading deletion across all layers or produce warning for dependent records
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ]* 2.2 Write property test: Signal creation round-trip (Property 1)
    - **Property 1: Signal creation round-trip**
    - For any valid signal definition, creating and querying by ID returns equivalent signal with all three layers intact
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 2.3 Write property test: Signal referential integrity on deletion (Property 4)
    - **Property 4: Signal referential integrity on deletion**
    - Deleting a signal cascades across all layers or warns about dependents; no orphaned records
    - **Validates: Requirements 1.5**

  - [x] 2.4 Implement cross-layer validation
    - Implement `validateCrossLayer` method that checks consistency between logical, transport, and physical layers
    - Validate wire gauge vs. data rate compatibility, logical range vs. transport encoding capacity, bit offset/length vs. protocol constraints
    - Return structured `ValidationResult` with field-level conflict details
    - _Requirements: 1.3_

  - [ ]* 2.5 Write property test: Cross-layer consistency validation (Property 2)
    - **Property 2: Cross-layer consistency validation**
    - Inconsistent modifications produce conflicts; consistent modifications produce no conflicts
    - **Validates: Requirements 1.3**

  - [x] 2.6 Implement bulk import with field mapping
    - Implement `bulkImport` method that maps input fields to the normalized schema
    - Correctly map matching fields to signal attributes; report unmapped fields
    - _Requirements: 1.4_

  - [ ]* 2.7 Write property test: Import field mapping completeness (Property 3)
    - **Property 3: Import field mapping completeness**
    - All schema-matching fields mapped correctly; non-matching fields appear in unmapped report
    - **Validates: Requirements 1.4**

- [x] 3. Protocol Validation Service
  - [x] 3.1 Implement protocol plugin architecture and built-in plugins
    - Implement `ProtocolValidationService` with `registerPlugin`, `validateTransport`, `getFieldSchema`
    - Create plugins for ARINC 429, CAN Bus, MIL-STD-1553, ARINC 664 with field schemas and validation rules
    - Each plugin validates protocol-specific JSONB attributes against its specification
    - _Requirements: 2.1, 2.2_

  - [ ]* 3.2 Write property test: Protocol validation correctness (Property 5)
    - **Property 5: Protocol validation correctness**
    - Valid protocol params accepted, invalid rejected; field schema contains all protocol-specific fields
    - **Validates: Requirements 2.1, 2.2**

  - [x] 3.3 Implement protocol migration
    - Implement `migrateProtocol` on `ProtocolValidationService` and `migrateFrom` on each plugin
    - Preserve semantically compatible attributes, clear incompatible ones, report what was preserved/cleared/needs review
    - _Requirements: 2.3_

  - [ ]* 3.4 Write property test: Protocol migration preserves compatible attributes (Property 6)
    - **Property 6: Protocol migration preserves compatible attributes**
    - Compatible attributes preserved, incompatible cleared, migration result lists all changes
    - **Validates: Requirements 2.3**

  - [x] 3.5 Implement bus bandwidth utilization analysis
    - Implement `analyzeBusLoading` that computes utilization as sum of (message_size × refresh_rate) / bus_bandwidth
    - Generate warning when utilization exceeds 100%
    - _Requirements: 2.4_

  - [ ]* 3.6 Write property test: Bus bandwidth utilization is additive (Property 7)
    - **Property 7: Bus bandwidth utilization is additive**
    - Utilization equals sum of individual contributions divided by total bandwidth; warning on >100%
    - **Validates: Requirements 2.4**

- [x] 4. Checkpoint — Core data layer and validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Document Parser Service (AI)
  - [x] 5.1 Implement document upload and parse job pipeline
    - Implement `uploadDocument`, `getParseJobStatus`, `getExtractionResults` per the `DocumentParserService` interface
    - Manage parse job state machine: queued → processing → review_pending → confirmed/failed
    - Store uploaded documents in object store; extraction results in database
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 Implement extraction confirmation and signal creation
    - Implement `confirmExtraction` that takes reviewed extractions and creates signals via `SignalService.bulkImport`
    - Implement `getParsingReport` with accurate statistics (total signals, avg confidence, high/low counts, unmapped count)
    - Flag low-confidence extractions with `needsReview: true`
    - _Requirements: 3.2, 3.3, 3.4_

  - [ ]* 5.3 Write property test: AI extraction confidence flagging (Property 8)
    - **Property 8: AI extraction confidence flagging and reporting**
    - Signals below threshold have `needsReview: true`; statistics consistent with actual extraction data
    - **Validates: Requirements 3.2, 3.4**

  - [ ]* 5.4 Write property test: Confirmed extraction creates matching signals (Property 9)
    - **Property 9: Confirmed extraction creates matching signals**
    - Each confirmed extraction produces exactly one signal with matching attributes
    - **Validates: Requirements 3.3**

- [x] 6. Anomaly Detection Service (AI)
  - [x] 6.1 Implement anomaly detection and classification
    - Implement `analyzeChange`, `runBulkScan`, `classifyAnomaly`, `getSuggestions` per the `AnomalyDetectionService` interface
    - Detect known conflict patterns: bus overload, range overlap, encoding mismatch
    - Classify anomalies with severity (error, warning, info) and provide remediation suggestions
    - _Requirements: 5.1, 5.2_

  - [ ]* 6.2 Write property test: Anomaly detection completeness (Property 13)
    - **Property 13: Anomaly detection and classification completeness**
    - Known conflict patterns detected, classified with severity, and have at least one remediation suggestion
    - **Validates: Requirements 5.1, 5.2**

- [x] 7. Checkpoint — AI services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Hardware Adapter Manager and Live Data
  - [x] 8.1 Implement hardware adapter discovery and connection management
    - Implement `discoverAdapters`, `connectAdapter`, `disconnectAdapter` per the `HardwareAdapterManager` interface
    - Manage adapter connection lifecycle with graceful degradation on disconnect
    - _Requirements: 4.1_

  - [x] 8.2 Implement live data monitoring, decoding, and deviation detection
    - Implement `startMonitoring` that streams `LiveDataEvent` via WebSocket/event stream
    - Decode raw bus data using ICD signal definitions: `(raw_extracted_bits * scale_factor) + offset_value`
    - Detect deviations when decoded values fall outside logical layer min/max range; assign severity
    - Write decoded readings to TimescaleDB `live_parameter_readings` hypertable
    - _Requirements: 4.2, 4.3_

  - [ ]* 8.3 Write property test: Live data decoding and deviation detection (Property 10)
    - **Property 10: Live data decoding and deviation detection**
    - Decoding produces correct value from formula; out-of-range values flagged as deviations
    - **Validates: Requirements 4.2, 4.3**

  - [x] 8.4 Implement stimulus generation and simulation
    - Implement `startSimulation` that generates stimulus data conforming to ICD definitions
    - Values within logical range, encoded per transport spec (bit position, length, encoding, byte order), conforming to protocol timing
    - _Requirements: 4.4_

  - [ ]* 8.5 Write property test: Stimulus generation conforms to ICD (Property 11)
    - **Property 11: Stimulus generation conforms to ICD definitions**
    - Generated stimulus within logical range, correctly encoded per transport spec, timing-conformant
    - **Validates: Requirements 4.4**

  - [x] 8.6 Implement session recording and playback
    - Implement `recordSession` that persists live data events to TimescaleDB
    - Support querying recorded data by session ID and time range
    - _Requirements: 4.5_

  - [ ]* 8.7 Write property test: Live data recording round-trip (Property 12)
    - **Property 12: Live data recording round-trip**
    - Recorded events queryable by session/time range with matching timestamps, signal IDs, decoded values
    - **Validates: Requirements 4.5**

- [x] 9. Baseline & Versioning Service
  - [x] 9.1 Implement baseline creation and snapshot
    - Implement `createBaseline`, `getBaseline`, `listBaselines` per the `BaselineService` interface
    - Create immutable copy-on-write snapshots of all signals (logical, transport, physical layers as JSONB)
    - Support async snapshot creation with progress tracking for large datasets
    - _Requirements: 8.1_

  - [x] 9.2 Implement baseline diff and revert
    - Implement `diffBaselines` that identifies added, modified, and deleted signals between two baselines
    - Implement `revertToBaseline` that restores database state to snapshot; creates new version rather than destructive overwrite
    - Record revert action in audit trail
    - _Requirements: 8.2, 8.3_

  - [ ]* 9.3 Write property test: Baseline snapshot and revert round-trip (Property 20)
    - **Property 20: Baseline snapshot and revert round-trip**
    - Create baseline, modify, revert → state identical to original; revert appears in audit trail
    - **Validates: Requirements 8.1, 8.3**

  - [ ]* 9.4 Write property test: Baseline diff correctness (Property 21)
    - **Property 21: Baseline diff correctness**
    - Diff correctly identifies all additions, modifications, deletions with accurate before/after values
    - **Validates: Requirements 8.2**

  - [x] 9.5 Implement certification export
    - Implement `exportForCertification` that produces traceability matrix and change history
    - Traceability matrix covers every signal-to-requirement link; change history includes all modifications between baseline and predecessor
    - _Requirements: 8.4_

  - [ ]* 9.6 Write property test: Certification export completeness (Property 22)
    - **Property 22: Certification export completeness**
    - Export contains complete traceability matrix and full change history
    - **Validates: Requirements 8.4**

- [x] 10. Checkpoint — Hardware, live data, and baselines
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. RBAC, Workflow, and Audit
  - [x] 11.1 Implement role-based access control
    - Implement user, role, and permission management
    - Enforce permissions on all service operations: viewer denied writes, editor denied approvals
    - Integrate with SSO/MFA authentication provider
    - _Requirements: 7.1, 10.2, 10.3, 10.4_

  - [ ]* 11.2 Write property test: Role-based permission enforcement (Property 16)
    - **Property 16: Role-based permission enforcement**
    - User effective permissions match role definition; viewer denied writes, editor denied approvals
    - **Validates: Requirements 7.1**

  - [x] 11.3 Implement optimistic locking and concurrent edit detection
    - Use version column on signal table for optimistic locking
    - Detect concurrent modifications (same base version) and reject second write or present merge
    - _Requirements: 7.2_

  - [ ]* 11.4 Write property test: Concurrent edit conflict detection (Property 17)
    - **Property 17: Concurrent edit conflict detection**
    - Two concurrent modifications on same base version detected; no silent overwrites
    - **Validates: Requirements 7.2**

  - [x] 11.5 Implement approval workflow service
    - Implement `submitChange`, `approveChange`, `rejectChange`, `getChangeRequests` per the `WorkflowService` interface
    - Route critical-criticality signals to approver-role users; deterministic routing given same inputs
    - _Requirements: 7.3_

  - [ ]* 11.6 Write property test: Approval workflow routing correctness (Property 18)
    - **Property 18: Approval workflow routing correctness**
    - Critical signals require approver-role approval; routing deterministic for same criticality/role inputs
    - **Validates: Requirements 7.3**

  - [x] 11.7 Implement audit trail
    - Implement `getAuditTrail` and automatic audit entry creation on every signal modification
    - Each entry has user ID, timestamp, entity reference, action type, before/after state snapshots
    - Entries ordered by timestamp
    - _Requirements: 7.4_

  - [ ]* 11.8 Write property test: Audit trail completeness (Property 19)
    - **Property 19: Audit trail completeness**
    - N modifications produce exactly N audit entries with valid fields, ordered by timestamp
    - **Validates: Requirements 7.4**

- [x] 12. Traceability & Export Service
  - [x] 12.1 Implement traceability link management
    - Implement `linkToRequirement`, `unlinkRequirement`, `getTraceLinks`, `syncRequirements` per the `TraceabilityService` interface
    - Support bidirectional links to DOORS and Jama
    - Transition link status to 'stale' when upstream requirement changes; generate notification
    - _Requirements: 6.1, 6.5_

  - [ ]* 12.2 Write property test: Traceability link integrity (Property 14)
    - **Property 14: Traceability link integrity**
    - Upstream requirement change → link status 'stale' + notification; signal change → link flagged for review
    - **Validates: Requirements 6.1, 6.5**

  - [x] 12.3 Implement export engine
    - Implement `exportTestBenchConfig`, `exportSimulinkModel`, `exportHarnessDesign`, `exportWireList`, `exportCertPackage` per the `ExportEngine` interface
    - Support CAN DBC, ARINC 429 label table, Simulink model, wire list formats
    - Exported files must be parseable by target format parsers, contain all input signals, preserve attributes
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ]* 12.4 Write property test: Export format correctness (Property 15)
    - **Property 15: Export format correctness**
    - Exports parseable by target format, contain all signals, preserve attributes (scaling, encoding, pins)
    - **Validates: Requirements 6.2, 6.3, 6.4**

- [x] 13. Checkpoint — Access control, workflow, traceability, and exports
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. API Gateway
  - [x] 14.1 Implement REST and GraphQL API gateway
    - Set up Express/Fastify server with REST endpoints for all core service operations
    - Set up GraphQL schema and resolvers for signal queries, diagram data, and traceability
    - Apply RBAC middleware to all routes
    - Implement structured `ErrorResponse` format with correlation IDs
    - _Requirements: 1.1, 7.1_

  - [x] 14.2 Implement WebSocket server for live data and real-time updates
    - Set up WebSocket server for live data streaming from hardware adapters
    - Broadcast signal change notifications via Redis pub/sub to connected clients
    - _Requirements: 4.2, 7.2_

- [x] 15. Wiring Diagram Engine
  - [x] 15.1 Implement wiring diagram generation from physical layer data
    - Implement `generateDiagram` that creates diagram model from signal physical layer data
    - Include visual elements for every unique connector, pin assignment, and cable bundle
    - Implement `onPhysicalLayerChange` to regenerate diagram on physical layer modifications
    - _Requirements: 9.1, 9.3_

  - [ ]* 15.2 Write property test: Wiring diagram reflects physical layer state (Property 23)
    - **Property 23: Wiring diagram reflects physical layer state**
    - Diagram contains elements for all connectors, pins, cable bundles; updates reflect modifications
    - **Validates: Requirements 9.1, 9.3**

  - [x] 15.3 Implement diagram export to SVG and PDF
    - Implement `renderToSVG` producing well-formed SVG and `renderToPDF` producing valid PDF
    - Both formats contain visual representations of all connectors and wire runs
    - _Requirements: 9.4_

  - [ ]* 15.4 Write property test: Wiring diagram export format validity (Property 24)
    - **Property 24: Wiring diagram export format validity**
    - SVG export is well-formed; PDF export is valid; both contain all connectors and wire runs
    - **Validates: Requirements 9.4**

- [x] 16. Startup Configuration Validation
  - [x] 16.1 Implement system startup health check and configuration validator
    - Validate all required services (PostgreSQL, TimescaleDB, Redis, AI service, adapter manager) are reachable
    - Report 'ready' only when all services configured correctly; report specific failure reasons otherwise
    - Implement circuit breaker, retry with backoff, bulkhead, and dead letter queue patterns per design
    - _Requirements: 10.5_

  - [ ]* 16.2 Write property test: Startup configuration validation (Property 25)
    - **Property 25: Startup configuration validation**
    - 'ready' only when all services reachable and configured; specific failure reasons for issues
    - **Validates: Requirements 10.5**

- [x] 17. Next.js Web Client
  - [x] 17.1 Set up Next.js application with App Router, Tailwind CSS, and Shadcn/ui
    - Initialize Next.js app (App Router) with TypeScript
    - Configure Tailwind CSS and Shadcn/ui (Radix-based) component primitives
    - Add Framer Motion for page transitions and micro-interactions
    - Set up API client layer for REST, GraphQL, and WebSocket connections
    - Implement authentication flow with SSO/MFA integration
    - Establish a minimal, clean design system (Linear/Figma/Notion-style aesthetic)
    - _Requirements: 10.2, 10.3, 10.4, 11.1, 11.2, 11.4_

  - [x] 17.2 Implement signal management UI
    - Build signal list view with filtering, pagination, and search using Shadcn/ui data table
    - Build signal detail/edit form with all three layers (logical, transport, physical)
    - Display cross-layer validation results and anomaly warnings inline
    - Build bulk import UI with field mapping review
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 17.3 Implement AI document parser UI
    - Build document upload interface with drag-and-drop
    - Build extraction review UI showing extracted signals with confidence scores, highlighting low-confidence items
    - Build confirm/reject workflow for reviewed extractions
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 17.4 Implement live data monitor UI
    - Build real-time parameter display connected via WebSocket
    - Show decoded values with deviation highlighting (color-coded by severity)
    - Build session recording controls (start/stop/playback)
    - _Requirements: 4.2, 4.3, 4.5_

  - [x] 17.5 Implement interactive wiring diagram viewer with React Flow
    - Integrate React Flow (xyflow) as the interactive canvas for wiring diagrams
    - Implement custom nodes for connectors, equipment, and cable bundles
    - Support pan, zoom, minimap, and click-to-inspect on connectors and wire runs
    - Highlight signal paths on selection with Framer Motion transitions
    - _Requirements: 9.1, 9.2, 11.3_

  - [x] 17.6 Implement workflow, baseline, and traceability UI
    - Build change request submission and approval/rejection UI
    - Build baseline list, diff viewer, and revert confirmation UI
    - Build traceability link management UI with stale link indicators
    - Build export dialog for all supported formats
    - _Requirements: 7.3, 8.1, 8.2, 6.1, 6.2_

- [x] 18. Checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Python AI Service
  - [x] 19.1 Set up Python AI service project
    - Initialize Python project with FastAPI, LangChain, and OpenAI/Anthropic SDK
    - Configure Hypothesis as property-based testing library
    - Set up Docker container with Python runtime and dependencies
    - Implement REST API endpoints consumed by the TypeScript core services
    - Add health check endpoint for Kubernetes readiness/liveness probes
    - _Requirements: 3.1, 3.2, 10.5_

  - [x] 19.2 Implement LLM-powered document extraction pipeline
    - Implement document parsing with LangChain document loaders (PDF, Word, Excel)
    - Implement LLM-based table and signal extraction using OpenAI/Anthropic APIs
    - Implement confidence scoring for extracted signals
    - Expose extraction results via REST API for the TypeScript Document Parser Service to consume
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 19.3 Implement AI assistant backend
    - Implement conversational AI assistant using LLM APIs for ICD-related queries
    - Support context-aware responses using signal data and project context via RAG
    - _Requirements: 5.3_

- [x] 20. Kubernetes deployment configuration
  - [x] 20.1 Create Kubernetes manifests and Helm charts
    - Create Deployments/StatefulSets for all services: API gateway, core services, AI services (TypeScript), AI services (Python), hardware adapter (host network), PostgreSQL, TimescaleDB, Redis
    - Create namespaces: `connectedicd-core`, `connectedicd-data`, `connectedicd-integration`
    - Configure Ingress with TLS termination
    - Create ConfigMaps and Secrets for service configuration
    - Create CronJob for requirements sync
    - _Requirements: 10.5_

- [x] 21. Final checkpoint — All services deployed and tested
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major service group
- Property tests validate the 25 correctness properties defined in the design using fast-check (TypeScript) and Hypothesis (Python)
- TypeScript services form the core monorepo; the Python AI service runs as a separate container
- The web client uses Next.js (App Router), Tailwind CSS, Shadcn/ui, React Flow, and Framer Motion
