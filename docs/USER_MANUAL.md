# ConnectedFlow — User Manual

## What is ConnectedFlow?

ConnectedFlow is an AI-driven Interface Control Document (ICD) management platform for aerospace systems integration. It unifies all three ICD layers — logical, transport, and physical — into a single environment, replacing the fragmented toolchains (typically 2–4 tools bridged by Excel) that dominate the industry today.

Target programs: eVTOL, Part 23, and Part 25 aircraft.

---

## Getting Started

### 1. Logging In

Navigate to your ConnectedFlow instance URL. Sign in with your organization's SSO credentials or local account. If MFA is enabled, you'll be prompted for a verification code after entering your password.

### 2. Dashboard

After login, you land on the Dashboard. It shows at-a-glance metrics:

- Total signals in your project
- Active baselines
- Open change requests awaiting approval
- Detected anomalies

The left sidebar provides navigation to all platform features.

---

## Core Concepts

### Signals — The Three-Layer Model

Every signal in ConnectedFlow is defined across three layers:

| Layer | What it defines | Example fields |
|-------|----------------|----------------|
| Logical | What the signal means | Data type, min/max range, units, refresh rate, source/dest systems |
| Transport | How it's encoded on the bus | Protocol (ARINC 429, CAN, 1553, AFDX), bit offset/length, scale factor, encoding |
| Physical | How it's wired | Connector, pin number, wire gauge, cable bundle, shielding |

This unified model eliminates the data silos that cause integration errors.

### Supported Protocols

- ARINC 429 (labels, SDI, SSM, BNR/BCD/discrete)
- CAN Bus (arbitration ID, DLC, cycle time)
- MIL-STD-1553 (remote terminal, sub-address, word count)
- ARINC 664 / AFDX (virtual link, BAG, partition, network A/B)

---

## Feature Guide

### Signal Management

#### Viewing Signals

1. Click "Signals" in the sidebar
2. Use the search bar to filter by name
3. Filter by status (draft, active, deprecated) or criticality (critical, major, minor, info)
4. Click any signal row to view its three-layer detail

#### Creating a Signal

1. Click "New Signal" on the Signals page
2. Fill in the signal name, project, and criticality
3. Complete all three layer tabs:
   - Logical: data type, range, units, refresh rate
   - Transport: select protocol, configure bus encoding parameters
   - Physical: select connector, pin, wire specifications
4. Click "Save" — the system validates cross-layer consistency automatically

#### Cross-Layer Validation

When viewing a signal detail, the right sidebar shows validation results:

- Green checkmark: all layers are consistent
- Yellow warning: timing mismatch (e.g., refresh rate exceeds bus cycle rate)
- Red error: hard conflict (e.g., logical range exceeds encoding capacity, wire gauge insufficient for protocol data rate)

Each issue includes a description and suggested remediation.

#### Bulk Import

1. Navigate to Signals → Import
2. Drag and drop a CSV, Excel, or JSON file
3. ConnectedFlow auto-detects columns and maps them to the signal schema
4. Review the field mapping — green checkmarks for mapped fields, yellow badges for unmapped
5. Click "Confirm Import" to create signals from the mapped data

---

### AI Document Extraction

ConnectedFlow can extract signal definitions from legacy ICD documents using AI.

#### Uploading a Document

1. Navigate to "Documents" in the sidebar
2. Drag and drop a PDF, Word, or Excel file into the upload area
3. A parse job is created with status "Queued"

#### Extraction Pipeline

The system processes documents through this pipeline:

```
Upload → Queued → Processing (AI extraction) → Review Pending → Confirmed
```

During processing, the AI:
- Parses tables and text from the document
- Identifies signal definitions with field mapping
- Assigns a confidence score (0–100%) to each extracted signal

#### Reviewing Extractions

1. When a job reaches "Review Pending", click "Review"
2. Each extracted signal shows:
   - Signal name and extracted fields
   - Confidence percentage (green ≥80%, yellow 50–79%, red <50%)
   - "Needs manual review" flag for low-confidence extractions
3. Review and correct any misidentified fields
4. Click "Confirm All" to create signals from the extractions

---

### Live Data Monitoring

ConnectedFlow connects to hardware bus interfaces (or simulated adapters) for real-time ICD validation.

#### Starting a Monitor Session

1. Navigate to "Live Data" in the sidebar
2. The system connects via WebSocket to available adapters
3. Parameter cards appear showing decoded values in real-time

#### Understanding the Display

Each parameter card shows:
- Signal name and current decoded value with units
- Color coding:
  - White/default: value within normal range
  - Yellow border: value approaching min/max boundary (within 10%)
  - Red border: value outside defined range (deviation detected)
- Timestamp of last update

#### Recording Sessions

1. Click "Record" to start capturing live data to TimescaleDB
2. Click "Stop Recording" to end the session
3. Recorded sessions can be queried by time range for post-flight analysis

#### Pause/Resume

Click "Pause" to freeze the display without disconnecting. Click "Resume" to continue updating.

---

### Wiring Diagrams

