-- Foundation Migration: tenant_id + custom_fields
-- Date: 2026-04-24
-- Run: docker exec connectedflow-postgres psql -U connectedflow -d connectedflow -f /path/to/this/file

CREATE TABLE IF NOT EXISTS tenant (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'Default',
  slug TEXT UNIQUE NOT NULL DEFAULT 'default',
  plan TEXT NOT NULL DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO tenant (id, name, slug) VALUES ('default', 'Enter Aero', 'enter-aero') ON CONFLICT DO NOTHING;

-- Add tenant_id + custom_fields to ALL tables
-- This uses a DO block to iterate all tables dynamically
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename NOT IN ('tenant')
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT ''default'' REFERENCES tenant(id)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT ''{}''', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON %I (tenant_id)', t, t);
  END LOOP;
END $$;
