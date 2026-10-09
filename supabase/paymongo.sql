-- Run after supabase/schema.sql to enable PayMongo GCash checkout.
create table if not exists public.paymongo_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null unique references public.subscriptions(id) on delete cascade,
  intent_id text not null unique,
  amount_centavos integer not null check (amount_centavos > 0),
  plan_duration_days integer not null check (plan_duration_days > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'mismatch')),
  created_at timestamptz not null default now()
);

alter table public.paymongo_payments enable row level security;
revoke all on public.paymongo_payments from public, anon, authenticated;
grant all on public.paymongo_payments to service_role;

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
   where pp.intent_id = p_intent_id and pp.status = 'pending'
   for update;
  if payment.id is null then return 'ignored'; end if;

  select s.* into subscription
    from public.subscriptions s
   where s.id = payment.subscription_id and s.status = 'pending'
   for update;
  if subscription.id is null then
    raise exception 'Pending subscription for payment % was not found', p_intent_id;
  end if;

  if not p_paid then
    result := 'failed';
  elsif p_currency <> 'PHP' or p_amount_centavos <> payment.amount_centavos then
    result := 'mismatch';
  else
    update public.subscriptions
       set status = 'active',
           starts_at = now(),
           expires_at = now() + make_interval(days => payment.plan_duration_days),
           payment_reference = p_intent_id
     where id = subscription.id;
    result := 'paid';
  end if;

  if result = 'failed' then
    update public.subscriptions set status = 'cancelled' where id = subscription.id;
  elsif result = 'mismatch' then
    update public.subscriptions set status = 'rejected' where id = subscription.id;
  end if;

  update public.paymongo_payments set status = result where id = payment.id;
  return result;
end $$;

revoke all on function public.process_paymongo_payment(text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.process_paymongo_payment(text, integer, text, boolean)
  to service_role;
