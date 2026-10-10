-- Run after supabase/schema.sql to enable PayMongo GCash checkout.
create table if not exists public.paymongo_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null unique references public.subscriptions(id) on delete cascade,
  intent_id text not null unique,
  amount_centavos integer not null check (amount_centavos > 0),
  plan_duration_days integer not null check (plan_duration_days > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'mismatch', 'refunded')),
  created_at timestamptz not null default now()
);

alter table public.paymongo_payments drop constraint if exists paymongo_payments_status_check;
alter table public.paymongo_payments add constraint paymongo_payments_status_check
  check (status in ('pending', 'paid', 'failed', 'mismatch', 'refunded'));

alter table public.paymongo_payments enable row level security;
revoke all on public.paymongo_payments from public, anon, authenticated;
grant select on public.paymongo_payments to authenticated;
grant all on public.paymongo_payments to service_role;

drop policy if exists paymongo_payments_admin_read on public.paymongo_payments;
create policy paymongo_payments_admin_read on public.paymongo_payments for select
  using (public.is_admin());

create or replace function public.process_paymongo_payment(
  p_intent_id text,
  p_amount_centavos integer,
  p_currency text,
  p_paid boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  payment public.paymongo_payments;
  subscription public.subscriptions;
  result text;
begin
  select pp.* into payment
    from public.paymongo_payments pp
   where pp.intent_id = p_intent_id
   for update;
  if payment.id is null then return 'ignored'; end if;
  if payment.status <> 'pending' then return 'already_' || payment.status; end if;

  select s.* into subscription
    from public.subscriptions s
   where s.id = payment.subscription_id
   for update;
  if subscription.id is null then raise exception 'Subscription for payment % was not found', p_intent_id; end if;

  if not p_paid then
    result := 'failed';
  elsif p_currency is distinct from 'PHP' or p_amount_centavos is distinct from payment.amount_centavos then
    result := 'mismatch';
  elsif subscription.status <> 'pending' then
    result := 'paid_subscription_inactive';
  else
    update public.subscriptions
       set status = 'active',
           starts_at = now(),
           expires_at = now() + make_interval(days => payment.plan_duration_days),
           payment_reference = p_intent_id
     where id = subscription.id;
    result := 'paid';
  end if;

  if result = 'failed' and subscription.status = 'pending' then
    update public.subscriptions set status = 'cancelled' where id = subscription.id;
  elsif result = 'mismatch' and subscription.status = 'pending' then
    update public.subscriptions set status = 'rejected' where id = subscription.id;
  end if;

  update public.paymongo_payments
     set status = case when result = 'paid_subscription_inactive' then 'paid' else result end
   where id = payment.id;
  return result;
end $$;

create or replace function public.process_paymongo_refund(p_intent_id text) returns text
language plpgsql security definer set search_path = public as $$
declare payment public.paymongo_payments; subscription public.subscriptions;
begin
  select pp.* into payment
    from public.paymongo_payments pp
   where pp.intent_id = p_intent_id
   for update;
  if payment.id is null then return 'ignored'; end if;
  if payment.status = 'refunded' then return 'already_refunded'; end if;
  if payment.status not in ('pending', 'paid') then return 'ignored'; end if;

  update public.paymongo_payments set status = 'refunded' where id = payment.id;
  update public.subscriptions
     set status = 'refunded'
   where id = payment.subscription_id and status in ('pending', 'active', 'expired');
  return 'refunded';
end $$;

create or replace function public.admin_mark_paymongo_refunded(p_sub uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare payment public.paymongo_payments;
begin
  perform public.assert_admin();
  if nullif(trim(p_reason), '') is null then raise exception 'REFUND_VERIFICATION_REQUIRED'; end if;

  select pp.* into payment
    from public.paymongo_payments pp
   where pp.subscription_id = p_sub
   for update;
  if payment.id is null or payment.status not in ('pending', 'paid') then
    raise exception 'PAYMONGO_PAYMENT_NOT_FOUND_OR_NOT_REFUNDABLE';
  end if;

  update public.paymongo_payments set status = 'refunded' where id = payment.id;
  update public.subscriptions
     set status = 'refunded'
   where id = p_sub and status in ('pending', 'active', 'expired');
  perform public.admin_log('mark_paymongo_refunded', 'subscription', p_sub::text, p_reason,
                           jsonb_build_object('intent_id', payment.intent_id, 'amount_centavos', payment.amount_centavos));
end $$;

revoke all on function public.process_paymongo_payment(text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.process_paymongo_payment(text, integer, text, boolean)
  to service_role;
revoke all on function public.process_paymongo_refund(text) from public, anon, authenticated;
grant execute on function public.process_paymongo_refund(text) to service_role;
revoke all on function public.admin_mark_paymongo_refunded(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_mark_paymongo_refunded(uuid, text) to authenticated;
