# ConnectedICD — 3-Level ICD Hierarchy Spec

**Version:** 1.0  
**Date:** April 21, 2026  
**Status:** Approved for implementation  
**Author:** Machine 2 (Kiro)  
**Reviewed by:** Rodrigo Santiago, Machine 1 Advisor

---

## 1. Problem Statement

The current ConnectedICD data model stores signals as flat records with text-based source/destination system fields. This prevents:

- Navigating ICDs by system (LRU) → bus → message → parameter
- Filtering all interfaces for a specific LRU
- Showing protocol-specific detail (A429 labels, CAN IDs, VL IDs)
- Supporting multiple bus types per system pair
- Reusing system definitions across views

Aerospace ICD management requires a **3-level hierarchical view** that follows industry practice:

| Level | What it shows | Example |
|-------|--------------|---------|
| **Level 1 — System Interconnect** | Which systems connect, via which bus types | FCC ↔ ADC via ARINC 429 |
| **Level 2 — Messages/Labels** | What messages flow on each bus link | Label 0310 (Airspeed), Label 0311 (Altitude) |
| **Level 3 — Parameter Detail** | Bit-level encoding per message | AIRSPEED: bits 28-14, BNR, 0-512 kts, 0.0625 resolution |

---

## 2. Design Principles

### 2.1 Protocol-Flexible, Not Protocol-Hardcoded

Learned from PEERSS/dBricks: MIL-STD-1553 is implemented using their Generic Serial module, not as a separate module. This means one generic engine with **declarative protocol descriptors** is more scalable than per-protocol code.

**Our approach:** Each bus type is defined in `protocol_definition` with a `field_schema` JSONB column that declares what fields exist at the message and parameter level. The UI and API read this schema to render protocol-specific forms dynamically. New protocols (TTP, RS-485, proprietary) can be added by inserting a row — no code changes.

### 2.2 Physical/Logical Separation

Learned from dBricks advisor review: ports (physical connection points) and functions (logical purpose) are separate concepts.

- **Port** = physical: "A429 Tx Channel 1 on connector J1"
- **Function** = logical: "Air Data Processing"
- **Parameter** = data item: "AIRSPEED_IAS"
- **Port Content (Message)** = protocol-specific mapping: "Label 0310, bits 28-14, BNR"

The same parameter (AIRSPEED) might be transmitted on multiple ports via different protocols. The same port carries parameters from multiple functions.

### 2.3 Normalized Data Model, Not Documents

ICDs are **generated from** the normalized data, not stored as documents. The database is the single source of truth. ICD documents (Word, Excel, PDF) are export artifacts.

### 2.4 Additive Migration

All new tables are added alongside existing ones. The current flat signal view continues to work. A `signal_parameter_link` bridge table connects the legacy `signal` table to the new `parameter` table for backward compatibility.

---

## 3. Data Model

### 3.1 Entity Hierarchy

```
Project
├── System (LRU instance: FCC, ADC, AHRS, BMS)
│   ├── SystemPort (physical: A429_TX_CH1, DISC_OUT_3)
│   └── SystemFunction (logical: Air Data Processing, ILS Nav)
│
├── Connection (port↔port link, with bus type)
│   └── Message (protocol-specific: Label 0310, CAN ID 0x18FF00, VL_042)
│       └── Parameter (bit-level: AIRSPEED, bits 28-14, BNR, 0-512 kts)
│           └── mapped to → SystemFunction (logical traceability)
│
└── Bus (physical bus instance: "A429 Bus 1", carries connections)

Common Objects (shared across projects):
├── ProtocolDefinition (A429, A825, AFDX, MIL-1553, Discrete, Analog)
├── WireType, ConnectorType, DataEncoding, UnitOfMeasure
```

### 3.2 Table Definitions

#### Common Objects

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `protocol_definition` | Bus type descriptor with generic field schemas | `protocol_name`, `version`, `field_schema` (JSONB), `validation_rules` (JSONB) |
| `wire_type` | Wire specifications | `name`, `gauge`, `material`, `shielded` |
| `connector_type` | Connector catalog | `name`, `standard`, `total_pins` |
| `data_encoding` | Encoding types (BNR, BCD, discrete...) | `name`, `bit_conventions` (JSONB) |
| `unit_of_measure` | Units catalog | `name`, `symbol`, `quantity_type` |

