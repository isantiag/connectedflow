-- Migration 018: Phase 2 — Device Templates, Allocations
-- ============================================================

-- 1. Device Templates
-- ============================================================
CREATE TABLE IF NOT EXISTS device_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  part_number TEXT NOT NULL,
  manufacturer TEXT DEFAULT '',
  system_type TEXT NOT NULL DEFAULT 'lru',
  description TEXT DEFAULT '',
  profile_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(part_number)
);

CREATE TABLE IF NOT EXISTS device_template_port (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES device_template(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  direction TEXT DEFAULT 'tx',
  protocol_id UUID REFERENCES protocol_definition(id),
  connector_label TEXT DEFAULT '',
  UNIQUE(template_id, name)
);

CREATE TABLE IF NOT EXISTS device_template_function (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES device_template(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  criticality TEXT DEFAULT 'major',
  dal TEXT DEFAULT '',
  UNIQUE(template_id, name)
);

ALTER TABLE system ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES device_template(id);

-- 2. Allocation Table
-- ============================================================
CREATE TABLE IF NOT EXISTS allocation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  source_canonical_id TEXT NOT NULL,
  target_canonical_id TEXT NOT NULL,
  allocation_type TEXT NOT NULL CHECK (allocation_type IN ('functional','logical','physical','resource','specifies','failure_mode')),
  source_product TEXT NOT NULL DEFAULT 'connectedicd',
  target_product TEXT NOT NULL DEFAULT 'connectedicd',
  rationale TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_canonical_id, target_canonical_id, allocation_type)
);

CREATE INDEX IF NOT EXISTS idx_allocation_project ON allocation(project_id);
CREATE INDEX IF NOT EXISTS idx_allocation_source ON allocation(source_canonical_id);
CREATE INDEX IF NOT EXISTS idx_allocation_target ON allocation(target_canonical_id);
CREATE INDEX IF NOT EXISTS idx_device_template_part ON device_template(part_number);
