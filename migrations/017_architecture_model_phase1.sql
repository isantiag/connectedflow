-- Migration 017: Architecture Model Phase 1
-- Enriches system table, adds bus_instance, system_power_mode
-- Spec: .kiro/specs/architecture-model-phase1/

-- ============================================================
-- 1. Enrich system table
-- ============================================================
ALTER TABLE system ADD COLUMN IF NOT EXISTS canonical_id TEXT;
ALTER TABLE system ADD COLUMN IF NOT EXISTS parent_system_id UUID REFERENCES system(id);
ALTER TABLE system ADD COLUMN IF NOT EXISTS dal_level TEXT NOT NULL DEFAULT '';
ALTER TABLE system ADD COLUMN IF NOT EXISTS redundancy_group TEXT NOT NULL DEFAULT '';
ALTER TABLE system ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE system ADD COLUMN IF NOT EXISTS mass_kg NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS power_watts NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS volume_cm3 NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS length_mm NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS width_mm NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS height_mm NUMERIC;
ALTER TABLE system ADD COLUMN IF NOT EXISTS budget_status TEXT NOT NULL DEFAULT 'estimated';
ALTER TABLE system ADD COLUMN IF NOT EXISTS diagram_x REAL NOT NULL DEFAULT 0;
ALTER TABLE system ADD COLUMN IF NOT EXISTS diagram_y REAL NOT NULL DEFAULT 0;
ALTER TABLE system ADD COLUMN IF NOT EXISTS profile_data JSONB NOT NULL DEFAULT '{}';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_system_parent ON system(parent_system_id);
CREATE INDEX IF NOT EXISTS idx_system_dal ON system(dal_level) WHERE dal_level != '';
CREATE INDEX IF NOT EXISTS idx_system_type ON system(system_type);
CREATE INDEX IF NOT EXISTS idx_system_canonical ON system(canonical_id) WHERE canonical_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_project_type ON system(project_id, system_type);

-- ============================================================
-- 2. Bus instance table (Option 3 — grouping entity)
-- ============================================================
CREATE TABLE IF NOT EXISTS bus_instance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  canonical_id TEXT,
  name TEXT NOT NULL,
  protocol_id UUID REFERENCES protocol_definition(id),
  redundancy TEXT NOT NULL DEFAULT 'single'
    CHECK (redundancy IN ('single','dual','triple')),
  bandwidth_kbps NUMERIC,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bus_instance_project ON bus_instance(project_id);
CREATE INDEX IF NOT EXISTS idx_bus_instance_canonical ON bus_instance(canonical_id)
  WHERE canonical_id IS NOT NULL;

-- ============================================================
-- 3. Power modes table
-- ============================================================
CREATE TABLE IF NOT EXISTS system_power_mode (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_id UUID NOT NULL REFERENCES system(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  power_watts NUMERIC NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(system_id, mode)
);

-- ============================================================
-- 4. Add profile_data + canonical_id to connection table
-- ============================================================
ALTER TABLE connection ADD COLUMN IF NOT EXISTS profile_data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE connection ADD COLUMN IF NOT EXISTS canonical_id TEXT;

-- ============================================================
-- 5. Re-point connection.bus_id from old bus table to bus_instance
-- ============================================================
-- Drop the old FK to bus(id) and add new FK to bus_instance(id)
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'connection_bus_id_fkey'
             AND table_name = 'connection') THEN
    ALTER TABLE connection DROP CONSTRAINT connection_bus_id_fkey;
  END IF;
  -- Add new FK to bus_instance
  ALTER TABLE connection ADD CONSTRAINT connection_bus_instance_fkey
    FOREIGN KEY (bus_id) REFERENCES bus_instance(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 6. Seed a default project if none exists (for development)
-- ============================================================
INSERT INTO project (name, aircraft_type, certification_basis, program_phase)
SELECT 'Enter Aero eVTOL FCS', 'eVTOL', 'FAR Part 23 Amendment 64', 'preliminary'
WHERE NOT EXISTS (SELECT 1 FROM project LIMIT 1);
