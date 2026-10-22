-- 4castly.ai initial schema: multi-tenant inventory movements, demand series, forecasts and a job queue.
-- Every domain table carries tenant_id and has RLS enabled. Workers/API use the service role (bypasses RLS).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);

-- Tenants the current user belongs to. SECURITY DEFINER so policies on tenant_members do not recurse.
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.tenant_members where user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Catalog and facts
-- ---------------------------------------------------------------------------
create table public.skus (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  code        text not null,
  name        text not null,
  uom         text not null default '',
  created_at  timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.movements (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  sku_id         uuid not null references public.skus (id) on delete cascade,
  occurred_at    timestamptz not null,
  movement_code  text not null default '',   -- '01' sale, '02' import, '05' customer return, '11' transfer, '99' adjustment
  movement_type  text not null default '',
  document       text not null default '',
  counterparty   text not null default '',
  qty_in         numeric not null default 0 check (qty_in >= 0),
  qty_out        numeric not null default 0 check (qty_out >= 0),
  balance        numeric,
  source_file    text,
  created_at     timestamptz not null default now()
);
create index movements_tenant_sku_time_idx on public.movements (tenant_id, sku_id, occurred_at);

-- Cleaned, zero-filled demand per period. Stockout periods are censored (demand is a lower bound).
create table public.demand_series (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sku_id      uuid not null references public.skus (id) on delete cascade,
  freq        text not null check (freq in ('daily', 'weekly')),
  period      date not null,
  demand      numeric not null default 0,
  censored    boolean not null default false,
  primary key (tenant_id, sku_id, freq, period)
);

-- ---------------------------------------------------------------------------
-- Forecasting
-- ---------------------------------------------------------------------------
create table public.forecast_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  sku_id        uuid references public.skus (id) on delete cascade,  -- null = all SKUs
  model         text not null default 'statsforecast-seasonal-naive',
  freq          text not null default 'weekly' check (freq in ('daily', 'weekly')),
  horizon       int  not null default 12 check (horizon > 0),
  status        text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  error         text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index forecast_jobs_tenant_status_idx on public.forecast_jobs (tenant_id, status);

create table public.forecasts (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sku_id      uuid not null references public.skus (id) on delete cascade,
  job_id      uuid references public.forecast_jobs (id) on delete set null,
  horizon     date not null,               -- the forecasted period
  p10         numeric not null,
  p50         numeric not null,
  p90         numeric not null,
  model       text not null,
  created_at  timestamptz not null default now(),
  check (p10 <= p50 and p50 <= p90)
);
create index forecasts_tenant_sku_horizon_idx on public.forecasts (tenant_id, sku_id, horizon);

-- ---------------------------------------------------------------------------
-- Row level security (PLACEHOLDER policies: members read their tenant; writes go through the service role)
-- ---------------------------------------------------------------------------
alter table public.tenants        enable row level security;
alter table public.tenant_members enable row level security;
alter table public.skus           enable row level security;
alter table public.movements      enable row level security;
alter table public.demand_series  enable row level security;
alter table public.forecast_jobs  enable row level security;
alter table public.forecasts      enable row level security;

create policy tenants_member_select on public.tenants
  for select to authenticated using (id in (select public.current_tenant_ids()));

create policy tenant_members_self_select on public.tenant_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy skus_tenant_select on public.skus
  for select to authenticated using (tenant_id in (select public.current_tenant_ids()));

create policy movements_tenant_select on public.movements
  for select to authenticated using (tenant_id in (select public.current_tenant_ids()));

create policy demand_series_tenant_select on public.demand_series
  for select to authenticated using (tenant_id in (select public.current_tenant_ids()));

create policy forecast_jobs_tenant_select on public.forecast_jobs
  for select to authenticated using (tenant_id in (select public.current_tenant_ids()));

create policy forecasts_tenant_select on public.forecasts
  for select to authenticated using (tenant_id in (select public.current_tenant_ids()));

-- TODO: add insert/update/delete policies per role (e.g. owners/admins may create forecast_jobs).

-- ---------------------------------------------------------------------------
-- Queue (pgmq): API enqueues, worker dequeues
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgmq') then
    create extension if not exists pgmq;
    perform pgmq.create('forecast_jobs');
  else
    raise notice 'pgmq extension not available; enable it in the Supabase dashboard and run select pgmq.create(''forecast_jobs'')';
  end if;
end
$$;