#### System Entities

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `system` | LRU/device instance in a project | `project_id` FK, `name`, `manufacturer`, `part_number`, `ata_chapter`, `system_type` |
| `system_port` | Physical connection point on a system | `system_id` FK, `name`, `protocol_id` FK, `direction` (tx/rx/bidirectional), `connector_label` |
| `system_function` | Logical function of a system | `system_id` FK, `name`, `criticality`, `dal` |

#### Connections & Messages

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `connection` | Port-to-port link between two systems | `project_id` FK, `source_port_id` FK, `dest_port_id` FK, `protocol_id` FK, `bus_id` FK |
| `message` | Protocol-specific message on a connection | `connection_id` FK, `protocol_id` FK, `message_id_primary` (label#, CAN ID, VL ID), `message_id_secondary` (SDI, subaddress), `refresh_rate_hz`, `protocol_attrs` (JSONB) |
| `parameter` | Data item within a message | `message_id` FK, `function_id` FK, `name`, `bit_offset`, `bit_length`, `encoding`, `units`, `min_value`, `max_value`, `resolution`, `scale_factor`, `ssm_convention`, `protocol_attrs` (JSONB) |

#### Backward Compatibility

| Table | Purpose |
|-------|---------|
| `signal_parameter_link` | Bridge: existing `signal.id` ↔ new `parameter.id` |

### 3.3 Protocol Field Schemas

Each `protocol_definition.field_schema` declares what fields are valid for messages and parameters of that bus type. The UI reads this to render protocol-specific forms.

**ARINC 429:**
```json
{
  "message_fields": ["label_number", "sdi", "word_rate_hz", "word_size_bits"],
  "parameter_fields": ["bit_position", "msb", "lsb", "encoding", "range_min", "range_max", "resolution", "ssm_type", "sign_bit"],
  "defaults": {"word_size_bits": 32, "encoding": "BNR"}
}
```

**ARINC 825:**
```json
{
  "message_fields": ["can_id", "dlc", "transmission_type", "bap_id", "node_id"],
  "parameter_fields": ["start_bit", "length", "scale", "offset", "byte_order", "value_type"],
  "defaults": {"dlc": 8, "byte_order": "big_endian"}
}
```

**AFDX (ARINC 664 Part 7):**
```json
{
  "message_fields": ["vl_id", "bag_ms", "max_frame_bytes", "sub_vl_id", "network_id"],
  "parameter_fields": ["byte_offset", "bit_offset", "bit_length", "encoding", "units"],
  "defaults": {"bag_ms": 128, "max_frame_bytes": 1471}
}
```

**MIL-STD-1553B** (via generic serial pattern):
```json
{
  "message_fields": ["rt_address", "subaddress", "word_count", "message_type"],
  "parameter_fields": ["word_number", "bit_position", "bit_length", "encoding", "range_min", "range_max"],
  "defaults": {"word_count": 32, "message_type": "BC_to_RT"}
}
```

**Discrete:**
```json
{
  "message_fields": ["pin_id", "voltage_level", "signal_type"],
  "parameter_fields": ["state_0_meaning", "state_1_meaning", "debounce_ms"],
  "defaults": {"voltage_level": "28V", "signal_type": "open_ground"}
}
```

**Analog:**
```json
{
  "message_fields": ["channel_id", "signal_type", "excitation"],
  "parameter_fields": ["range_min", "range_max", "accuracy_percent", "sample_rate_hz", "filtering"],
  "defaults": {"signal_type": "voltage", "accuracy_percent": 0.1}
}
```

---

## 4. UI Views

### 4.1 System Explorer (NEW — primary 3-level drill-down)

**Level 1 — System List:**
- Shows all systems in the project as cards or list
- Each system shows: name, type, manufacturer, number of ports, number of connections
- Click a system → Level 1 Detail

**Level 1 Detail — System Interfaces:**
- Selected system at top
- Table of all connections: connected system, bus type, direction, message count
- Filter by bus type
- Click a connection → Level 2

**Level 2 — Message List:**
- Shows all messages on the selected connection
- Columns adapt to protocol (A429: Label#, SDI, Rate | A825: CAN ID, DLC | AFDX: VL ID, BAG)
- Click a message → Level 3

**Level 3 — Parameter Detail:**
- Shows all parameters within the selected message
- Columns adapt to protocol (A429: Bit Pos, MSB, LSB, Encoding, Range, Resolution, SSM)
- Editable fields with validation per protocol_definition.validation_rules

### 4.2 Flat Signal Table (EXISTING — keep as-is)

The current `/signals` page continues to work, showing all signals in a flat list. Parameters linked via `signal_parameter_link` can show their hierarchical context (system → connection → message) as additional columns.

### 4.3 N² Matrix (EXISTING — enhanced)

The current N² matrix view is enhanced to use the new `system` and `connection` tables instead of text-based source/dest fields. Clicking a cell navigates to the connection's message list (Level 2).

### 4.4 Bus View (NEW — future)

Filter by bus type across the entire project. E.g., "show me all ARINC 429 labels" regardless of which system pair they belong to.

### 4.5 LRU Filter View (NEW — future)

Select a target LRU, see everything connected to it — all bus types, all messages, all parameters. A flattened view of the hierarchy filtered to one system.

---

## 5. API Endpoints

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/systems` | List systems in project |
| POST | `/api/systems` | Create a system |
| GET | `/api/systems/:id` | System detail with ports, functions, connections |
| GET | `/api/systems/:id/connections` | All connections for a system |
| GET | `/api/connections/:id/messages` | Messages on a connection |
| GET | `/api/messages/:id/parameters` | Parameters in a message |
| POST | `/api/connections` | Create a connection |
| POST | `/api/messages` | Create a message |
| POST | `/api/parameters` | Create a parameter |
| GET | `/api/protocols` | List protocol definitions with field schemas |

### Existing Endpoints (unchanged)

`/api/signals`, `/api/n2-matrix`, `/api/baselines`, `/api/workflows`, `/api/audit` — all continue to work.

---

## 6. Scope

### v1 (This Implementation)

- [x] Database migration (11 new tables, 6 protocol definitions)
- [ ] API endpoints for systems, connections, messages, parameters
- [ ] System Explorer frontend (3-level drill-down)
- [ ] Seed data for testing (eVTOL project with FCC, ADC, AHRS, BMS, EPS)
- [ ] Protocol-aware message/parameter forms (read field_schema, render dynamically)

### v2 (Deferred)

- Device Templates (reusable LRU definitions with port/function templates)
- ARINC 653 software partitions (IMA architecture support)
- Bus View (filter by protocol across project)
- LRU Filter View
- Import from Excel with protocol-aware column mapping
- ICD document export (Word/Excel generation from data)
- Bus load analysis and signal tracing analytics
- Data validity rules (prevent incompatible bus connections)

---

## 7. Competitive Positioning

### vs. PEERSS/dBricks

| Aspect | dBricks | ConnectedICD |
|--------|---------|-------------|
| Data model | Normalized, protocol-modular | Normalized, protocol-flexible (JSONB descriptors) |
| Protocol support | Separate modules per bus type + generic serial | Single generic engine + declarative schemas |
| UI | Web-based, multi-user, concurrent access | Web-based, multi-user (comparable) |
| AI | None | AI-assisted data entry, validation, compliance checking |
| Device templates | Yes (reusable across projects) | Planned for v2 |
| ARINC 653 partitions | Yes | Planned for v2 |
| Wiring/cable design | Full EWIS module | Basic physical_layer (future expansion) |
| Simulink integration | Yes (toolbox) | Not planned |
| ICD export | Word/Excel automated | Planned for v2 |
| Analytics | Bus load, fail-safety, signal tracing | Planned (AI-enhanced) |

### Our Actual Differentiators

1. **AI-assisted data entry** — parse existing ICD PDFs/Excel and populate the model
2. **AI validation** — flag inconsistencies, suggest missing parameters
3. **Standard compliance automation** — automated checks against ARINC specs
4. **Protocol-flexible architecture** — new protocols via data, not code

### Not a Differentiator (Corrected per Advisor)

- ~~Web-native collaboration~~ — dBricks already has this
- ~~Real-time multi-user~~ — dBricks already has this

---

## 8. References

- PEERSS dBricks documentation: https://peerss.net/dbricks/
- Advisor review: corrections on MIL-1553 categorization, physical/logical separation, ARINC 653 gap
- ARINC 429 specification (label structure, BNR/BCD encoding, SSM)
- ARINC 825 specification (CAN-based, 29-bit IDs)
- ARINC 664 Part 7 (AFDX virtual links, BAG scheduling)
- MIL-STD-1553B (RT addressing, subaddress, word structure)
