-- Run in Supabase SQL Editor to make subscription activation notifications
-- open the matching payment receipt.
create or replace function public.notify_on_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.status is distinct from old.status then
    select name into pname from public.subscription_plans where id = new.plan_id;
    if new.status = 'active' then
      insert into public.notifications (user_id, type, message, link)
      values (new.user_id, 'subscription_active',
        'Your ' || pname || ' plan is active until ' || to_char(new.expires_at at time zone 'Asia/Manila', 'FMMonth DD, YYYY') || '.',
        '/subscription/status/' || new.id::text || '?receipt=1');
    elsif new.status = 'expired' then
      insert into public.notifications (user_id, type, message, link)
      values (new.user_id, 'subscription_expired', 'Your ' || pname || ' plan has expired.', '/subscription');
    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, type, message, link)
      values (new.user_id, 'subscription_rejected', 'Your subscription request was not approved.', '/subscription');
    end if;
  end if;
  return null;
end $$;

update public.notifications as notification
set link = '/subscription/status/' || (
  select subscription.id::text
  from public.subscriptions as subscription
  where subscription.user_id = notification.user_id
    and subscription.verified_by is not null
  order by abs(extract(epoch from (coalesce(subscription.starts_at, subscription.created_at) - notification.created_at)))
  limit 1
) || '?receipt=1'
where notification.type = 'subscription_active'
  and exists (
    select 1
    from public.subscriptions as subscription
    where subscription.user_id = notification.user_id
      and subscription.verified_by is not null
  );