ConnectedFlow generates interactive wiring diagrams from physical-layer ICD data.

#### Viewing the Diagram

1. Navigate to "Wiring" in the sidebar
2. The React Flow canvas displays:
   - Connector nodes (rectangles) with pin assignments listed inside
   - Wire runs (curved lines) connecting pins between connectors via cable bundles
   - Signal names as labels on wire runs

#### Interacting with the Diagram

- Pan: click and drag the canvas background
- Zoom: scroll wheel or pinch gesture
- Minimap: bottom-right corner shows an overview of the full diagram
- Click a connector node to inspect its pin assignments
- Click a wire run to see signal details

#### Exporting

- Click "Export SVG" for a vector graphics file (suitable for documentation)
- PDF export includes a connector table and wire list

---

### Baselines & Versioning

Baselines are immutable snapshots of your ICD database at a point in time, essential for certification audits.

#### Creating a Baseline

1. Navigate to "Baselines" in the sidebar
2. Click "Create Baseline"
3. Enter a version label (e.g., "v1.0-PDR") and description
4. The system snapshots all signals in the project (logical, transport, physical layers as JSONB)

#### Comparing Baselines

1. Select two baselines using the checkboxes
2. Click "Compare"
3. The diff view shows:
   - Added signals (in newer baseline only)
   - Deleted signals (in older baseline only)
   - Modified signals (with before/after values highlighted)

#### Reverting to a Baseline

1. Click "Revert" on any baseline
2. Confirm the action
3. The system restores all signal layers to the snapshot state
4. Signal versions are incremented (non-destructive — the revert itself is a new version)
5. The revert action is recorded in the audit trail

#### Certification Export

From a baseline, you can export a certification package (DO-178C, DO-254, ARP4754A) containing:
- Traceability matrix (every signal linked to its requirements)
- Change history (diff against the predecessor baseline)

---

### Approval Workflows

Changes to critical signals require approval before taking effect.

#### How Routing Works

| Signal Criticality | Required Approver Role |
|-------------------|----------------------|
| Critical | Approver or Admin |
| Major, Minor, Info | Editor, Approver, or Admin |

This routing is deterministic — the same criticality always requires the same role.

#### Submitting a Change

When you modify a signal, a change request is automatically created with status "Pending".

#### Approving / Rejecting

1. Navigate to "Workflows" in the sidebar
2. Pending requests show approve/reject buttons
3. Click "Approve" to apply the change
4. Click "Reject" and provide a reason to deny the change

Viewers cannot approve or reject. Editors cannot approve critical changes.

---

### Traceability

ConnectedFlow maintains bidirectional links between signals and upstream requirements in DOORS or Jama.

#### Linking a Signal to a Requirement

From a signal's detail page, add a trace link by specifying:
- Requirement tool (DOORS or Jama)
- External requirement ID
- Requirement text

#### Sync & Stale Detection

1. Navigate to "Traceability" in the sidebar
2. Click "Sync Requirements" to check for upstream changes
3. If a requirement's text has changed, the link transitions to "Stale" (yellow badge)
4. If a requirement no longer exists, the link transitions to "Broken" (red badge)
5. Active links show a green badge

#### Export

Click "Export Matrix" to download the full traceability matrix for certification documentation.

---

### Anomaly Detection

ConnectedFlow continuously scans for ICD anomalies across six categories:

| Category | Severity | Example |
|----------|----------|---------|
| Bus Overload | Error | Bus utilization exceeds 100% capacity |
| Range Overlap | Error | Logical max exceeds transport encoding capacity |
| Encoding Mismatch | Error | BCD encoding used with float data type |
| Wire Gauge Incompatibility | Error | 26 AWG wire on 100 Mbps AFDX bus |
| Timing Mismatch | Warning | Refresh rate exceeds CAN cycle rate |
| Bit Layout Overflow | Error | Bit offset + length exceeds protocol word size |

Each anomaly includes actionable remediation suggestions.

---

### Export Formats

ConnectedFlow exports to multiple downstream tool formats:

| Format | Use Case | File Type |
|--------|----------|-----------|
| CAN DBC | Test bench configuration | .dbc |
| ARINC 429 Label Table | Avionics test setup | .csv |
| Simulink Model | Simulation interfaces | .xml |
| Wire List | Harness manufacturing | .csv |
| Certification Package | DO-178C/DO-254/ARP4754A audit | .json |

---

## Roles & Permissions

| Role | Read | Write | Approve | Delete |
|------|------|-------|---------|--------|
| Viewer | Yes | No | No | No |
| Editor | Yes | Yes | No | No |
| Approver | Yes | Yes | Yes | No |
| Admin | Yes | Yes | Yes | Yes |

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Search signals | Focus search bar, type query |
| Toggle sidebar | Click collapse arrow |
| Toggle dark/light mode | Click moon/sun icon in header |

---

## Getting Help

- Use the AI Assistant (coming soon) to ask ICD-related questions in natural language
- The assistant understands avionics protocols, wiring standards, and can reference your project's signal data
- Contact your system administrator for account and access issues
