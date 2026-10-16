-- Run after supabase/schema.sql and supabase/dating.sql.
-- Provides a private support inbox and account-level in-app notification settings.

drop function if exists public.list_support_agents();

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'support')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check ((sender_role = 'user' and sender_id is not null) or (sender_role = 'support' and sender_id is null))
);

alter table public.profiles
  add column if not exists notifications_enabled boolean not null default true;

create or replace function public.my_notification_preference()
returns boolean
language sql stable security definer set search_path = public as $$
  select notifications_enabled
  from public.profiles
  where id = auth.uid() and public.is_active_user()
$$;

create or replace function public.set_my_notification_preference(p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  update public.profiles set notifications_enabled = p_enabled where id = auth.uid();
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
end $$;

create or replace function public.suppress_disabled_in_app_notifications()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.profiles
    where id = new.user_id and notifications_enabled = false
  ) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists suppress_disabled_in_app_notifications on public.notifications;
create trigger suppress_disabled_in_app_notifications
  before insert on public.notifications
  for each row execute function public.suppress_disabled_in_app_notifications();

create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

revoke all on public.support_conversations, public.support_messages from public, anon, authenticated;
grant select on public.support_conversations, public.support_messages to authenticated;

drop policy if exists support_conversations_read on public.support_conversations;
create policy support_conversations_read on public.support_conversations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and (c.user_id = auth.uid() or public.is_admin())
    )
  );

create or replace function public.get_my_support_conversation()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  conversation_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  insert into public.support_conversations (user_id)
  values (uid)
  on conflict (user_id) do update set updated_at = public.support_conversations.updated_at
  returning id into conversation_id;
  return conversation_id;
end $$;

create or replace function public.send_support_message(p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cleaned text := btrim(coalesce(p_body, ''));
  conversation_id uuid;
  message_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if char_length(cleaned) not between 1 and 2000 then raise exception 'INVALID_SUPPORT_MESSAGE'; end if;
  select public.get_my_support_conversation() into conversation_id;
  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (conversation_id, uid, 'user', cleaned)
  returning id into message_id;
  update public.support_conversations set updated_at = now() where id = conversation_id;
  return message_id;
end $$;

create or replace function public.list_support_conversations()
returns table (
  conversation_id uuid,
  user_id uuid,
  username text,
  display_name text,
  last_message text,
  last_message_at timestamptz,
  message_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query
    select c.id, c.user_id, p.username, p.display_name,
      latest.body, latest.created_at,
      (select count(*) from public.support_messages message
       where message.conversation_id = c.id)
    from public.support_conversations c
    join public.profiles p on p.id = c.user_id
    left join lateral (
      select m.body, m.created_at
      from public.support_messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) latest on true
    order by c.updated_at desc;
end $$;

create or replace function public.reply_to_support_conversation(p_conversation_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cleaned text := btrim(coalesce(p_body, ''));
  message_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if char_length(cleaned) not between 1 and 2000 then raise exception 'INVALID_SUPPORT_MESSAGE'; end if;
  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (p_conversation_id, null, 'support', cleaned)
  returning id into message_id;
  update public.support_conversations set updated_at = now() where id = p_conversation_id;
  if not found then raise exception 'SUPPORT_CONVERSATION_NOT_FOUND'; end if;
  return message_id;
end $$;

revoke all on function public.get_my_support_conversation() from public, anon, authenticated;
revoke all on function public.send_support_message(text) from public, anon, authenticated;
revoke all on function public.list_support_conversations() from public, anon, authenticated;
revoke all on function public.reply_to_support_conversation(uuid, text) from public, anon, authenticated;
revoke all on function public.my_notification_preference() from public, anon, authenticated;
revoke all on function public.set_my_notification_preference(boolean) from public, anon, authenticated;
revoke all on function public.suppress_disabled_in_app_notifications() from public, anon, authenticated;
grant execute on function public.get_my_support_conversation() to authenticated;
grant execute on function public.send_support_message(text) to authenticated;
grant execute on function public.list_support_conversations() to authenticated;
grant execute on function public.reply_to_support_conversation(uuid, text) to authenticated;
grant execute on function public.my_notification_preference() to authenticated;
grant execute on function public.set_my_notification_preference(boolean) to authenticated;

notify pgrst, 'reload schema';
