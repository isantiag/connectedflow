-- Foundation Migration: tenant_id + custom_fields
-- Date: 2026-04-24
-- Adds multi-tenancy support and extensible data model to all 46 tables
CREATE TABLE IF NOT EXISTS tenant (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'Default',
  slug TEXT UNIQUE NOT NULL DEFAULT 'default',
  plan TEXT NOT NULL DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO tenant (id, name, slug) VALUES ('default', 'Enter Aero', 'enter-aero') ON CONFLICT DO NOTHING;
