-- TiSLY PostgreSQL RLS preparation (Phase 281-300)
-- TODO: apply after migration to Postgres; run as superuser then grant to app role.

-- Session variable: SET LOCAL app.current_customer_id = '<uuid>';

-- customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant_isolation ON customers
  FOR ALL
  USING (customer_id = current_setting('app.current_customer_id', true));

-- sites
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY sites_tenant_isolation ON sites
  FOR ALL
  USING (
    customer_id = current_setting('app.current_customer_id', true)
    OR tenant_id = current_setting('app.current_customer_id', true)
  );

-- devices
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY devices_tenant_isolation ON devices
  FOR ALL
  USING (
    customer_id = current_setting('app.current_customer_id', true)
    OR tenant_id = current_setting('app.current_customer_id', true)
  );

-- events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_tenant_isolation ON events
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_customer_id', true)
    OR customer_id = current_setting('app.current_customer_id', true)
  );

-- incidents
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidents_tenant_isolation ON incidents
  FOR ALL
  USING (
    customer_id = current_setting('app.current_customer_id', true)
    OR tenant_id = current_setting('app.current_customer_id', true)
  );

-- customer_report_exports (reports)
ALTER TABLE customer_report_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_tenant_isolation ON customer_report_exports
  FOR ALL
  USING (customer_id = current_setting('app.current_customer_id', true));

-- App role bypass for platform admin (TODO):
-- CREATE POLICY admin_bypass ON customers FOR ALL TO tisly_admin USING (true);
