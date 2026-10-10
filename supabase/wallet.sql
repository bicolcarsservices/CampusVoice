-- Run after supabase/schema.sql to enable manual Maya wallet funding,
-- withdrawal requests, and game-time balance charging.

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_centavos bigint not null default 0 check (balance_centavos >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('credit', 'debit')),
  kind text not null check (kind in ('topup', 'withdrawal', 'withdrawal_return', 'game_charge', 'admin_adjustment')),
  amount_centavos bigint not null check (amount_centavos > 0),
  balance_after_centavos bigint not null check (balance_after_centavos >= 0),
  reference_id text,
  game_key text,
  period_number integer,
  note text,
  created_at timestamptz not null default now(),
  check (
    (kind = 'game_charge' and game_key is not null and reference_id is not null and period_number is not null)
    or kind <> 'game_charge'
  )
);

create unique index if not exists wallet_game_period_once
  on public.wallet_transactions (user_id, game_key, reference_id, period_number)
  where kind = 'game_charge';
create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

create table if not exists public.wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_centavos bigint not null check (amount_centavos between 100 and 10000000),
  payment_reference text check (char_length(payment_reference) <= 120),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.wallet_topup_requests
  add column if not exists received_centavos bigint not null default 0 check (received_centavos >= 0),
  add column if not exists fee_centavos bigint not null default 0 check (fee_centavos >= 0),
  add column if not exists credited_centavos bigint not null default 0 check (credited_centavos >= 0);

update public.wallet_topup_requests
   set received_centavos = amount_centavos
 where status = 'approved' and received_centavos = 0;
update public.wallet_topup_requests
   set credited_centavos = amount_centavos
 where status = 'approved' and credited_centavos = 0;

create table if not exists public.wallet_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_centavos bigint not null check (amount_centavos between 100 and 10000000),
  payout_method text not null check (payout_method in ('Maya', 'GCash', 'Bank')),
  account_name text not null check (char_length(account_name) between 2 and 100),
  account_number text not null check (char_length(account_number) between 4 and 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id),
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists wallet_topups_status_created_idx
  on public.wallet_topup_requests (status, created_at desc);
create index if not exists wallet_withdrawals_status_created_idx
  on public.wallet_withdrawal_requests (status, created_at desc);

create table if not exists public.wallet_game_rates (
  game_key text primary key check (game_key ~ '^[a-z0-9][a-z0-9_-]{1,59}$'),
  game_name text not null check (char_length(game_name) between 1 and 80),
  price_centavos bigint not null check (price_centavos between 1 and 1000000),
  period_minutes integer not null check (period_minutes between 1 and 1440),
  is_active boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_game_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  dias bigint not null default 0 check (dias >= 0),
  owned_skins text[] not null default array['orb']::text[],
  equipped_skin text not null default 'orb',
  updated_at timestamptz not null default now(),
  check (equipped_skin = any(owned_skins))
);

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_kind_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check
  check (kind in ('topup', 'withdrawal', 'withdrawal_return', 'game_charge',
                  'admin_adjustment', 'dias_purchase'));

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_topup_requests enable row level security;
alter table public.wallet_withdrawal_requests enable row level security;
alter table public.wallet_game_rates enable row level security;
alter table public.wallet_game_accounts enable row level security;

revoke all on public.wallets, public.wallet_transactions, public.wallet_topup_requests,
  public.wallet_withdrawal_requests, public.wallet_game_rates, public.wallet_game_accounts
  from public, anon, authenticated;
grant select on public.wallets, public.wallet_transactions, public.wallet_topup_requests,
  public.wallet_withdrawal_requests, public.wallet_game_accounts to authenticated;
grant select on public.wallet_game_rates to authenticated;

drop policy if exists wallet_read_own_or_admin on public.wallets;
create policy wallet_read_own_or_admin on public.wallets for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists wallet_transactions_read_own_or_admin on public.wallet_transactions;
create policy wallet_transactions_read_own_or_admin on public.wallet_transactions for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists wallet_topups_read_own_or_admin on public.wallet_topup_requests;
create policy wallet_topups_read_own_or_admin on public.wallet_topup_requests for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists wallet_withdrawals_read_own_or_admin on public.wallet_withdrawal_requests;
create policy wallet_withdrawals_read_own_or_admin on public.wallet_withdrawal_requests for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists wallet_game_rates_read_active on public.wallet_game_rates;
create policy wallet_game_rates_read_active on public.wallet_game_rates for select
  using (is_active or public.is_admin());
