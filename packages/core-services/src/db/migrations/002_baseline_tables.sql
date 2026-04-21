-- 002_baseline_tables.sql
-- Baseline and baseline snapshot tables for configuration management.
-- Baselines are immutable snapshots of the ICD database at a point in time.

CREATE TABLE baseline (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id    UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    version_label TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','superseded'))
);

CREATE INDEX idx_baseline_project_id ON baseline(project_id);
CREATE INDEX idx_baseline_status ON baseline(status);

CREATE TABLE baseline_snapshot (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    baseline_id        UUID NOT NULL REFERENCES baseline(id) ON DELETE CASCADE,
    signal_id          UUID NOT NULL REFERENCES signal(id) ON DELETE SET NULL,
    logical_snapshot   JSONB NOT NULL DEFAULT '{}',
    transport_snapshot JSONB NOT NULL DEFAULT '{}',
    physical_snapshot  JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_baseline_snapshot_baseline_id ON baseline_snapshot(baseline_id);
CREATE INDEX idx_baseline_snapshot_signal_id ON baseline_snapshot(signal_id);
