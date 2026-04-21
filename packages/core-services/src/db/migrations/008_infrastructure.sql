-- ConnectedICD infrastructure tables (same pattern as AssureFlow)

-- Data-level access control
CREATE TABLE IF NOT EXISTS user_scope (
  id VARCHAR(26) PRIMARY KEY,
  user_id VARCHAR(26) NOT NULL,
  project_id VARCHAR(26),
  allowed_systems TEXT[] NOT NULL DEFAULT '{}',
  allowed_protocols TEXT[] NOT NULL DEFAULT '{}',
  allowed_types TEXT[] NOT NULL DEFAULT '{}',
  granted_by VARCHAR(26) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_entry (
  id VARCHAR(26) PRIMARY KEY,
  actor_id VARCHAR(255) NOT NULL,
  actor_type VARCHAR(20) NOT NULL DEFAULT 'user',
  action_type VARCHAR(30) NOT NULL,
  target_id VARCHAR(255),
  target_entity_type VARCHAR(50) NOT NULL,
  change_delta JSONB,
  ip_address VARCHAR(45),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notification (
  id VARCHAR(26) PRIMARY KEY,
  recipient_id VARCHAR(26) NOT NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  body TEXT,
  target_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'unread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add role to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'editor';