drop policy if exists wallet_game_accounts_read_own on public.wallet_game_accounts;
create policy wallet_game_accounts_read_own on public.wallet_game_accounts for select
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.my_wallet_balance() returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); amount bigint;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.wallets (user_id) values (uid) on conflict (user_id) do nothing;
  select balance_centavos into amount from public.wallets where user_id = uid;
  return amount;
end $$;

create or replace function public.purchase_game_dias(p_package_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  price bigint;
  dias_amount bigint;
  wallet_balance bigint;
  game_dias bigint;
  purchase_id uuid := gen_random_uuid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  case p_package_id
    when 'p1' then price := 4900; dias_amount := 50;
    when 'p2' then price := 9900; dias_amount := 120;
    when 'p3' then price := 19900; dias_amount := 300;
    when 'p4' then price := 39900; dias_amount := 700;
    else raise exception 'INVALID_DIAS_PACKAGE';
  end case;

  insert into public.wallets (user_id) values (uid) on conflict (user_id) do nothing;
  insert into public.wallet_game_accounts (user_id) values (uid) on conflict (user_id) do nothing;
  select balance_centavos into wallet_balance
    from public.wallets where user_id = uid for update;
  if wallet_balance < price then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.wallets
     set balance_centavos = balance_centavos - price, updated_at = now()
   where user_id = uid returning balance_centavos into wallet_balance;

  update public.wallet_game_accounts
     set dias = dias + dias_amount, updated_at = now()
   where user_id = uid returning dias into game_dias;
  insert into public.wallet_transactions
    (user_id, direction, kind, amount_centavos, balance_after_centavos,
     reference_id, game_key, note)
  values (uid, 'debit', 'dias_purchase', price, wallet_balance,
          purchase_id::text, 'campus-coin-rush', dias_amount || ' Dias (' || p_package_id || ')');

  return jsonb_build_object('wallet_balance_centavos', wallet_balance, 'dias', game_dias);
end $$;

create or replace function public.purchase_game_skin(p_skin_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  skin_cost bigint;
  skin_name text;
  current_dias bigint;
  skin_list text[];
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  case p_skin_id
    when 'star' then skin_cost := 30; skin_name := 'Gold Star';
    when 'rocket' then skin_cost := 45; skin_name := 'Neon Rocket';
    when 'gem' then skin_cost := 60; skin_name := 'Crystal Gem';
    when 'flame' then skin_cost := 80; skin_name := 'Flame Hex';
    when 'galaxy' then skin_cost := 120; skin_name := 'Galaxy Nova';
    else raise exception 'INVALID_GAME_SKIN';
  end case;

  insert into public.wallet_game_accounts (user_id) values (uid) on conflict (user_id) do nothing;
  select dias, owned_skins into current_dias, skin_list
    from public.wallet_game_accounts where user_id = uid for update;
  if p_skin_id = any(skin_list) then raise exception 'SKIN_ALREADY_OWNED'; end if;
  if current_dias < skin_cost then raise exception 'INSUFFICIENT_DIAS'; end if;
  update public.wallet_game_accounts
     set dias = dias - skin_cost,
         owned_skins = array_append(owned_skins, p_skin_id),
         equipped_skin = p_skin_id,
         updated_at = now()
   where user_id = uid returning dias, owned_skins into current_dias, skin_list;
  return jsonb_build_object('dias', current_dias, 'owned_skins', skin_list,
                            'equipped_skin', p_skin_id, 'skin_name', skin_name);
end $$;

create or replace function public.equip_game_skin(p_skin_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.wallet_game_accounts
     set equipped_skin = p_skin_id, updated_at = now()
   where user_id = auth.uid() and p_skin_id = any(owned_skins);
  if not found then raise exception 'SKIN_NOT_OWNED'; end if;
end $$;

create or replace function public.request_wallet_topup(
  p_amount_centavos bigint, p_payment_reference text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); request_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_amount_centavos not between 100 and 10000000 then raise exception 'INVALID_AMOUNT'; end if;
  if char_length(coalesce(p_payment_reference, '')) > 120 then raise exception 'INVALID_REFERENCE'; end if;

  insert into public.wallet_topup_requests (user_id, amount_centavos, payment_reference)
  values (uid, p_amount_centavos, nullif(trim(p_payment_reference), ''))
  returning id into request_id;
  return request_id;
end $$;

drop function if exists public.admin_review_wallet_topup(uuid, boolean, text);
drop function if exists public.admin_review_wallet_topup(uuid, boolean, text, bigint);
create or replace function public.admin_review_wallet_topup(
  p_request uuid, p_approve boolean, p_reason text default null,
  p_received_centavos bigint default null, p_fee_centavos bigint default 0
) returns void
language plpgsql security definer set search_path = public as $$
declare topup public.wallet_topup_requests; new_balance bigint; net_credit bigint;
  received bigint; fee bigint;
begin
  perform public.assert_admin();
  if p_approve is null then raise exception 'INVALID_DECISION'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'INVALID_NOTE'; end if;
  select * into topup from public.wallet_topup_requests where id = p_request for update;
  if topup.id is null or topup.status <> 'pending' then raise exception 'TOPUP_NOT_PENDING'; end if;

  if p_approve then
    received := coalesce(p_received_centavos, topup.amount_centavos);
    fee := coalesce(p_fee_centavos, 0);
    if received not between 100 and 10000000 then raise exception 'INVALID_TOPUP_AMOUNT_RECEIVED'; end if;
    if fee < 0 or fee > received - 100 then raise exception 'INVALID_TOPUP_FEE'; end if;
    if fee > 0 and nullif(trim(p_reason), '') is null then raise exception 'INVALID_FEE_NOTE'; end if;
    net_credit := received - fee;
    insert into public.wallets (user_id) values (topup.user_id) on conflict (user_id) do nothing;
    update public.wallets
       set balance_centavos = balance_centavos + net_credit, updated_at = now()
     where user_id = topup.user_id
     returning balance_centavos into new_balance;
    insert into public.wallet_transactions
      (user_id, direction, kind, amount_centavos, balance_after_centavos, reference_id, note)
    values
      (topup.user_id, 'credit', 'topup', net_credit, new_balance, topup.id::text,
       concat_ws(' · ', nullif(trim(p_reason), ''), 'Received ' || (received / 100.0)::text,
                 'deduction ' || (fee / 100.0)::text));
  else
    received := 0;
    fee := 0;
    net_credit := 0;
  end if;

  update public.wallet_topup_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         received_centavos = received,
         fee_centavos = fee,
         credited_centavos = net_credit,
         reviewed_by = auth.uid(), review_note = nullif(trim(p_reason), ''), reviewed_at = now()
   where id = topup.id;
  perform public.admin_log(
    case when p_approve then 'approve_wallet_topup' else 'reject_wallet_topup' end,
    'wallet_topup', topup.id::text, p_reason,
    jsonb_build_object('user_id', topup.user_id, 'requested_centavos', topup.amount_centavos,
                       'received_centavos', received,
                       'fee_centavos', fee, 'credited_centavos', net_credit)
  );
end $$;

create or replace function public.request_wallet_withdrawal(
  p_amount_centavos bigint, p_payout_method text, p_account_name text, p_account_number text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); current_balance bigint; request_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_amount_centavos not between 100 and 10000000 then raise exception 'INVALID_AMOUNT'; end if;
  if p_payout_method not in ('Maya', 'GCash', 'Bank') then raise exception 'INVALID_PAYOUT_METHOD'; end if;
  if char_length(trim(coalesce(p_account_name, ''))) not between 2 and 100
     or char_length(trim(coalesce(p_account_number, ''))) not between 4 and 100 then
    raise exception 'INVALID_PAYOUT_DETAILS';
  end if;

  insert into public.wallets (user_id) values (uid) on conflict (user_id) do nothing;
  select balance_centavos into current_balance from public.wallets where user_id = uid for update;
  if current_balance < p_amount_centavos then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets
     set balance_centavos = balance_centavos - p_amount_centavos, updated_at = now()
   where user_id = uid
   returning balance_centavos into current_balance;
  insert into public.wallet_withdrawal_requests
    (user_id, amount_centavos, payout_method, account_name, account_number)
  values (uid, p_amount_centavos, p_payout_method, trim(p_account_name), trim(p_account_number))
  returning id into request_id;
  insert into public.wallet_transactions
    (user_id, direction, kind, amount_centavos, balance_after_centavos, reference_id, note)
  values (uid, 'debit', 'withdrawal', p_amount_centavos, current_balance, request_id::text, 'Withdrawal request');
  return request_id;
end $$;

create or replace function public.cancel_my_wallet_withdrawal(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare withdrawal public.wallet_withdrawal_requests; new_balance bigint;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into withdrawal from public.wallet_withdrawal_requests
   where id = p_request and user_id = auth.uid() for update;
  if withdrawal.id is null or withdrawal.status <> 'pending' then raise exception 'WITHDRAWAL_NOT_CANCELLABLE'; end if;

  update public.wallet_withdrawal_requests set status = 'cancelled', reviewed_at = now()
   where id = withdrawal.id;
  update public.wallets set balance_centavos = balance_centavos + withdrawal.amount_centavos, updated_at = now()
   where user_id = auth.uid()
   returning balance_centavos into new_balance;
  insert into public.wallet_transactions
    (user_id, direction, kind, amount_centavos, balance_after_centavos, reference_id, note)
  values (auth.uid(), 'credit', 'withdrawal_return', withdrawal.amount_centavos,
          new_balance, withdrawal.id::text, 'Withdrawal request cancelled');
end $$;

create or replace function public.admin_review_wallet_withdrawal(
  p_request uuid, p_decision text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare withdrawal public.wallet_withdrawal_requests; new_balance bigint;
begin
  perform public.assert_admin();
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'INVALID_NOTE'; end if;
  if p_decision not in ('approve', 'reject', 'paid') then raise exception 'INVALID_DECISION'; end if;
  select * into withdrawal from public.wallet_withdrawal_requests where id = p_request for update;
  if withdrawal.id is null then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;

  if p_decision = 'approve' and withdrawal.status = 'pending' then
    update public.wallet_withdrawal_requests
       set status = 'approved', reviewed_by = auth.uid(),
           review_note = nullif(trim(p_reason), ''), reviewed_at = now()
     where id = withdrawal.id;
  elsif p_decision = 'paid' and withdrawal.status = 'approved' then
    update public.wallet_withdrawal_requests
       set status = 'paid', reviewed_by = auth.uid(),
           review_note = nullif(trim(p_reason), ''), reviewed_at = now()
     where id = withdrawal.id;
  elsif p_decision = 'reject' and withdrawal.status = 'pending' then
    update public.wallet_withdrawal_requests
       set status = 'rejected', reviewed_by = auth.uid(),
           review_note = nullif(trim(p_reason), ''), reviewed_at = now()
     where id = withdrawal.id;
    update public.wallets
       set balance_centavos = balance_centavos + withdrawal.amount_centavos, updated_at = now()
     where user_id = withdrawal.user_id
     returning balance_centavos into new_balance;
    insert into public.wallet_transactions
      (user_id, direction, kind, amount_centavos, balance_after_centavos, reference_id, note)
    values (withdrawal.user_id, 'credit', 'withdrawal_return', withdrawal.amount_centavos,
            new_balance, withdrawal.id::text, coalesce(nullif(trim(p_reason), ''), 'Withdrawal request rejected'));
  else
    raise exception 'INVALID_WITHDRAWAL_TRANSITION';
  end if;

  perform public.admin_log(
    case when p_decision = 'paid' then 'pay_wallet_withdrawal'
         when p_decision = 'approve' then 'approve_wallet_withdrawal'
         else 'reject_wallet_withdrawal' end,
    'wallet_withdrawal', withdrawal.id::text, p_reason,
    jsonb_build_object('user_id', withdrawal.user_id, 'amount_centavos', withdrawal.amount_centavos)
  );
end $$;

create or replace function public.admin_set_wallet_game_rate(
  p_game_key text, p_game_name text, p_price_centavos bigint,
  p_period_minutes integer, p_is_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_game_key !~ '^[a-z0-9][a-z0-9_-]{1,59}$'
     or char_length(trim(coalesce(p_game_name, ''))) not between 1 and 80
     or p_price_centavos not between 1 and 1000000
     or p_period_minutes not between 1 and 1440 then
    raise exception 'INVALID_GAME_RATE';
  end if;
  insert into public.wallet_game_rates
    (game_key, game_name, price_centavos, period_minutes, is_active, updated_by, updated_at)
  values
    (p_game_key, trim(p_game_name), p_price_centavos, p_period_minutes, p_is_active, auth.uid(), now())
  on conflict (game_key) do update
    set game_name = excluded.game_name,
        price_centavos = excluded.price_centavos,
        period_minutes = excluded.period_minutes,
        is_active = excluded.is_active,
        updated_by = excluded.updated_by,
        updated_at = now();
  perform public.admin_log('set_wallet_game_rate', 'wallet_game_rate', p_game_key, null,
    jsonb_build_object('game_name', p_game_name, 'price_centavos', p_price_centavos,
                       'period_minutes', p_period_minutes, 'is_active', p_is_active));
end $$;

create or replace function public.charge_game_period(
  p_user uuid, p_game_key text, p_session_id uuid, p_period_number integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rate public.wallet_game_rates; existing public.wallet_transactions; new_balance bigint;
begin
  if auth.uid() is distinct from p_user and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  if p_session_id is null or p_period_number is null or p_period_number < 1 then raise exception 'INVALID_PERIOD'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;

  select * into rate from public.wallet_game_rates
   where game_key = p_game_key and is_active for share;
  if rate.game_key is null then raise exception 'GAME_RATE_NOT_FOUND'; end if;

  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance_centavos into new_balance from public.wallets where user_id = p_user for update;
  select * into existing from public.wallet_transactions
   where user_id = p_user and kind = 'game_charge'
     and game_key = p_game_key and reference_id = p_session_id::text
     and period_number = p_period_number;
  if existing.id is not null then
    return jsonb_build_object('charged', false, 'amount_centavos', existing.amount_centavos,
                              'balance_centavos', existing.balance_after_centavos);
  end if;

  update public.wallets
     set balance_centavos = balance_centavos - rate.price_centavos, updated_at = now()
   where user_id = p_user and balance_centavos >= rate.price_centavos
   returning balance_centavos into new_balance;
  if new_balance is null then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into public.wallet_transactions
    (user_id, direction, kind, amount_centavos, balance_after_centavos,
     reference_id, game_key, period_number, note)
  values (p_user, 'debit', 'game_charge', rate.price_centavos, new_balance,
          p_session_id::text, p_game_key, p_period_number,
          rate.game_name || ' · ' || rate.period_minutes || ' minutes');
  return jsonb_build_object('charged', true, 'amount_centavos', rate.price_centavos,
                            'balance_centavos', new_balance);
end $$;

revoke all on function public.my_wallet_balance() from public, anon;
revoke all on function public.purchase_game_dias(text) from public, anon;
revoke all on function public.purchase_game_skin(text) from public, anon;
revoke all on function public.equip_game_skin(text) from public, anon;
revoke all on function public.request_wallet_topup(bigint, text) from public, anon;
revoke all on function public.admin_review_wallet_topup(uuid, boolean, text, bigint, bigint) from public, anon;
revoke all on function public.request_wallet_withdrawal(bigint, text, text, text) from public, anon;
revoke all on function public.cancel_my_wallet_withdrawal(uuid) from public, anon;
revoke all on function public.admin_review_wallet_withdrawal(uuid, text, text) from public, anon;
revoke all on function public.admin_set_wallet_game_rate(text, text, bigint, integer, boolean) from public, anon;
revoke all on function public.charge_game_period(uuid, text, uuid, integer) from public, anon;
grant execute on function public.my_wallet_balance(),
  public.purchase_game_dias(text),
  public.purchase_game_skin(text),
  public.equip_game_skin(text),
  public.request_wallet_topup(bigint, text),
  public.request_wallet_withdrawal(bigint, text, text, text),
  public.cancel_my_wallet_withdrawal(uuid),
  public.charge_game_period(uuid, text, uuid, integer)
  to authenticated;
grant execute on function public.admin_review_wallet_topup(uuid, boolean, text, bigint, bigint),
  public.admin_review_wallet_withdrawal(uuid, text, text),
  public.admin_set_wallet_game_rate(text, text, bigint, integer, boolean)
  to authenticated;
grant execute on function public.charge_game_period(uuid, text, uuid, integer) to service_role;
