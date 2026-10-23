-- Parameters drawer: "Guardar" stores the new values on the run; they take effect on the next
-- recalculation. Only this column is writable by users (column-level grant), so a run's results
-- and the parameters it was computed with can never be edited through the API.
alter table public.forecast_runs add column pending_params jsonb;

grant update (pending_params) on public.forecast_runs to authenticated;

create policy forecast_runs_tenant_update on public.forecast_runs
  for update to authenticated
  using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));
