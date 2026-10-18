-- Run this migration in Supabase before enabling account-linked Campus Doodle Coins.
create table if not exists public.campus_doodle_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.campus_doodle_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  idempotency_key text not null,
  source text not null,
  match_id text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists campus_doodle_coin_ledger_user_created_idx
  on public.campus_doodle_coin_ledger (user_id, created_at desc);

alter table public.campus_doodle_accounts enable row level security;
alter table public.campus_doodle_coin_ledger enable row level security;
revoke all on public.campus_doodle_accounts, public.campus_doodle_coin_ledger
  from public, anon, authenticated;

create or replace function public.campus_doodle_get_coins(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare balance integer;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  insert into public.campus_doodle_accounts (user_id)
    values (p_user_id) on conflict (user_id) do nothing;
  select coins into balance from public.campus_doodle_accounts where user_id = p_user_id;
  return balance;
end $$;

create or replace function public.campus_doodle_change_coins(
  p_user_id uuid, p_delta integer, p_idempotency_key text, p_source text
) returns integer
language plpgsql security definer set search_path = public as $$
declare balance integer;
begin
  if p_user_id is null or p_delta is null or p_delta = 0
     or char_length(coalesce(p_idempotency_key, '')) not between 1 and 200
     or char_length(coalesce(p_source, '')) not between 1 and 60 then
    raise exception 'INVALID_COIN_CHANGE';
  end if;
  insert into public.campus_doodle_accounts (user_id)
    values (p_user_id) on conflict (user_id) do nothing;
  select coins into balance from public.campus_doodle_accounts
    where user_id = p_user_id for update;
  if exists (
    select 1 from public.campus_doodle_coin_ledger
    where user_id = p_user_id and idempotency_key = p_idempotency_key
  ) then
    return balance;
  end if;
  if balance + p_delta < 0 then raise exception 'INSUFFICIENT_COINS'; end if;
  update public.campus_doodle_accounts
    set coins = coins + p_delta, updated_at = now()
    where user_id = p_user_id returning coins into balance;
  insert into public.campus_doodle_coin_ledger (user_id, delta, idempotency_key, source)
    values (p_user_id, p_delta, p_idempotency_key, p_source);
  return balance;
end $$;

create or replace function public.campus_doodle_award_match(
  p_match_id text, p_awards jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare award jsonb; uid uuid; amount integer; balance integer; balances jsonb := '{}'::jsonb;
begin
  if p_match_id is null or char_length(p_match_id) not between 1 and 100
     or jsonb_typeof(p_awards) <> 'array' or jsonb_array_length(p_awards) > 8 then
    raise exception 'INVALID_MATCH_REWARD';
  end if;
  for award in
    select value from jsonb_array_elements(p_awards)
    order by value->>'user_id'
  loop
    begin
      uid := (award->>'user_id')::uuid;
      amount := (award->>'coins')::integer;
    exception when others then
      raise exception 'INVALID_MATCH_REWARD';
    end;
    if amount < 1 or amount > 10000 then raise exception 'INVALID_MATCH_REWARD'; end if;
    insert into public.campus_doodle_accounts (user_id)
      values (uid) on conflict (user_id) do nothing;
    select coins into balance from public.campus_doodle_accounts
      where user_id = uid for update;
    if not exists (
      select 1 from public.campus_doodle_coin_ledger
      where user_id = uid and idempotency_key = 'match:' || p_match_id
    ) then
      update public.campus_doodle_accounts
        set coins = coins + amount, updated_at = now()
        where user_id = uid returning coins into balance;
      insert into public.campus_doodle_coin_ledger
        (user_id, delta, idempotency_key, source, match_id)
        values (uid, amount, 'match:' || p_match_id, 'match_reward', p_match_id);
    end if;
    balances := balances || jsonb_build_object(uid::text, balance);
  end loop;
  return balances;
end $$;

revoke all on function public.campus_doodle_get_coins(uuid) from public, anon, authenticated;
revoke all on function public.campus_doodle_change_coins(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.campus_doodle_award_match(text, jsonb) from public, anon, authenticated;
grant execute on function public.campus_doodle_get_coins(uuid) to service_role;
grant execute on function public.campus_doodle_change_coins(uuid, integer, text, text) to service_role;
grant execute on function public.campus_doodle_award_match(text, jsonb) to service_role;
