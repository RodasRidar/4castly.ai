-- 0002 foundation (plan section 5, 11 and 12): tenancy hardening, conversations and jobs, run results,
-- chat, row-change audit, least-privilege grants and RLS for every verb, storage policies, signup hook.
--
-- Conventions
--   * Every domain table carries tenant_id. Child rows use composite foreign keys (tenant_id, id), so a
--     row can never point at another tenant's parent.
--   * The API connects as app_api (no BYPASSRLS) and, per request, runs `set local role authenticated`
--     with the verified JWT claims; the worker connects as app_worker (BYPASSRLS) and always filters by
--     the job's tenant. Browser-reachable roles get only the privileges listed in the grants section.
--   * Expand/contract (R11): nothing is dropped that a running API version still reads, except the
--     objects that never held data (skus, forecast_jobs, the pgmq queue).

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Roles (login and password are set out of band, per environment)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_api') then
    create role app_api noinherit nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_worker') then
    create role app_worker noinherit nologin bypassrls;
  end if;
end
$$;

alter role app_api set statement_timeout = '5s';
alter role app_worker set statement_timeout = '15min';
grant authenticated to app_api;  -- lets the API `set local role authenticated`

-- ---------------------------------------------------------------------------
-- Rename the catalog (D4) and retire the pgmq queue (D5: jobs replace it)
-- ---------------------------------------------------------------------------
alter table public.skus rename to products;
alter table public.products rename constraint skus_pkey to products_pkey;
alter table public.products rename constraint skus_tenant_id_code_key to products_tenant_id_code_key;
alter table public.products rename constraint skus_tenant_id_fkey to products_tenant_id_fkey;
alter table public.products add constraint products_tenant_id_id_key unique (tenant_id, id);

alter table public.movements rename column sku_id to product_id;
alter table public.demand_series rename column sku_id to product_id;
alter table public.forecasts rename column sku_id to product_id;
alter index public.movements_tenant_sku_time_idx rename to movements_tenant_product_time_idx;
alter index public.forecasts_tenant_sku_horizon_idx rename to forecasts_tenant_product_horizon_idx;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pgmq') then
    perform pgmq.drop_queue('forecast_jobs');
  end if;
exception
  when others then
    raise notice 'pgmq queue forecast_jobs was not dropped: %', sqlerrm;  -- already gone is fine
end
$$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
drop index public.tenant_members_user_idx;
alter table public.tenant_members add constraint tenant_members_user_id_key unique (user_id);  -- one tenant per user in v1

create table public.allowed_emails (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  email       extensions.citext not null unique,
  invited_at  timestamptz not null default now()
);

create table public.profiles (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null default '' check (char_length(full_name) <= 120),
  job_title       text check (char_length(job_title) <= 120),
  theme           text not null default 'system' check (theme in ('light', 'dark', 'system')),
  locale          text not null default 'es' check (locale in ('es', 'en')),
  time_zone       text not null default 'America/Lima',
  assistant_style text not null default 'brief' check (assistant_style in ('brief', 'detailed'))
);

-- ---------------------------------------------------------------------------
-- Conversations, uploads, plans, jobs
-- ---------------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null,
  title            text not null default '' check (char_length(title) <= 120),
  pinned_at        timestamptz,
  archived_at      timestamptz,
  deleted_at       timestamptz,   -- soft delete, undone within 30 days
  stage            text not null default 'uploaded' check (stage in (
    'queued', 'uploaded', 'digesting', 'unreadable', 'needs_date_column', 'awaiting_confirmation',
    'confirmed', 'clarifying', 'calculating', 'ready', 'failed', 'cancelled')),
  current_run_id   uuid,          -- foreign key added once forecast_runs exists
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (tenant_id, id)
);
create index conversations_tenant_activity_idx on public.conversations (tenant_id, last_activity_at desc);

