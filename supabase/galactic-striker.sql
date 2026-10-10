-- Run after supabase/schema.sql and supabase/wallet.sql to enable
-- subscription-gated Galactic Striker crystal conversions and payouts.

create table if not exists public.galactic_earnings_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_centavos bigint not null default 0 check (balance_centavos >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.galactic_conversion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id),
  plan_code text not null check (plan_code in ('basic', 'premium')),
  crystals integer not null check (crystals in (25000, 60000)),
  amount_centavos bigint not null check (amount_centavos in (2500, 5000, 6000)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.galactic_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_centavos bigint not null check (amount_centavos between 100 and 10000000),
  vat_centavos bigint not null check (vat_centavos >= 0),
  payout_centavos bigint not null check (payout_centavos > 0),
  payout_method text not null check (payout_method in ('GCash', 'Maya')),
  account_name text not null check (char_length(account_name) between 2 and 100),
  account_email text not null check (char_length(account_email) between 3 and 254),
  account_number text not null check (char_length(account_number) between 4 and 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  reviewed_by uuid references auth.users(id),
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (amount_centavos = vat_centavos + payout_centavos)
);

create table if not exists public.galactic_game_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null check (item_id in (
    'nova', 'comet', 'titan', 'aegis', 'spectre',
    'laser', 'rapid', 'spread', 'cannon', 'missile', 'plasma',
    'cy', 'mg', 'lm', 'gd', 'sk0', 'sk1', 'sk2', 'sk3', 'fx0', 'fx1', 'fx2'
  )),
  item_type text not null check (item_type in ('ch', 'wp', 'col', 'skin', 'fx')),
  upgrade_level integer not null default 0 check (upgrade_level between 0 and 5),
  equipped boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id),
  check (item_type = 'wp' or upgrade_level = 0)
);

create index if not exists galactic_conversion_status_created_idx
  on public.galactic_conversion_requests (status, created_at desc);
create index if not exists galactic_conversion_user_created_idx
  on public.galactic_conversion_requests (user_id, created_at desc);
create unique index if not exists galactic_conversion_one_pending_per_user
  on public.galactic_conversion_requests (user_id)
  where status = 'pending';
create index if not exists galactic_withdrawal_status_created_idx
  on public.galactic_withdrawal_requests (status, created_at desc);
create index if not exists galactic_withdrawal_user_created_idx
  on public.galactic_withdrawal_requests (user_id, created_at desc);
create unique index if not exists galactic_game_one_equipped_per_type
  on public.galactic_game_inventory (user_id, item_type)
  where equipped;
create index if not exists galactic_game_inventory_user_type_idx
  on public.galactic_game_inventory (user_id, item_type);

alter table public.galactic_earnings_wallets enable row level security;
alter table public.galactic_conversion_requests enable row level security;
alter table public.galactic_withdrawal_requests enable row level security;
alter table public.galactic_game_inventory enable row level security;

revoke all on public.galactic_earnings_wallets, public.galactic_conversion_requests,
  public.galactic_withdrawal_requests, public.galactic_game_inventory from public, anon, authenticated;
grant select on public.galactic_earnings_wallets, public.galactic_conversion_requests,
  public.galactic_withdrawal_requests, public.galactic_game_inventory to authenticated;

drop policy if exists galactic_earnings_read_own_or_admin on public.galactic_earnings_wallets;
create policy galactic_earnings_read_own_or_admin on public.galactic_earnings_wallets
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists galactic_conversions_read_own_or_admin on public.galactic_conversion_requests;
create policy galactic_conversions_read_own_or_admin on public.galactic_conversion_requests
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists galactic_withdrawals_read_own_or_admin on public.galactic_withdrawal_requests;
create policy galactic_withdrawals_read_own_or_admin on public.galactic_withdrawal_requests
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists galactic_inventory_read_own_or_admin on public.galactic_game_inventory;
create policy galactic_inventory_read_own_or_admin on public.galactic_game_inventory
  for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.my_galactic_game_inventory() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  balance bigint;
  items jsonb;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  insert into public.wallet_game_accounts (user_id) values (uid) on conflict (user_id) do nothing;
  insert into public.galactic_game_inventory (user_id, item_id, item_type, equipped)
  values (uid, 'nova', 'ch', true), (uid, 'laser', 'wp', true),
         (uid, 'cy', 'col', true), (uid, 'sk0', 'skin', true),
         (uid, 'fx0', 'fx', true)
  on conflict (user_id, item_id) do nothing;
  select dias into balance from public.wallet_game_accounts where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', item_id, 'item_type', item_type,
    'upgrade_level', upgrade_level, 'equipped', equipped
  ) order by item_type, item_id), '[]'::jsonb)
    into items from public.galactic_game_inventory where user_id = uid;
  return jsonb_build_object('dias', balance, 'inventory', items);
