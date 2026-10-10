-- Run after supabase/schema.sql to enable one 2-day Basic or Premium trial
-- per account.

create table if not exists public.subscription_trials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_code text not null check (plan_code in ('basic', 'premium')),
  subscription_id uuid not null unique references public.subscriptions(id),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at = started_at + interval '2 days')
);

alter table public.subscription_trials enable row level security;
revoke all on public.subscription_trials from public, anon, authenticated;
grant select on public.subscription_trials to authenticated;

drop policy if exists subscription_trials_read_own_or_admin on public.subscription_trials;
create policy subscription_trials_read_own_or_admin on public.subscription_trials
  for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.start_subscription_trial(p_plan_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  plan public.subscription_plans;
  start_time timestamptz := now();
  trial_subscription_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_plan_code not in ('basic', 'premium') then raise exception 'INVALID_TRIAL_PLAN'; end if;
  select * into plan from public.subscription_plans
   where code = p_plan_code and is_active and duration_days is not null;
  if plan.id is null then raise exception 'PLAN_NOT_FOUND'; end if;
  if exists (select 1 from public.subscription_trials where user_id = uid) then
    raise exception 'TRIAL_ALREADY_USED';
  end if;
  if exists (select 1 from public.subscriptions
              where user_id = uid and status = 'active' and expires_at > now()) then
    raise exception 'ACTIVE_SUBSCRIPTION_EXISTS';
  end if;
  if exists (select 1 from public.subscriptions where user_id = uid and status = 'pending') then
    raise exception 'PENDING_SUBSCRIPTION_EXISTS';
  end if;

  insert into public.subscriptions
    (user_id, plan_id, status, starts_at, expires_at, payment_method, payment_reference)
  values
    (uid, plan.id, 'active', start_time, start_time + interval '2 days',
     'trial', 'One-time 2-day free trial')
  returning id into trial_subscription_id;

  insert into public.subscription_trials
    (user_id, plan_code, subscription_id, started_at, expires_at)
  values (uid, p_plan_code, trial_subscription_id, start_time, start_time + interval '2 days');
  return trial_subscription_id;
end $$;

revoke all on function public.start_subscription_trial(text) from public, anon;
grant execute on function public.start_subscription_trial(text) to authenticated;