create table public.uploads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid,           -- null until POST /uploads/{id}/complete creates the conversation
  created_by      uuid references auth.users (id) on delete set null,
  storage_path    text not null,
  file_name       text not null check (char_length(file_name) between 1 and 255),
  size_bytes      bigint not null check (size_bytes > 0),
  content_type    text not null,
  sheets          text[] not null default '{}',
  selected_sheet  text,
  profile         jsonb,
  status          text not null default 'pending' check (status in ('pending', 'uploaded', 'readable', 'failed')),
  error_code      text,
  created_at      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade
);
create index uploads_tenant_conversation_idx on public.uploads (tenant_id, conversation_id);

create table public.normalization_plans (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  upload_id    uuid not null,
  plan         jsonb not null,    -- versioned schema, plan section 6c
  proposed_by  text not null check (proposed_by in ('llm', 'rules', 'user')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, upload_id) references public.uploads (tenant_id, id) on delete cascade
);
create index normalization_plans_tenant_upload_idx on public.normalization_plans (tenant_id, upload_id);

-- Replaces forecast_jobs (D5): digestion and forecast jobs. The table is the source of truth (R1).
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  conversation_id  uuid not null,
  kind             text not null check (kind in ('digest', 'forecast')),
  status           text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  stage            text,
  processed        int check (processed >= 0),
  total            int check (total >= 0),
  attempts         int not null default 0,
  heartbeat_at     timestamptz,
  cancel_requested boolean not null default false,
  traceparent      text,
  error_ref        text,          -- short support code; never a stack trace
  params           jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade
);
create unique index jobs_one_active_per_conversation on public.jobs (conversation_id)
  where status in ('queued', 'running');
create index jobs_tenant_status_idx on public.jobs (tenant_id, status);

create table public.job_events (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  job_id     uuid not null,
  stage      text not null,
  at         timestamptz not null default now(),
  foreign key (tenant_id, job_id) references public.jobs (tenant_id, id) on delete cascade
);
create index job_events_job_idx on public.job_events (tenant_id, job_id, at);

-- Replay protection (R7) and fixed-window rate limits (S20) live in Postgres: Vercel keeps no shared memory.
create table public.idempotency_keys (
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  key          text not null check (char_length(key) between 8 and 128),
  request_hash text not null,
  response     jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  primary key (tenant_id, key)
);
create index idempotency_keys_expiry_idx on public.idempotency_keys (expires_at);

create table public.rate_limits (
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  scope        text not null,     -- for example 'user:<uuid>:upload'
  window_start timestamptz not null,
  count        int not null default 0 check (count >= 0),
  primary key (tenant_id, scope, window_start)
);

-- ---------------------------------------------------------------------------
-- Facts and run results
-- ---------------------------------------------------------------------------
create table public.sales (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  upload_id  uuid not null,
  product_id uuid not null,
  sold_on    date not null,
  qty        numeric not null,
  stock      numeric,
  foreign key (tenant_id, upload_id) references public.uploads (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index sales_tenant_product_day_idx on public.sales (tenant_id, product_id, sold_on);

create table public.forecast_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  job_id          uuid,
  status          text not null default 'building' check (status in ('building', 'ready', 'superseded')),
  data_until      date not null,
  horizon_weeks   int not null check (horizon_weeks in (8, 12, 24)),
  granularity     text not null check (granularity in ('weekly', 'monthly')),
  params          jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, job_id) references public.jobs (tenant_id, id) on delete set null (job_id)
);
create index forecast_runs_tenant_conversation_idx on public.forecast_runs (tenant_id, conversation_id);

alter table public.conversations
  add foreign key (tenant_id, current_run_id) references public.forecast_runs (tenant_id, id);

-- forecasts / movements / demand_series: tenant-consistent references, runs and uploads
alter table public.forecasts drop constraint forecasts_job_id_fkey;
drop table public.forecast_jobs;
alter table public.forecasts add column run_id uuid;
alter table public.demand_series add column upload_id uuid;

alter table public.movements drop constraint movements_sku_id_fkey;
alter table public.movements add foreign key (tenant_id, product_id)
  references public.products (tenant_id, id) on delete cascade;
