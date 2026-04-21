-- 001_initial_schema.sql
-- Core ICD tables: project, protocol_definition, bus, connector, cable_bundle,
-- signal (with optimistic locking), logical_layer, transport_layer, physical_layer.
-- All primary keys are UUID. JSONB used for protocol_attrs.

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------
-- Project
-- -----------------------------------------------------------------------
CREATE TABLE project (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    aircraft_type       TEXT NOT NULL,
    certification_basis TEXT NOT NULL,
    program_phase       TEXT NOT NULL CHECK (program_phase IN ('concept','preliminary','detailed','certification','production')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------
-- Protocol Definition
-- -----------------------------------------------------------------------
CREATE TABLE protocol_definition (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    protocol_name    TEXT NOT NULL UNIQUE,
    version          TEXT NOT NULL,
    field_schema     JSONB NOT NULL DEFAULT '{}',
    validation_rules JSONB NOT NULL DEFAULT '{}'
);

-- -----------------------------------------------------------------------
-- Bus
-- -----------------------------------------------------------------------
CREATE TABLE bus (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    protocol_id     UUID NOT NULL REFERENCES protocol_definition(id),
    bandwidth_bps   DOUBLE PRECISION NOT NULL,
    redundancy_mode TEXT NOT NULL DEFAULT 'none' CHECK (redundancy_mode IN ('none','dual','triple'))
);

CREATE INDEX idx_bus_project_id ON bus(project_id);

-- -----------------------------------------------------------------------
-- Connector
-- -----------------------------------------------------------------------
CREATE TABLE connector (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    part_number    TEXT NOT NULL,
    connector_type TEXT NOT NULL,
    total_pins     INTEGER NOT NULL,
    location       TEXT NOT NULL,
    equipment_id   UUID
);

-- -----------------------------------------------------------------------
-- Cable Bundle
-- -----------------------------------------------------------------------
CREATE TABLE cable_bundle (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id      TEXT NOT NULL,
    route_path     TEXT NOT NULL,
    total_length_m DOUBLE PRECISION NOT NULL,
    bundle_type    TEXT NOT NULL
);

-- -----------------------------------------------------------------------
-- Signal (with version column for optimistic locking)
-- -----------------------------------------------------------------------
CREATE TABLE signal (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    project_id  UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','deprecated','archived')),
    criticality TEXT NOT NULL DEFAULT 'info' CHECK (criticality IN ('critical','major','minor','info')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID,
    updated_by  UUID,
    version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_signal_project_id ON signal(project_id);
CREATE INDEX idx_signal_status ON signal(status);
CREATE INDEX idx_signal_name ON signal(name);


-- -----------------------------------------------------------------------
-- Logical Layer
-- -----------------------------------------------------------------------
CREATE TABLE logical_layer (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id           UUID NOT NULL UNIQUE REFERENCES signal(id) ON DELETE CASCADE,
    data_type           TEXT NOT NULL,
    min_value           DOUBLE PRECISION,
    max_value           DOUBLE PRECISION,
    units               TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL DEFAULT '',
    source_system       TEXT NOT NULL DEFAULT '',
    dest_system         TEXT NOT NULL DEFAULT '',
    refresh_rate_hz     DOUBLE PRECISION NOT NULL DEFAULT 0,
    functional_category TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_logical_layer_signal_id ON logical_layer(signal_id);

-- -----------------------------------------------------------------------
-- Transport Layer (JSONB for protocol-specific attributes)
-- -----------------------------------------------------------------------
CREATE TABLE transport_layer (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id      UUID NOT NULL UNIQUE REFERENCES signal(id) ON DELETE CASCADE,
    protocol_id    UUID NOT NULL REFERENCES protocol_definition(id),
    bus_id         UUID NOT NULL REFERENCES bus(id),
    protocol_attrs JSONB NOT NULL DEFAULT '{}',
    bit_offset     INTEGER NOT NULL DEFAULT 0,
    bit_length     INTEGER NOT NULL DEFAULT 1,
    encoding       TEXT NOT NULL DEFAULT 'unsigned' CHECK (encoding IN ('unsigned','signed','ieee754','bcd')),
    scale_factor   DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    offset_value   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    byte_order     TEXT NOT NULL DEFAULT 'big_endian' CHECK (byte_order IN ('big_endian','little_endian'))
);

CREATE INDEX idx_transport_layer_signal_id ON transport_layer(signal_id);
CREATE INDEX idx_transport_layer_bus_id ON transport_layer(bus_id);
CREATE INDEX idx_transport_layer_protocol_id ON transport_layer(protocol_id);

-- -----------------------------------------------------------------------
-- Physical Layer
-- -----------------------------------------------------------------------
CREATE TABLE physical_layer (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id       UUID NOT NULL UNIQUE REFERENCES signal(id) ON DELETE CASCADE,
    connector_id    UUID NOT NULL REFERENCES connector(id),
    pin_number      TEXT NOT NULL,
    cable_bundle_id UUID NOT NULL REFERENCES cable_bundle(id),
    wire_gauge      TEXT NOT NULL,
    wire_color      TEXT NOT NULL DEFAULT '',
    wire_type       TEXT NOT NULL DEFAULT '',
    max_length_m    DOUBLE PRECISION NOT NULL DEFAULT 0,
    shielding       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_physical_layer_signal_id ON physical_layer(signal_id);
CREATE INDEX idx_physical_layer_connector_id ON physical_layer(connector_id);
CREATE INDEX idx_physical_layer_cable_bundle_id ON physical_layer(cable_bundle_id);
