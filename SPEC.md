# ConnectedICD — SPEC.md

## Vision

AI-native interface control document management for digital engineering and MBSE integration. ConnectedICD manages the complete lifecycle of signals, interfaces, and ICDs across aerospace systems — from logical definition through transport and physical layers — with built-in traceability, change control, and AI-assisted analysis.

## Metrics

| Metric | Count |
|--------|-------|
| REST API endpoints | 111 |
| MCP tools (Python) | 20 |
| Database tables | 46 |
| Vitest test suites | 22 files |
| Vitest tests | 553 |

---

## Capability Areas

### 1. Signal Management (Core)

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-SIG-001 | System shall support CRUD for signals with logical, transport, and physical layers. _Acceptance: POST/GET/PUT/DELETE on /api/signals with layer data._ | ✅ Implemented |
| REQ-CICD-SIG-002 | System shall support signal filtering by project, criticality, and status. | ✅ Implemented |
| REQ-CICD-SIG-003 | System shall support signal comments and discussion threads. | ✅ Implemented |
| REQ-CICD-SIG-004 | System shall support signal ownership and handshake workflows. | ✅ Implemented |

### 2. System & Connection Architecture

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-SYS-001 | System shall support CRUD for systems with hierarchical relationships. | ✅ Implemented |
| REQ-CICD-SYS-002 | System shall support connections between systems with message definitions. | ✅ Implemented |
| REQ-CICD-SYS-003 | System shall support software partitions with function and port mapping. | ✅ Implemented |
| REQ-CICD-SYS-004 | System shall support system functions and ports. | ✅ Implemented |

### 3. N2 Matrix & Traceability

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-N2-001 | System shall generate N2 interface matrix from signal source/dest data. | ✅ Implemented |
| REQ-CICD-N2-002 | System shall provide enhanced N2 matrix with protocol and bus grouping. | ✅ Implemented |
| REQ-CICD-TRC-001 | System shall support trace links between signals and requirements. | ✅ Implemented |

### 4. ICD Import & Parsing

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-IMP-001 | System shall parse Excel ICD files and extract signals. | ✅ Implemented |
| REQ-CICD-IMP-002 | System shall support AI-assisted extraction from unstructured documents. | ✅ Implemented |
| REQ-CICD-IMP-003 | System shall support parse job review and confirmation workflow. | ✅ Implemented |
| REQ-CICD-IMP-004 | System shall support hierarchy confirmation for parsed ICDs. | ✅ Implemented |

### 5. Hardware ICD Templates

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-HW-001 | System shall support hardware ICD templates with functions and ports. | ✅ Implemented |
| REQ-CICD-HW-002 | System shall support template instantiation to create system instances. | ✅ Implemented |

### 6. Export

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-EXP-001 | System shall export ICDs in structured JSON format. | ✅ Implemented |
| REQ-CICD-EXP-002 | System shall export ICDs in PDF format. | ✅ Implemented |
| REQ-CICD-EXP-003 | System shall export in DBC (CAN database) format. | ✅ Implemented |
| REQ-CICD-EXP-004 | System shall export Simulink bus definitions. | ✅ Implemented |

### 7. Live Telemetry

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-LIVE-001 | System shall support live parameter monitoring via CAN/serial adapters. | ✅ Implemented |
| REQ-CICD-LIVE-002 | System shall support session recording and playback. | ✅ Implemented |

### 8. AI Analysis

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-AI-001 | System shall provide AI-powered signal analysis and insights. | ✅ Implemented |
| REQ-CICD-AI-002 | System shall support AI chat for ICD troubleshooting. | ✅ Implemented |
| REQ-CICD-AI-003 | System shall detect anomalies in signal definitions. | ✅ Implemented |

### 9. Change Control & Baselines

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-CHG-001 | System shall support change request workflow (create → submit → approve/reject). | ✅ Implemented |
| REQ-CICD-CHG-002 | System shall support baseline creation and comparison. | ✅ Implemented |
| REQ-CICD-CHG-003 | System shall enforce independence check (creator ≠ approver per ARP 4754B §5.4). | ✅ Implemented |

