-- 006_ai_extraction.sql
-- Parse job and extracted signal tables for AI document extraction pipeline.

CREATE TABLE parse_job (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id              TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued','processing','review_pending','confirmed','failed')),
    total_tables_found       INTEGER NOT NULL DEFAULT 0,
    total_signals_extracted  INTEGER NOT NULL DEFAULT 0,
    avg_confidence           DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_confidence_count    INTEGER NOT NULL DEFAULT 0,
    low_confidence_count     INTEGER NOT NULL DEFAULT 0,
    unmapped_field_count     INTEGER NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at             TIMESTAMPTZ
);

CREATE INDEX idx_parse_job_status ON parse_job(status);

CREATE TABLE extracted_signal (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parse_job_id    UUID NOT NULL REFERENCES parse_job(id) ON DELETE CASCADE,
    data            JSONB NOT NULL DEFAULT '{}',
    confidence      DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
    source_page     INTEGER,
    source_table    INTEGER,
    source_row      INTEGER,
    needs_review    BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_extracted_signal_parse_job_id ON extracted_signal(parse_job_id);
CREATE INDEX idx_extracted_signal_needs_review ON extracted_signal(needs_review);
