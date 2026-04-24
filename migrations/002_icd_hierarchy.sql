-- ConnectedICD: 3-Level ICD Hierarchy Migration
-- Additive migration — no existing tables modified or dropped.
--
-- Hierarchy:
--   Project → System → Port → Connection → Message → Parameter
--
-- Design principles:
--   1. Protocol-flexible via generic descriptors (protocol_definition.field_schema JSONB)
--   2. Physical/logical separation (ports vs functions vs parameters)
--   3. Reusable device templates (future)
--   4. Compatible with existing signal/logical_layer/transport_layer tables

-- ============================================================
-- COMMON OBJECTS (shared across projects)
-- ============================================================

-- Wire types (referenced by physical_layer, extends existing cable_bundle)
CREATE TABLE IF NOT EXISTS wire_type (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  gauge TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT 'copper',
  max_voltage_v DOUBLE PRECISION,
  max_current_a DOUBLE PRECISION,
  shielded BOOLEAN NOT NULL DEFAULT false
);

-- Connector types (normalizes the text field in existing connector table)
CREATE TABLE IF NOT EXISTS connector_type (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  standard TEXT NOT NULL DEFAULT '',       -- e.g. 'ARINC 600', 'MIL-C-38999', 'D-Sub'
  total_pins INTEGER,
  form_factor TEXT NOT NULL DEFAULT ''
);

-- Data encoding types (BNR, BCD, discrete, float32, uint16, etc.)
CREATE TABLE IF NOT EXISTS data_encoding (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,               -- 'BNR', 'BCD', 'discrete', 'float32', 'uint16'
  description TEXT NOT NULL DEFAULT '',
  bit_conventions JSONB NOT NULL DEFAULT '{}'  -- e.g. {"msb_first": true, "sign_bit": true}
);

-- Units catalog
CREATE TABLE IF NOT EXISTS unit_of_measure (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,               -- 'knots', 'degrees', 'volts', 'rpm'
  symbol TEXT NOT NULL DEFAULT '',          -- 'kts', '°', 'V', 'rpm'
  quantity_type TEXT NOT NULL DEFAULT ''    -- 'speed', 'angle', 'voltage', 'rotation'
);

-- ============================================================
-- SYSTEM / DEVICE ENTITIES
-- ============================================================

