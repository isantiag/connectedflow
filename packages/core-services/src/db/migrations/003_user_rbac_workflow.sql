-- 003_user_rbac_workflow.sql
-- User, role, role_permission, change_request, and audit_entry tables.

-- -----------------------------------------------------------------------
-- User
-- -----------------------------------------------------------------------
CREATE TABLE "user" (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    auth_provider TEXT NOT NULL DEFAULT 'local',
    external_id   TEXT,
    mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
    last_login    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------
-- Role
-- -----------------------------------------------------------------------
CREATE TABLE role (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);

-- -----------------------------------------------------------------------
-- User ↔ Role join table
-- -----------------------------------------------------------------------
CREATE TABLE user_role (
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- -----------------------------------------------------------------------
-- Role Permission
-- -----------------------------------------------------------------------
CREATE TABLE role_permission (
    id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id  UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    resource TEXT NOT NULL,
    action   TEXT NOT NULL
);

CREATE INDEX idx_role_permission_role_id ON role_permission(role_id);
CREATE UNIQUE INDEX idx_role_permission_unique ON role_permission(role_id, resource, action);


-- -----------------------------------------------------------------------
-- Change Request (approval workflow)
-- -----------------------------------------------------------------------
CREATE TABLE change_request (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id        UUID NOT NULL REFERENCES signal(id) ON DELETE CASCADE,
    submitted_by     UUID NOT NULL REFERENCES "user"(id),
    approved_by      UUID REFERENCES "user"(id),
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
    change_payload   JSONB NOT NULL DEFAULT '{}',
    rejection_reason TEXT,
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);

CREATE INDEX idx_change_request_signal_id ON change_request(signal_id);
CREATE INDEX idx_change_request_submitted_by ON change_request(submitted_by);
CREATE INDEX idx_change_request_status ON change_request(status);

-- -----------------------------------------------------------------------
-- Audit Entry
-- -----------------------------------------------------------------------
CREATE TABLE audit_entry (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES "user"(id),
    entity_type  TEXT NOT NULL,
    entity_id    UUID NOT NULL,
    action       TEXT NOT NULL,
    before_state JSONB,
    after_state  JSONB,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entry_user_id ON audit_entry(user_id);
CREATE INDEX idx_audit_entry_entity ON audit_entry(entity_type, entity_id);
CREATE INDEX idx_audit_entry_timestamp ON audit_entry(timestamp);
