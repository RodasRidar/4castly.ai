-- Security hardening found by the D5 audit (2026-10-27).
--
-- 1. rate_limits was writable by any tenant member through PostgREST, so a member could reset the
--    tenant's daily token budget or inflate a colleague's counters. The counters now move only
--    through the two functions below, which the API (and only the API) calls.
-- 2. audit.log_event let a signed-in user log without a tenant (NULL slipped past `not in`) and
--    with unbounded metadata.
-- 3. uploads.storage_path and idempotency_keys had no server-side limits.

-- ---------------------------------------------------------------------------
-- 1. Counters
-- ---------------------------------------------------------------------------
drop policy rate_limits_tenant_insert on public.rate_limits;
drop policy rate_limits_tenant_update on public.rate_limits;
revoke insert, update on public.rate_limits from authenticated;

-- `session_user` is the login role even after `set local role authenticated`: the API connects as
-- app_api, PostgREST as authenticator, so only the API passes this check.
create function public.rate_limit_hit(p_action text, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_count integer;
begin
  if session_user <> 'app_api' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select t into v_tenant from public.current_tenant_ids() t limit 1;
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z_]{1,32}$' or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  insert into public.rate_limits (tenant_id, scope, window_start, count)
  values (
    v_tenant,
    'user:' || (select auth.uid())::text || ':' || p_action,
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds),
    1
  )
  on conflict (tenant_id, scope, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count;
end
$$;

-- Adds tokens to the tenant's counter of the current UTC day. It only ever increases it.
create function public.spend_tokens(p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  if session_user <> 'app_api' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select t into v_tenant from public.current_tenant_ids() t limit 1;
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if p_amount not between 1 and 1000000 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  insert into public.rate_limits (tenant_id, scope, window_start, count)
  values (
    v_tenant, 'tenant:tokens',
    to_timestamp(floor(extract(epoch from now()) / 86400) * 86400), p_amount
  )
  on conflict (tenant_id, scope, window_start)
  do update set count = public.rate_limits.count + p_amount;
end
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon;
revoke all on function public.spend_tokens(integer) from public, anon;
grant execute on function public.rate_limit_hit(text, integer) to authenticated;
grant execute on function public.spend_tokens(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit log guard
-- ---------------------------------------------------------------------------
create or replace function audit.log_event(
  p_tenant_id uuid, p_action text, p_target_type text, p_target_id text, p_metadata jsonb default '{}'
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- A signed-in user may only log for their own tenant; the worker (no user) is trusted.
  if (select auth.uid()) is not null then
    if p_tenant_id is null or p_tenant_id not in (select public.current_tenant_ids()) then
      raise exception 'tenant not allowed' using errcode = '42501';
    end if;
    if pg_column_size(p_metadata) > 8192 then
      raise exception 'metadata too large' using errcode = '22023';
    end if;
  end if;
  insert into audit.events (tenant_id, actor_id, request_id, action, target_type, target_id, metadata)
  values (p_tenant_id, (select auth.uid()), nullif(current_setting('app.request_id', true), ''),
          p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'));
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Server-side limits on user-writable columns
-- ---------------------------------------------------------------------------
alter table public.uploads
  add constraint uploads_storage_path_check
  check (storage_path like tenant_id::text || '/' || id::text || '/%');

alter table public.idempotency_keys
  add constraint idempotency_keys_ttl_check
  check (expires_at <= created_at + interval '25 hours'),
  add constraint idempotency_keys_response_size_check
  check (response is null or pg_column_size(response) <= 16384);