### 10. Auth & Multi-Tenancy

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-AUTH-001 | System shall support JWT authentication with email/password. | ✅ Implemented |
| REQ-CICD-AUTH-002 | System shall support RBAC with Admin, Lead, Analyst, Reviewer, Viewer roles. | ✅ Implemented |
| REQ-CICD-AUTH-003 | System shall support API key authentication. | ✅ Implemented |
| REQ-CICD-AUTH-004 | System shall support multi-tenancy via tenant_id on all tables. | ✅ Implemented |
| REQ-CICD-AUTH-005 | System shall support swappable AuthProvider interface (SSO-ready). | ✅ Implemented |

### 11. Artifact Interface (§9.2)

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-ART-001 | System shall implement artifacts.list, artifacts.get, artifacts.export MCP tools. | ✅ Implemented |

### 12. Digital Thread (v2)

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-DT-001 | System shall trace from requirement → interface → signal → physical layer. | ✅ Implemented |
| REQ-CICD-DT-002 | System shall show impact of interface changes on requirements, systems, connections. | ✅ Implemented |
| REQ-CICD-DT-003 | System shall validate ICD completeness (missing layers, owners, protocols). | ✅ Implemented |
| REQ-CICD-DT-004 | System shall diff two baseline snapshots showing added/removed/modified signals. | ✅ Implemented |

### 13. MBSE Integration (v2)

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-MBSE-001 | System shall import SysML v2 model interfaces (JSON-LD format). | ✅ Implemented |
| REQ-CICD-MBSE-002 | System shall sync requirements bidirectionally via ReqIF-style payload. | ✅ Implemented |
| REQ-CICD-MBSE-003 | System shall auto-generate ICD from system architecture model. | ✅ Implemented |

### 14. Cross-Product Integration (v2)

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-INT-001 | System shall accept safety findings from SafetyNow on signals. | ✅ Implemented |
| REQ-CICD-INT-002 | System shall expose interface changes since timestamp for polling. | ✅ Implemented |
| REQ-CICD-INT-003 | System shall provide component registry data for SafetyNow. | ✅ Implemented |
| REQ-CICD-INT-004 | System shall support webhook registration for change notifications. | ✅ Implemented |

---

## AGI Components

### 15. RLVR Scoring Integration

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-AGI-001 | System shall score AI-generated signal extractions using RLVR (Reinforcement Learning with Verifiable Rewards) to measure extraction accuracy against ground truth. | 🔲 Planned |
| REQ-CICD-AGI-002 | System shall use RLVR scores to rank and select extraction strategies, improving accuracy over time. | 🔲 Planned |
| REQ-CICD-AGI-003 | System shall log all RLVR scoring events to the audit trail for reproducibility. | 🔲 Planned |

### 16. Constitutional Review

| ID | Requirement | Status |
|----|-------------|--------|
| REQ-CICD-AGI-004 | System shall apply constitutional review rules to AI-generated ICD content, enforcing domain constraints (valid protocols, unit consistency, naming conventions). | 🔲 Planned |
| REQ-CICD-AGI-005 | System shall flag AI outputs that violate constitutional rules before they enter the ICD baseline. | 🔲 Planned |
| REQ-CICD-AGI-006 | System shall allow administrators to define and update constitutional rules without code changes. | 🔲 Planned |

---

## Requirement Summary

| Area | Count | Implemented | Planned |
|------|-------|-------------|---------|
| Signal Management | 4 | 4 | 0 |
| System & Connection | 4 | 4 | 0 |
| N2 Matrix & Traceability | 3 | 3 | 0 |
| ICD Import & Parsing | 4 | 4 | 0 |
| Hardware ICD Templates | 2 | 2 | 0 |
| Export | 4 | 4 | 0 |
| Live Telemetry | 2 | 2 | 0 |
| AI Analysis | 3 | 3 | 0 |
| Change Control & Baselines | 3 | 3 | 0 |
| Auth & Multi-Tenancy | 5 | 5 | 0 |
| Artifact Interface | 1 | 1 | 0 |
| Digital Thread | 4 | 4 | 0 |
| MBSE Integration | 3 | 3 | 0 |
| Cross-Product Integration | 4 | 4 | 0 |
| AGI — RLVR Scoring | 3 | 0 | 3 |
| AGI — Constitutional Review | 3 | 0 | 3 |
| **Total** | **52** | **46** | **6** |