alter table public.demand_series drop constraint demand_series_sku_id_fkey;
alter table public.demand_series add foreign key (tenant_id, product_id)
  references public.products (tenant_id, id) on delete cascade;
alter table public.demand_series add foreign key (tenant_id, upload_id)
  references public.uploads (tenant_id, id) on delete set null (upload_id);
alter table public.forecasts drop constraint forecasts_sku_id_fkey;
alter table public.forecasts add foreign key (tenant_id, product_id)
  references public.products (tenant_id, id) on delete cascade;
alter table public.forecasts add foreign key (tenant_id, run_id)
  references public.forecast_runs (tenant_id, id) on delete cascade;
alter table public.forecasts add foreign key (tenant_id, job_id)
  references public.jobs (tenant_id, id) on delete set null (job_id);
create index forecasts_run_product_idx on public.forecasts (run_id, product_id);

-- One precomputed table row per product and run (what the portfolio table and the KPIs read).
create table public.run_product_metrics (
  run_id                    uuid not null,
  product_id                uuid not null,
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  abc_class                 text not null check (abc_class in ('A', 'B', 'C')),
  typical_demand_low        numeric not null,
  typical_demand_expected   numeric not null,
  typical_demand_high       numeric not null,
  current_stock             numeric not null check (current_stock >= 0),
  coverage_weeks_lower      numeric,   -- null: no stockout inside the horizon
  coverage_weeks_expected   numeric,
  coverage_weeks_upper      numeric,
  risk                      text not null check (risk in ('critical', 'medium', 'optimal')),
  stockout_date             date,
  suggested_qty_low         numeric not null check (suggested_qty_low >= 0),
  suggested_qty_high        numeric not null check (suggested_qty_high >= 0),
  suggested_truncated       boolean not null default false,
  buy_before_action         text not null check (buy_before_action in ('order_today', 'order_by_date', 'no_stockout')),
  buy_before_date           date,
  earliest_buy_date         date,
  weeks_without_stock       numeric not null default 0 check (weeks_without_stock >= 0),
  lead_time_days            int not null check (lead_time_days > 0),
  lead_time_overridden      boolean not null default false,
  target_coverage_weeks     int not null check (target_coverage_weeks >= 0),
  on_order_qty              numeric not null default 0 check (on_order_qty >= 0),
  reliability               text not null check (reliability in ('high', 'medium', 'low')),
  reliability_detail        jsonb not null default '{}',
  primary key (run_id, product_id),
  foreign key (tenant_id, run_id) references public.forecast_runs (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index run_product_metrics_run_risk_idx on public.run_product_metrics (run_id, risk);
create index run_product_metrics_run_abc_idx on public.run_product_metrics (run_id, abc_class);

create table public.product_overrides (
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  product_id            uuid not null,
  lead_time_days        int check (lead_time_days > 0),
  target_coverage_weeks int check (target_coverage_weeks >= 0),
  on_order_qty          numeric check (on_order_qty >= 0),
  updated_at            timestamptz not null default now(),
  primary key (tenant_id, product_id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Chat (append-only, plan 7c)
-- ---------------------------------------------------------------------------
create table public.messages (
  id                 uuid primary key default gen_random_uuid(),
  seq                bigint generated always as identity,
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  conversation_id    uuid not null,
  created_by         uuid references auth.users (id) on delete set null,
  role               text not null check (role in ('user', 'assistant', 'system')),
  kind               text not null default 'text' check (kind in (
    'text', 'file', 'mapping', 'clarification', 'progress', 'result', 'error')),
  blocks             jsonb not null default '[]',   -- raw model content blocks, never edited or shown
  display_text       text not null default '',      -- guarded text shown in the UI
  payload            jsonb not null default '{}',
  annotations        jsonb not null default '[]',
  status             text not null default 'complete' check (status in ('streaming', 'complete', 'interrupted', 'error')),
  context_product_id uuid,
  created_at         timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, context_product_id) references public.products (tenant_id, id) on delete set null (context_product_id)
);
create index messages_conversation_seq_idx on public.messages (tenant_id, conversation_id, seq);

create table public.message_feedback (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  message_id uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  value      text not null check (value in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  foreign key (tenant_id, message_id) references public.messages (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Audit (D25): append-only, written only by SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
create schema audit;

create table audit.log_entries (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  tenant_id      uuid,
  actor_id       uuid,
  request_id     text,
  table_name     text not null,
  op             text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  row_pk         text,
  old            jsonb,
  new            jsonb,
  changed_fields text[]
);
create index log_entries_tenant_at_idx on audit.log_entries (tenant_id, at desc);

create table audit.events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  tenant_id   uuid,
  actor_id    uuid,
  request_id  text,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}'
);
create index events_tenant_at_idx on audit.events (tenant_id, at desc);

alter table audit.log_entries enable row level security;
alter table audit.events enable row level security;
revoke all on all tables in schema audit from public;

-- Generic row-change trigger. TG_ARGV[0] lists the primary-key columns, comma separated.
create function audit.record_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  old_j   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_j   jsonb := coalesce(new_j, old_j);
  changed text[];
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into changed
    from jsonb_object_keys(new_j) as k
    where new_j -> k is distinct from old_j -> k;
  end if;

  insert into audit.log_entries
    (tenant_id, actor_id, request_id, table_name, op, row_pk, old, new, changed_fields)
  values (
    (row_j ->> 'tenant_id')::uuid,
    (select auth.uid()),
    nullif(current_setting('app.request_id', true), ''),
    tg_table_name,
    tg_op,
    (select string_agg(row_j ->> col, ':' order by ord)
       from unnest(string_to_array(tg_argv[0], ',')) with ordinality as pk(col, ord)),
    old_j,
    new_j,
    changed
  );
  return null;  -- AFTER trigger
end
$$;

create function audit.log_event(
  p_tenant_id uuid, p_action text, p_target_type text, p_target_id text, p_metadata jsonb default '{}'
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- A signed-in user may only log for their own tenant; the worker (no user) is trusted.
  if (select auth.uid()) is not null
     and p_tenant_id not in (select public.current_tenant_ids()) then
    raise exception 'tenant not allowed' using errcode = '42501';
  end if;
  insert into audit.events (tenant_id, actor_id, request_id, action, target_type, target_id, metadata)
  values (p_tenant_id, (select auth.uid()), nullif(current_setting('app.request_id', true), ''),
          p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'));
end
$$;
revoke all on function audit.record_change() from public;
revoke all on function audit.log_event(uuid, text, text, text, jsonb) from public;

create trigger conversations_audit after insert or update or delete on public.conversations
  for each row execute function audit.record_change('id');
create trigger normalization_plans_audit after insert or update or delete on public.normalization_plans
  for each row execute function audit.record_change('id');
create trigger product_overrides_audit after insert or update or delete on public.product_overrides
  for each row execute function audit.record_change('tenant_id,product_id');
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function audit.record_change('user_id');
create trigger tenant_members_audit after insert or update or delete on public.tenant_members
  for each row execute function audit.record_change('tenant_id,user_id');
create trigger allowed_emails_audit after insert or update or delete on public.allowed_emails
  for each row execute function audit.record_change('id');

-- ---------------------------------------------------------------------------
-- Signup hook (S1): second line of defence behind `shouldCreateUser: false`
-- ---------------------------------------------------------------------------
create function public.hook_restrict_signup(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.allowed_emails
    where lower(email::text) = lower(event -> 'user' ->> 'email')
  ) then
    return '{}'::jsonb;
  end if;
  -- Neutral copy: never reveal whether an address is invited.
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Signups are not allowed.'));
end
$$;
revoke execute on function public.hook_restrict_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_restrict_signup(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant what each role needs (the hosted default is "all")
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant select on public.tenants, public.tenant_members, public.products, public.movements,
  public.demand_series, public.sales, public.job_events, public.forecast_runs, public.forecasts,
  public.run_product_metrics to authenticated;
grant select, insert, update on public.conversations, public.uploads, public.normalization_plans,
  public.jobs, public.rate_limits, public.profiles to authenticated;
grant select, insert on public.idempotency_keys, public.messages to authenticated;
grant select, insert, update, delete on public.product_overrides, public.message_feedback to authenticated;

revoke execute on function public.current_tenant_ids() from public, anon;
grant execute on function public.current_tenant_ids() to authenticated;

grant usage on schema public to app_api;
grant usage on schema public, audit to app_worker;
grant usage on schema audit to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to app_worker;
grant usage, select on all sequences in schema public to app_worker;
alter default privileges in schema public grant select, insert, update, delete on tables to app_worker;
alter default privileges in schema public grant usage, select on sequences to app_worker;
grant execute on function audit.log_event(uuid, text, text, text, jsonb)
  to authenticated, service_role, app_worker;

-- ---------------------------------------------------------------------------
-- Row level security: tenant policies per verb, only for the verbs granted above
-- ---------------------------------------------------------------------------
alter table public.allowed_emails       enable row level security;  -- no policies: server only
alter table public.profiles             enable row level security;
alter table public.conversations        enable row level security;
alter table public.uploads              enable row level security;
alter table public.normalization_plans  enable row level security;
alter table public.jobs                 enable row level security;
alter table public.job_events           enable row level security;
alter table public.idempotency_keys     enable row level security;
alter table public.rate_limits          enable row level security;
alter table public.sales                enable row level security;
alter table public.forecast_runs        enable row level security;
alter table public.run_product_metrics  enable row level security;
alter table public.product_overrides    enable row level security;
alter table public.messages             enable row level security;
alter table public.message_feedback     enable row level security;

drop policy skus_tenant_select on public.products;
drop policy movements_tenant_select on public.movements;
drop policy demand_series_tenant_select on public.demand_series;
drop policy forecasts_tenant_select on public.forecasts;

do $$
declare
  t text;
  mine constant text := 'tenant_id in (select public.current_tenant_ids())';
begin
  foreach t in array array[
    'products', 'movements', 'demand_series', 'sales', 'job_events', 'forecast_runs', 'forecasts',
    'run_product_metrics', 'conversations', 'uploads', 'normalization_plans', 'jobs',
    'idempotency_keys', 'rate_limits', 'product_overrides', 'messages'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
      t || '_tenant_select', t, mine);
  end loop;

  foreach t in array array[
    'normalization_plans', 'jobs', 'idempotency_keys', 'rate_limits', 'product_overrides', 'messages'
  ] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
      t || '_tenant_insert', t, mine);
  end loop;

  foreach t in array array['conversations', 'uploads'] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s and created_by = (select auth.uid()))',
      t || '_tenant_insert', t, mine);
  end loop;

  foreach t in array array[
    'conversations', 'uploads', 'normalization_plans', 'jobs', 'rate_limits', 'product_overrides'
  ] loop
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      t || '_tenant_update', t, mine, mine);
  end loop;

  execute format('create policy product_overrides_tenant_delete on public.product_overrides '
    'for delete to authenticated using (%s)', mine);
end
$$;

-- Feedback: tenant-scoped, and only your own votes.
create policy message_feedback_own_select on public.message_feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy message_feedback_own_insert on public.message_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()) and tenant_id in (select public.current_tenant_ids()));
create policy message_feedback_own_update on public.message_feedback
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and tenant_id in (select public.current_tenant_ids()));
create policy message_feedback_own_delete on public.message_feedback
  for delete to authenticated using (user_id = (select auth.uid()));

-- Profiles are owner-only, not tenant-wide.
create policy profiles_owner_select on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_owner_insert on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects live under <tenant_id>/ (S6)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false)
  on conflict (id) do nothing;

create policy uploads_tenant_select on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and exists (
    select 1 from public.current_tenant_ids() as t (id) where t.id::text = (storage.foldername(name))[1]));
create policy uploads_tenant_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and exists (
    select 1 from public.current_tenant_ids() as t (id) where t.id::text = (storage.foldername(name))[1]));
