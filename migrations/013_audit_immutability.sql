-- §7.2: Audit trail immutability — prevent UPDATE/DELETE on audit_entry
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_entry table is immutable — UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_immutable ON audit_entry;
CREATE TRIGGER audit_immutable
  BEFORE UPDATE OR DELETE ON audit_entry
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
