-- 007_add_user_fk_constraints.sql
-- Add foreign key constraints from signal and baseline to user table.
-- These are deferred because the user table is created in migration 003
-- while signal and baseline are created in 001/002.

ALTER TABLE signal
    ADD CONSTRAINT fk_signal_created_by FOREIGN KEY (created_by) REFERENCES "user"(id),
    ADD CONSTRAINT fk_signal_updated_by FOREIGN KEY (updated_by) REFERENCES "user"(id);

ALTER TABLE baseline
    ADD CONSTRAINT fk_baseline_created_by FOREIGN KEY (created_by) REFERENCES "user"(id);
