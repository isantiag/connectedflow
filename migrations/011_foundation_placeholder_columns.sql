-- Foundation #3: Placeholder columns for DoD/enterprise readiness
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS mfa_method TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS us_person BOOLEAN DEFAULT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS citizenship_country TEXT DEFAULT NULL;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'us-east-1';
ALTER TABLE project ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'unclassified';
