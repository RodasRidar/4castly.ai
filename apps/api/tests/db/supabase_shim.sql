-- Minimal stand-in for what Supabase provides before our migrations run: roles, the auth schema,
-- the storage tables and Supabase's default privileges. Mirrors the hosted defaults on purpose, so
-- the migrations are tested against the same over-generous starting grants.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin nologin noinherit;

create schema extensions;
create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_app_meta_data  jsonb not null default '{}',
  raw_user_meta_data jsonb not null default '{}',
  created_at         timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create schema storage;
create table storage.buckets (
  id     text primary key,
  name   text not null unique,
  public boolean not null default false
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end
$$;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
grant usage on schema auth to supabase_auth_admin;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
