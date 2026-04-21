-- 004_trace_link.sql
-- Traceability links between signals and upstream requirements (DOORS/Jama).

CREATE TABLE trace_link (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id               UUID NOT NULL REFERENCES signal(id) ON DELETE CASCADE,
    requirement_tool        TEXT NOT NULL CHECK (requirement_tool IN ('doors','jama')),
    external_requirement_id TEXT NOT NULL,
    requirement_text        TEXT NOT NULL DEFAULT '',
    link_status             TEXT NOT NULL DEFAULT 'active' CHECK (link_status IN ('active','stale','broken')),
    last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    direction               TEXT NOT NULL DEFAULT 'bidirectional'
);

CREATE INDEX idx_trace_link_signal_id ON trace_link(signal_id);
CREATE INDEX idx_trace_link_status ON trace_link(link_status);
CREATE UNIQUE INDEX idx_trace_link_unique ON trace_link(signal_id, requirement_tool, external_requirement_id);
