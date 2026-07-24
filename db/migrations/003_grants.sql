-- 003_grants.sql — standard Supabase role grants.
-- Ensures PostgREST roles can reach public tables (RLS still gates rows;
-- service_role bypasses RLS). Needed when tables are created via direct
-- connection rather than Supabase's auto-grant path. Idempotent.

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables    in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant all privileges on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
