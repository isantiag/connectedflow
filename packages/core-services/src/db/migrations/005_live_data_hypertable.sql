-- 005_live_data_hypertable.sql
-- TimescaleDB hypertable for live parameter readings.
-- NOTE: This migration must be run against the TimescaleDB instance
-- (connectedflow_timeseries on port 5433), NOT the main PostgreSQL instance.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE live_parameter_readings (
    time               TIMESTAMPTZ NOT NULL,
    session_id         UUID NOT NULL,
    signal_id          UUID NOT NULL,
    raw_value          BYTEA,
    decoded_value      DOUBLE PRECISION,
    in_range           BOOLEAN,
    deviation_severity TEXT,
    adapter_id         UUID NOT NULL
);

-- Convert to hypertable partitioned by time
SELECT create_hypertable('live_parameter_readings', 'time');

-- Indexes for common query patterns
CREATE INDEX idx_lpr_session_time ON live_parameter_readings(session_id, time DESC);
CREATE INDEX idx_lpr_signal_time ON live_parameter_readings(signal_id, time DESC);
CREATE INDEX idx_lpr_adapter_time ON live_parameter_readings(adapter_id, time DESC);
