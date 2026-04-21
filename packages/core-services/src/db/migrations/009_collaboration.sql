-- Multi-Supplier Collaboration tables

-- Signal ownership: who owns the source side vs destination side
CREATE TABLE IF NOT EXISTS signal_ownership (
  id VARCHAR(26) PRIMARY KEY,
  signal_id VARCHAR(26) NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  source_owner_id VARCHAR(26) NOT NULL,
  dest_owner_id VARCHAR(26),
  source_org VARCHAR(255) NOT NULL,
  dest_org VARCHAR(255),
  handshake_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  source_approved_at TIMESTAMPTZ,
  dest_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comment threads on signals
CREATE TABLE IF NOT EXISTS signal_comment (
  id VARCHAR(26) PRIMARY KEY,
  signal_id VARCHAR(26) NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  parent_id VARCHAR(26) REFERENCES signal_comment(id),
  author_id VARCHAR(26) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  author_org VARCHAR(255),
  body TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Edit locks for conflict detection
CREATE TABLE IF NOT EXISTS signal_edit_lock (
  signal_id VARCHAR(26) PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
  locked_by VARCHAR(26) NOT NULL,
  locked_by_name VARCHAR(255) NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- Supplier organizations
CREATE TABLE IF NOT EXISTS organization (
  id VARCHAR(26) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'supplier',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-org mapping
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id VARCHAR(26);