-- System (LRU instance within a project)
CREATE TABLE IF NOT EXISTS system (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- 'FCC', 'ADC', 'AHRS', 'BMS'
  description TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  part_number TEXT NOT NULL DEFAULT '',
  ata_chapter TEXT NOT NULL DEFAULT '',    -- ATA 100 chapter (e.g. '34' for Navigation)
  system_type TEXT NOT NULL DEFAULT 'lru', -- 'lru', 'sensor', 'actuator', 'switch', 'bus_coupler'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

-- System port (physical connection point on a system)
CREATE TABLE IF NOT EXISTS system_port (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_id UUID NOT NULL REFERENCES system(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- 'A429_TX_CH1', 'DISC_OUT_3', 'AFDX_PORT_A'
  protocol_id UUID REFERENCES protocol_definition(id),
  direction TEXT NOT NULL DEFAULT 'tx',    -- 'tx', 'rx', 'bidirectional'
  connector_label TEXT NOT NULL DEFAULT '', -- physical connector reference (e.g. 'J1', 'P2')
  port_index INTEGER,                      -- ordering within the system
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(system_id, name)
);

-- System function (logical purpose — separates physical from logical)
CREATE TABLE IF NOT EXISTS system_function (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_id UUID NOT NULL REFERENCES system(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- 'Air Data Processing', 'ILS Navigation'
  description TEXT NOT NULL DEFAULT '',
  criticality TEXT NOT NULL DEFAULT 'major', -- 'catastrophic', 'hazardous', 'major', 'minor', 'no_effect'
  dal TEXT NOT NULL DEFAULT '',             -- Design Assurance Level: A, B, C, D, E
  UNIQUE(system_id, name)
);

-- ============================================================
-- CONNECTIONS (port-to-port links between systems)
-- ============================================================

CREATE TABLE IF NOT EXISTS connection (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  source_port_id UUID NOT NULL REFERENCES system_port(id) ON DELETE CASCADE,
  dest_port_id UUID NOT NULL REFERENCES system_port(id) ON DELETE CASCADE,
  bus_id UUID REFERENCES bus(id),          -- which bus instance carries this connection
  protocol_id UUID NOT NULL REFERENCES protocol_definition(id),
  name TEXT NOT NULL DEFAULT '',           -- optional label: 'FCC→ADC A429 Link 1'
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_port_id, dest_port_id)
);

-- ============================================================
-- MESSAGES / LABELS (Level 2 — protocol-specific)
-- ============================================================

CREATE TABLE IF NOT EXISTS message (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES connection(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES protocol_definition(id),
  -- Generic identifier fields (protocol-specific meaning):
  --   A429: label_number (octal), SDI
  --   A825: can_id (hex)
  --   AFDX: vl_id
  --   MIL-1553: rt_address + subaddress
  --   Discrete: pin_id
  message_id_primary TEXT NOT NULL,        -- '0310', '0x18FF00', 'VL_042'
  message_id_secondary TEXT,               -- SDI for A429, subaddress for 1553
  name TEXT NOT NULL DEFAULT '',           -- human-readable: 'Airspeed Label'
  direction TEXT NOT NULL DEFAULT 'tx',
  refresh_rate_hz DOUBLE PRECISION,
  word_count INTEGER,                      -- A429: always 1, 1553: 1-32, AFDX: variable
  protocol_attrs JSONB NOT NULL DEFAULT '{}', -- protocol-specific fields per field_schema
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PARAMETERS (Level 3 — bit-level detail within a message)
-- ============================================================

CREATE TABLE IF NOT EXISTS parameter (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  function_id UUID REFERENCES system_function(id), -- maps to logical function
  name TEXT NOT NULL,                      -- 'AIRSPEED_IAS', 'ALTITUDE_BARO'
  description TEXT NOT NULL DEFAULT '',
  -- Bit-level positioning
  bit_offset INTEGER NOT NULL DEFAULT 0,
  bit_length INTEGER NOT NULL DEFAULT 1,
  byte_order TEXT NOT NULL DEFAULT 'big_endian',
  -- Data encoding
  encoding TEXT NOT NULL DEFAULT 'unsigned', -- 'BNR', 'BCD', 'discrete', 'unsigned', 'signed', 'float32'
  -- Engineering range
  units TEXT NOT NULL DEFAULT '',
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  resolution DOUBLE PRECISION,             -- e.g. 0.0625 for A429 BNR
  scale_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  offset_value DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  -- A429-specific (stored here for convenience, also in protocol_attrs)
  ssm_convention TEXT,                     -- 'BNR', 'BCD', 'discrete'
  -- Generic protocol-specific overflow
  protocol_attrs JSONB NOT NULL DEFAULT '{}',
  -- Metadata
  criticality TEXT NOT NULL DEFAULT 'major',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- LINK: parameter ↔ existing signal table (backward compatibility)
-- ============================================================

CREATE TABLE IF NOT EXISTS signal_parameter_link (
  signal_id UUID NOT NULL REFERENCES signal(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES parameter(id) ON DELETE CASCADE,
  PRIMARY KEY (signal_id, parameter_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_system_project ON system(project_id);
CREATE INDEX IF NOT EXISTS idx_system_port_system ON system_port(system_id);
CREATE INDEX IF NOT EXISTS idx_system_function_system ON system_function(system_id);
CREATE INDEX IF NOT EXISTS idx_connection_project ON connection(project_id);
CREATE INDEX IF NOT EXISTS idx_connection_source ON connection(source_port_id);
CREATE INDEX IF NOT EXISTS idx_connection_dest ON connection(dest_port_id);
CREATE INDEX IF NOT EXISTS idx_message_connection ON message(connection_id);
CREATE INDEX IF NOT EXISTS idx_parameter_message ON parameter(message_id);
CREATE INDEX IF NOT EXISTS idx_parameter_function ON parameter(function_id);

-- ============================================================
-- SEED: Protocol definitions for common bus types
-- ============================================================

INSERT INTO protocol_definition (protocol_name, version, field_schema, validation_rules)
VALUES
  ('ARINC 429', '3', '{
    "message_fields": ["label_number", "sdi", "word_rate_hz", "word_size_bits"],
    "parameter_fields": ["bit_position", "msb", "lsb", "encoding", "range_min", "range_max", "resolution", "ssm_type", "sign_bit"],
    "defaults": {"word_size_bits": 32, "encoding": "BNR"}
  }', '{"max_labels_per_channel": 256, "word_size": 32, "max_rate_hz": 100}'),

  ('ARINC 825', '4', '{
    "message_fields": ["can_id", "dlc", "transmission_type", "bap_id", "node_id"],
    "parameter_fields": ["start_bit", "length", "scale", "offset", "byte_order", "value_type"],
    "defaults": {"dlc": 8, "byte_order": "big_endian"}
  }', '{"max_dlc": 8, "id_bits": 29}'),

  ('AFDX', '664p7', '{
    "message_fields": ["vl_id", "bag_ms", "max_frame_bytes", "sub_vl_id", "network_id"],
    "parameter_fields": ["byte_offset", "bit_offset", "bit_length", "encoding", "units"],
    "defaults": {"bag_ms": 128, "max_frame_bytes": 1471}
  }', '{"max_vl_id": 65535, "min_bag_ms": 1, "max_frame_bytes": 1471}'),

  ('MIL-STD-1553', 'B', '{
    "message_fields": ["rt_address", "subaddress", "word_count", "message_type"],
    "parameter_fields": ["word_number", "bit_position", "bit_length", "encoding", "range_min", "range_max"],
    "defaults": {"word_count": 32, "message_type": "BC_to_RT"}
  }', '{"max_rt_address": 31, "max_subaddress": 30, "max_word_count": 32}'),

  ('Discrete', '1.0', '{
    "message_fields": ["pin_id", "voltage_level", "signal_type"],
    "parameter_fields": ["state_0_meaning", "state_1_meaning", "debounce_ms"],
    "defaults": {"voltage_level": "28V", "signal_type": "open_ground"}
  }', '{"valid_types": ["open_ground", "open_voltage", "differential"]}'),

  ('Analog', '1.0', '{
    "message_fields": ["channel_id", "signal_type", "excitation"],
    "parameter_fields": ["range_min", "range_max", "accuracy_percent", "sample_rate_hz", "filtering"],
    "defaults": {"signal_type": "voltage", "accuracy_percent": 0.1}
  }', '{"valid_types": ["voltage", "current", "resistance", "lvdt", "proximity"]}')

ON CONFLICT DO NOTHING;