end $$;

create or replace function public.purchase_galactic_item(p_item_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  item_type text;
  price integer;
  current_dias bigint;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if coalesce((public.effective_plan(uid)).code, '') not in ('basic', 'premium') then
    raise exception 'SUBSCRIPTION_REQUIRED';
  end if;
  case p_item_id
    when 'nova' then item_type := 'ch'; price := 0;
    when 'comet' then item_type := 'ch'; price := 150;
    when 'titan' then item_type := 'ch'; price := 250;
    when 'aegis' then item_type := 'ch'; price := 300;
    when 'spectre' then item_type := 'ch'; price := 500;
    when 'laser' then item_type := 'wp'; price := 0;
    when 'rapid' then item_type := 'wp'; price := 120;
    when 'spread' then item_type := 'wp'; price := 200;
    when 'cannon' then item_type := 'wp'; price := 300;
    when 'missile' then item_type := 'wp'; price := 400;
    when 'plasma' then item_type := 'wp'; price := 500;
    when 'cy' then item_type := 'col'; price := 0;
    when 'mg' then item_type := 'col'; price := 40;
    when 'lm' then item_type := 'col'; price := 40;
    when 'gd' then item_type := 'col'; price := 60;
    when 'sk0' then item_type := 'skin'; price := 0;
    when 'sk1' then item_type := 'skin'; price := 80;
    when 'sk2' then item_type := 'skin'; price := 80;
    when 'sk3' then item_type := 'skin'; price := 100;
    when 'fx0' then item_type := 'fx'; price := 0;
    when 'fx1' then item_type := 'fx'; price := 60;
    when 'fx2' then item_type := 'fx'; price := 60;
    else raise exception 'INVALID_GAME_ITEM';
  end case;
  perform public.my_galactic_game_inventory();
  select dias into current_dias from public.wallet_game_accounts where user_id = uid for update;
  if exists (select 1 from public.galactic_game_inventory where user_id = uid and item_id = p_item_id) then
    raise exception 'ITEM_ALREADY_OWNED';
  end if;
  if current_dias < price then raise exception 'INSUFFICIENT_DIAS'; end if;
  update public.wallet_game_accounts
     set dias = dias - price, updated_at = now()
   where user_id = uid;
  insert into public.galactic_game_inventory (user_id, item_id, item_type)
    values (uid, p_item_id, item_type);
  return public.my_galactic_game_inventory();
end $$;

create or replace function public.equip_galactic_item(p_item_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); item public.galactic_game_inventory;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if coalesce((public.effective_plan(uid)).code, '') not in ('basic', 'premium') then
    raise exception 'SUBSCRIPTION_REQUIRED';
  end if;
  select * into item from public.galactic_game_inventory
   where user_id = uid and item_id = p_item_id for update;
  if item.item_id is null then raise exception 'ITEM_NOT_OWNED'; end if;
  update public.galactic_game_inventory set equipped = false
   where user_id = uid and item_type = item.item_type and equipped;
  update public.galactic_game_inventory set equipped = true
   where user_id = uid and item_id = p_item_id;
  return public.my_galactic_game_inventory();
end $$;

create or replace function public.upgrade_galactic_weapon(p_item_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  weapon public.galactic_game_inventory;
  price integer;
  current_dias bigint;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if coalesce((public.effective_plan(uid)).code, '') not in ('basic', 'premium') then
    raise exception 'SUBSCRIPTION_REQUIRED';
  end if;
  select * into weapon from public.galactic_game_inventory
   where user_id = uid and item_id = p_item_id and item_type = 'wp' for update;
  if weapon.item_id is null then raise exception 'ITEM_NOT_OWNED'; end if;
  if weapon.upgrade_level >= 5 then raise exception 'MAX_UPGRADE_LEVEL'; end if;
  price := 25 * (weapon.upgrade_level + 1);
  select dias into current_dias from public.wallet_game_accounts where user_id = uid for update;
  if current_dias < price then raise exception 'INSUFFICIENT_DIAS'; end if;
  update public.wallet_game_accounts set dias = dias - price, updated_at = now()
   where user_id = uid;
  update public.galactic_game_inventory set upgrade_level = upgrade_level + 1
   where user_id = uid and item_id = p_item_id;
  return public.my_galactic_game_inventory();
end $$;

create or replace function public.request_galactic_conversion(p_crystals integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  plan_code text;
  sid uuid;
  amount bigint;
  request_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select p.code, s.id into plan_code, sid
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
   where s.user_id = uid and s.status = 'active' and s.expires_at > now()
     and p.is_active and p.code in ('basic', 'premium')
   order by p.price_php desc, s.expires_at desc
   limit 1;
  if sid is null then raise exception 'SUBSCRIPTION_REQUIRED'; end if;

  if p_crystals = 25000 then
    amount := 2500;
  elsif p_crystals = 60000 and plan_code = 'basic' then
    amount := 5000;
  elsif p_crystals = 60000 and plan_code = 'premium' then
    amount := 6000;
  else
    raise exception 'INVALID_CONVERSION';
  end if;

  insert into public.galactic_conversion_requests
    (user_id, subscription_id, plan_code, crystals, amount_centavos)
  values (uid, sid, plan_code, p_crystals, amount)
  returning id into request_id;
  return request_id;
end $$;

create or replace function public.request_galactic_withdrawal(
  p_amount_centavos bigint, p_payout_method text,
  p_account_name text, p_account_email text, p_account_number text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  current_balance bigint;
  vat bigint;
  net bigint;
  request_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_amount_centavos not between 100 and 10000000 then raise exception 'INVALID_AMOUNT'; end if;
  if p_payout_method not in ('GCash', 'Maya') then raise exception 'INVALID_PAYOUT_METHOD'; end if;
  if char_length(trim(coalesce(p_account_name, ''))) not between 2 and 100
     or char_length(trim(coalesce(p_account_email, ''))) not between 3 and 254
     or char_length(trim(coalesce(p_account_number, ''))) not between 4 and 100
     or trim(p_account_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'INVALID_PAYOUT_DETAILS';
  end if;

  vat := round(p_amount_centavos * 0.10)::bigint;
  net := p_amount_centavos - vat;
  insert into public.galactic_earnings_wallets (user_id)
    values (uid) on conflict (user_id) do nothing;
  select balance_centavos into current_balance
    from public.galactic_earnings_wallets where user_id = uid for update;
  if current_balance < p_amount_centavos then raise exception 'INSUFFICIENT_EARNINGS'; end if;

  update public.galactic_earnings_wallets
     set balance_centavos = balance_centavos - p_amount_centavos, updated_at = now()
   where user_id = uid
   returning balance_centavos into current_balance;
  insert into public.galactic_withdrawal_requests
    (user_id, amount_centavos, vat_centavos, payout_centavos, payout_method,
     account_name, account_email, account_number)
  values (uid, p_amount_centavos, vat, net, p_payout_method,
          trim(p_account_name), lower(trim(p_account_email)), trim(p_account_number))
  returning id into request_id;
  return request_id;
end $$;

create or replace function public.admin_review_galactic_conversion(
  p_request uuid, p_decision text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare conversion public.galactic_conversion_requests; new_balance bigint;
begin
  perform public.assert_admin();
  if p_decision not in ('approved', 'rejected') then raise exception 'INVALID_DECISION'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'INVALID_NOTE'; end if;
  select * into conversion from public.galactic_conversion_requests
   where id = p_request for update;
  if conversion.id is null or conversion.status <> 'pending' then
    raise exception 'CONVERSION_NOT_PENDING';
  end if;

  if p_decision = 'approved' then
    insert into public.galactic_earnings_wallets (user_id)
      values (conversion.user_id) on conflict (user_id) do nothing;
    update public.galactic_earnings_wallets
       set balance_centavos = balance_centavos + conversion.amount_centavos, updated_at = now()
     where user_id = conversion.user_id
     returning balance_centavos into new_balance;
  end if;
  update public.galactic_conversion_requests
     set status = p_decision, reviewed_by = auth.uid(),
         review_note = nullif(trim(p_reason), ''), reviewed_at = now()
   where id = conversion.id;
  perform public.admin_log(
    case when p_decision = 'approved' then 'approve_galactic_conversion'
         else 'reject_galactic_conversion' end,
    'galactic_conversion', conversion.id::text, p_reason,
    jsonb_build_object('user_id', conversion.user_id, 'crystals', conversion.crystals,
                       'amount_centavos', conversion.amount_centavos,
                       'balance_after_centavos', new_balance)
  );
end $$;

create or replace function public.admin_review_galactic_withdrawal(
  p_request uuid, p_decision text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare withdrawal public.galactic_withdrawal_requests; new_balance bigint;
begin
  perform public.assert_admin();
  if p_decision not in ('approve', 'reject', 'paid') then raise exception 'INVALID_DECISION'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'INVALID_NOTE'; end if;
  select * into withdrawal from public.galactic_withdrawal_requests
   where id = p_request for update;
  if withdrawal.id is null then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;

  if p_decision = 'approve' and withdrawal.status = 'pending' then
    update public.galactic_withdrawal_requests
       set status = 'approved', reviewed_by = auth.uid(),
           review_note = nullif(trim(p_reason), ''), reviewed_at = now()
     where id = withdrawal.id;
  elsif p_decision = 'paid' and withdrawal.status = 'approved' then
    update public.galactic_withdrawal_requests
       set status = 'paid', reviewed_by = auth.uid(),
           review_note = nullif(trim(p_reason), ''), reviewed_at = now()
     where id = withdrawal.id;
  elsif p_decision = 'reject' and withdrawal.status in ('pending', 'approved') then
    update public.galactic_withdrawal_requests
       set status = 'rejected', reviewed_by = auth.uid(),
           review_note = nullif(trim(p_reason), ''), reviewed_at = now()
     where id = withdrawal.id;
    update public.galactic_earnings_wallets
       set balance_centavos = balance_centavos + withdrawal.amount_centavos, updated_at = now()
     where user_id = withdrawal.user_id
     returning balance_centavos into new_balance;
  else
    raise exception 'INVALID_WITHDRAWAL_TRANSITION';
  end if;

  perform public.admin_log(
    case when p_decision = 'paid' then 'pay_galactic_withdrawal'
         when p_decision = 'approve' then 'approve_galactic_withdrawal'
         else 'reject_galactic_withdrawal' end,
    'galactic_withdrawal', withdrawal.id::text, p_reason,
    jsonb_build_object('user_id', withdrawal.user_id,
                       'amount_centavos', withdrawal.amount_centavos,
                       'vat_centavos', withdrawal.vat_centavos,
                       'payout_centavos', withdrawal.payout_centavos,
                       'balance_after_centavos', new_balance)
  );
end $$;

revoke all on function public.request_galactic_conversion(integer) from public, anon;
revoke all on function public.request_galactic_withdrawal(bigint, text, text, text, text) from public, anon;
revoke all on function public.admin_review_galactic_conversion(uuid, text, text) from public, anon;
revoke all on function public.admin_review_galactic_withdrawal(uuid, text, text) from public, anon;
revoke all on function public.my_galactic_game_inventory() from public, anon;
revoke all on function public.purchase_galactic_item(text) from public, anon;
revoke all on function public.equip_galactic_item(text) from public, anon;
revoke all on function public.upgrade_galactic_weapon(text) from public, anon;
grant execute on function public.request_galactic_conversion(integer),
  public.request_galactic_withdrawal(bigint, text, text, text, text),
  public.my_galactic_game_inventory(),
  public.purchase_galactic_item(text),
  public.equip_galactic_item(text),
  public.upgrade_galactic_weapon(text) to authenticated;
grant execute on function public.admin_review_galactic_conversion(uuid, text, text),
  public.admin_review_galactic_withdrawal(uuid, text, text) to authenticated;
