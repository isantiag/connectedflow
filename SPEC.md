# ConnectedICD — SPEC.md

## Vision
AI-native interface control document management platform for digital engineering and MBSE integration. ConnectedICD manages the complete lifecycle of signals, interfaces, and ICDs across aerospace systems — from logical definition through transport and physical layers — with built-in traceability, change control, and AI-assisted analysis.

## Capability Areas

### 1. Signal Management (Core)
- **REQ-CICD-SIG-001**: System shall support CRUD for signals with logical, transport, and physical layers. _Acceptance: POST/GET/PUT/DELETE on /api/signals with layer data._ ✅ Implemented
- **REQ-CICD-SIG-002**: System shall support signal filtering by project, criticality, and status. ✅ Implemented
- **REQ-CICD-SIG-003**: System shall support signal comments and discussion threads. ✅ Implemented
- **REQ-CICD-SIG-004**: System shall support signal ownership and handshake workflows. ✅ Implemented

### 2. System & Connection Architecture
- **REQ-CICD-SYS-001**: System shall support CRUD for systems with hierarchical relationships. ✅ Implemented
- **REQ-CICD-SYS-002**: System shall support connections between systems with message definitions. ✅ Implemented
- **REQ-CICD-SYS-003**: System shall support software partitions with function and port mapping. ✅ Implemented
- **REQ-CICD-SYS-004**: System shall support system functions and ports. ✅ Implemented

### 3. N2 Matrix & Traceability
- **REQ-CICD-N2-001**: System shall generate N2 interface matrix from signal source/dest data. ✅ Implemented
- **REQ-CICD-N2-002**: System shall provide enhanced N2 matrix with protocol and bus grouping. ✅ Implemented
- **REQ-CICD-TRC-001**: System shall support trace links between signals and requirements. ✅ Implemented

### 4. ICD Import & Parsing
- **REQ-CICD-IMP-001**: System shall parse Excel ICD files and extract signals. ✅ Implemented
- **REQ-CICD-IMP-002**: System shall support AI-assisted extraction from unstructured documents. ✅ Implemented
- **REQ-CICD-IMP-003**: System shall support parse job review and confirmation workflow. ✅ Implemented
- **REQ-CICD-IMP-004**: System shall support hierarchy confirmation for parsed ICDs. ✅ Implemented

### 5. Hardware ICD Templates
- **REQ-CICD-HW-001**: System shall support hardware ICD templates with functions and ports. ✅ Implemented
- **REQ-CICD-HW-002**: System shall support template instantiation to create system instances. ✅ Implemented

### 6. Export
- **REQ-CICD-EXP-001**: System shall export ICDs in structured JSON format. ✅ Implemented
- **REQ-CICD-EXP-002**: System shall export ICDs in PDF format. ✅ Implemented
- **REQ-CICD-EXP-003**: System shall export in DBC (CAN database) format. ✅ Implemented
- **REQ-CICD-EXP-004**: System shall export Simulink bus definitions. ✅ Implemented

### 7. Live Telemetry
- **REQ-CICD-LIVE-001**: System shall support live parameter monitoring via CAN/serial adapters. ✅ Implemented
- **REQ-CICD-LIVE-002**: System shall support session recording and playback. ✅ Implemented

### 8. AI Analysis
- **REQ-CICD-AI-001**: System shall provide AI-powered signal analysis and insights. ✅ Implemented
- **REQ-CICD-AI-002**: System shall support AI chat for ICD troubleshooting. ✅ Implemented
- **REQ-CICD-AI-003**: System shall detect anomalies in signal definitions. ✅ Implemented

### 9. Change Control & Baselines
- **REQ-CICD-CHG-001**: System shall support change request workflow (create → submit → approve/reject). ✅ Implemented
- **REQ-CICD-CHG-002**: System shall support baseline creation and comparison. ✅ Implemented
- **REQ-CICD-CHG-003**: System shall enforce independence check (creator ≠ approver per ARP 4754B §5.4). ✅ Implemented

### 10. Auth & Multi-Tenancy
- **REQ-CICD-AUTH-001**: System shall support JWT authentication with email/password. ✅ Implemented
- **REQ-CICD-AUTH-002**: System shall support RBAC with Admin, Lead, Analyst, Reviewer, Viewer roles. ✅ Implemented
- **REQ-CICD-AUTH-003**: System shall support API key authentication. ✅ Implemented
- **REQ-CICD-AUTH-004**: System shall support multi-tenancy via tenant_id on all tables. ✅ Implemented
- **REQ-CICD-AUTH-005**: System shall support swappable AuthProvider interface (SSO-ready). ✅ Implemented

### 11. Artifact Interface (§9.2)
- **REQ-CICD-ART-001**: System shall implement artifacts.list, artifacts.get, artifacts.export MCP tools. ✅ Implemented

## Endpoint Count
- **99 REST API endpoints** (all implemented)
- **3 MCP artifact tools** (artifacts.list, artifacts.get, artifacts.export)

### 12. Digital Thread (v2)
- **REQ-CICD-DT-001**: System shall trace from requirement → interface → signal → physical layer. ✅ Implemented
- **REQ-CICD-DT-002**: System shall show impact of interface changes on requirements, systems, connections. ✅ Implemented
- **REQ-CICD-DT-003**: System shall validate ICD completeness (missing layers, owners, protocols). ✅ Implemented
- **REQ-CICD-DT-004**: System shall diff two baseline snapshots showing added/removed/modified signals. ✅ Implemented

### 13. MBSE Integration (v2)
- **REQ-CICD-MBSE-001**: System shall import SysML v2 model interfaces (JSON-LD format). ✅ Implemented
- **REQ-CICD-MBSE-002**: System shall sync requirements bidirectionally via ReqIF-style payload. ✅ Implemented
- **REQ-CICD-MBSE-003**: System shall auto-generate ICD from system architecture model. ✅ Implemented

## Updated Endpoint Count
- **106 REST API endpoints** (99 + 4 digital thread + 3 MBSE)

### 14. Cross-Product Integration (v2)
- **REQ-CICD-INT-001**: System shall accept safety findings from SafetyNow on signals. ✅ Implemented
- **REQ-CICD-INT-002**: System shall expose interface changes since timestamp for polling. ✅ Implemented
- **REQ-CICD-INT-003**: System shall provide component registry data for SafetyNow. ✅ Implemented
- **REQ-CICD-INT-004**: System shall support webhook registration for change notifications. ✅ Implemented

## Updated Endpoint Count
- **111 REST API endpoints** (106 + 5 integration)
