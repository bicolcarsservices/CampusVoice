-- Run after supabase/schema.sql and supabase/wallet.sql to enable
-- Campus Coin Rush reward claims and manual fulfillment.

create table if not exists public.game_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_code text not null check (reward_code in ('load10', 'gosurf59')),
  required_coins integer not null check (required_coins in (25000, 60000)),
  recipient_name text not null check (char_length(recipient_name) between 2 and 100),
  recipient_email text not null check (char_length(recipient_email) between 3 and 254),
  recipient_phone text not null check (char_length(recipient_phone) between 7 and 30),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'rejected')),
  reviewed_by uuid references auth.users(id),
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists game_reward_claims_status_created_idx
  on public.game_reward_claims (status, created_at);
create index if not exists game_reward_claims_user_created_idx
  on public.game_reward_claims (user_id, created_at desc);
create unique index if not exists game_reward_claims_one_pending_per_reward
  on public.game_reward_claims (user_id, reward_code)
  where status = 'pending';

alter table public.game_reward_claims enable row level security;
revoke all on public.game_reward_claims from public, anon, authenticated;
grant select on public.game_reward_claims to authenticated;

drop policy if exists game_reward_claims_read_own_or_admin on public.game_reward_claims;
create policy game_reward_claims_read_own_or_admin on public.game_reward_claims
  for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.request_game_reward(
  p_reward_code text, p_recipient_name text, p_recipient_email text, p_recipient_phone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  coins integer;
  claim_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if char_length(trim(coalesce(p_recipient_name, ''))) not between 2 and 100
     or char_length(trim(coalesce(p_recipient_email, ''))) not between 3 and 254
     or char_length(trim(coalesce(p_recipient_phone, ''))) not between 7 and 30 then
    raise exception 'INVALID_RECIPIENT_DETAILS';
  end if;
  case p_reward_code
    when 'load10' then coins := 25000;
    when 'gosurf59' then coins := 60000;
    else raise exception 'INVALID_GAME_REWARD';
  end case;

  insert into public.game_reward_claims
    (user_id, reward_code, required_coins, recipient_name, recipient_email, recipient_phone)
  values
    (uid, p_reward_code, coins, trim(p_recipient_name), trim(p_recipient_email), trim(p_recipient_phone))
  returning id into claim_id;
  return claim_id;
end $$;

create or replace function public.admin_review_game_reward(
  p_claim uuid, p_decision text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare claim public.game_reward_claims;
begin
  perform public.assert_admin();
  if p_decision not in ('fulfilled', 'rejected') then raise exception 'INVALID_DECISION'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'INVALID_NOTE'; end if;
  select * into claim from public.game_reward_claims where id = p_claim for update;
  if claim.id is null or claim.status <> 'pending' then raise exception 'CLAIM_NOT_PENDING'; end if;

  update public.game_reward_claims
     set status = p_decision, reviewed_by = auth.uid(),
         review_note = nullif(trim(p_reason), ''), reviewed_at = now()
   where id = claim.id;
  perform public.admin_log(
    case when p_decision = 'fulfilled' then 'fulfill_game_reward' else 'reject_game_reward' end,
    'game_reward_claim', claim.id::text, p_reason,
    jsonb_build_object('user_id', claim.user_id, 'reward_code', claim.reward_code,
                       'required_coins', claim.required_coins)
  );
end $$;

revoke all on function public.request_game_reward(text, text, text, text) from public, anon;
revoke all on function public.admin_review_game_reward(uuid, text, text) from public, anon;
grant execute on function public.request_game_reward(text, text, text, text) to authenticated;
grant execute on function public.admin_review_game_reward(uuid, text, text) to authenticated;
