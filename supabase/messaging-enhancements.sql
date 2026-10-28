-- Run after supabase/schema.sql and supabase/dating.sql.
-- Adds private group conversations, message reactions, voice notes, and per-user chat settings.

alter table public.direct_messages add column if not exists audio_path text;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.direct_messages'::regclass
      and contype = 'c'
      and lower(pg_get_constraintdef(oid)) like '%body is not null%'
      and lower(pg_get_constraintdef(oid)) like '%image_path is not null%'
  loop
    execute format('alter table public.direct_messages drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.direct_messages
  add constraint direct_messages_has_content
  check (unsent_at is not null or body is not null or image_path is not null or audio_path is not null);

create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_chat_members (
  group_id uuid not null references public.group_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) between 1 and 2000),
  image_path text,
  audio_path text,
  created_at timestamptz not null default now(),
  unsent_at timestamptz,
  check (unsent_at is not null or body is not null or image_path is not null or audio_path is not null)
);

create index if not exists group_chat_messages_latest_idx
  on public.group_chat_messages (group_id, created_at desc);
create index if not exists group_chat_members_user_idx
  on public.group_chat_members (user_id, joined_at desc);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id) on delete cascade,
  group_message_id uuid references public.group_chat_messages(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥')),
  created_at timestamptz not null default now(),
  check ((direct_message_id is not null)::int + (group_message_id is not null)::int = 1)
);

create unique index if not exists message_reactions_direct_unique
  on public.message_reactions (user_id, direct_message_id)
  where direct_message_id is not null;
create unique index if not exists message_reactions_group_unique
  on public.message_reactions (user_id, group_message_id)
  where group_message_id is not null;

alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_chat_messages enable row level security;
alter table public.message_reactions enable row level security;

revoke all on public.group_chats, public.group_chat_members, public.group_chat_messages, public.message_reactions
  from public, anon, authenticated;
grant select on public.group_chats, public.group_chat_members, public.group_chat_messages, public.message_reactions
  to authenticated;

create or replace function public.is_group_chat_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_chat_members
    where group_id = p_group_id and user_id = auth.uid()
  )
$$;
revoke all on function public.is_group_chat_member(uuid) from public, anon;
grant execute on function public.is_group_chat_member(uuid) to authenticated;

drop policy if exists group_chats_member_read on public.group_chats;
create policy group_chats_member_read on public.group_chats for select to authenticated
  using (public.is_group_chat_member(id));

drop policy if exists group_members_peer_read on public.group_chat_members;
create policy group_members_peer_read on public.group_chat_members for select to authenticated
  using (public.is_group_chat_member(group_id));

drop policy if exists group_messages_member_read on public.group_chat_messages;
create policy group_messages_member_read on public.group_chat_messages for select to authenticated
  using (public.is_group_chat_member(group_id));

drop policy if exists message_reactions_conversation_read on public.message_reactions;
create policy message_reactions_conversation_read on public.message_reactions for select to authenticated
  using (
    (direct_message_id is not null and exists (
      select 1 from public.direct_messages dm
      where dm.id = direct_message_id and (dm.sender_id = auth.uid() or dm.recipient_id = auth.uid())
    ))
    or
    (group_message_id is not null and exists (
      select 1 from public.group_chat_messages gm
      where gm.id = group_message_id and public.is_group_chat_member(gm.group_id)
    ))
  );

create or replace function public.send_direct_message(
  p_recipient_id uuid,
  p_body text,
  p_image_path text,
  p_audio_path text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cleaned text := nullif(btrim(p_body), '');
  new_id uuid;
  sender_name text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_recipient_id is null or p_recipient_id = uid then raise exception 'INVALID_USER'; end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id and status = 'active') then
    raise exception 'USER_NOT_FOUND';
  end if;
  if cleaned is null and p_image_path is null and p_audio_path is null then raise exception 'EMPTY_MESSAGE'; end if;
  if (p_image_path is not null and p_image_path not like uid::text || '/%')
     or (p_audio_path is not null and p_audio_path not like uid::text || '/%') then
    raise exception 'INVALID_MEDIA_PATH';
  end if;
  if cleaned is not null and char_length(cleaned) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;

  insert into public.direct_messages (sender_id, recipient_id, body, image_path, audio_path)
  values (uid, p_recipient_id, cleaned, p_image_path, p_audio_path)
  returning id into new_id;

  select display_name into sender_name from public.profiles where id = uid;
  insert into public.notifications (user_id, type, message, link)
  select p_recipient_id, 'direct_message', coalesce(sender_name, 'Someone') || ' sent you a message.', '/messages/' || uid::text
  where not exists (
    select 1 from public.chat_preferences cp
    where cp.user_id = p_recipient_id and cp.other_user_id = uid and cp.muted
  );
  return new_id;
end $$;

-- Keep older clients that send the original three parameters working.
create or replace function public.send_direct_message(p_recipient_id uuid, p_body text, p_image_path text default null)
returns uuid
language sql security definer set search_path = public as $$
  select public.send_direct_message(p_recipient_id, p_body, p_image_path, null)
$$;

create or replace function public.unsend_direct_message(p_message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.direct_messages
  set body = null, image_path = null, audio_path = null, unsent_at = now()
  where id = p_message_id and sender_id = auth.uid() and unsent_at is null;
  if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
end $$;

create or replace function public.create_group_chat(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean_name text := btrim(coalesce(p_name, ''));
  new_group_id uuid;
  requested_count integer;
  active_count integer;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if char_length(clean_name) not between 2 and 60 then raise exception 'INVALID_GROUP_NAME'; end if;
  if p_member_ids is null or cardinality(p_member_ids) < 1 or cardinality(p_member_ids) > 49 then
    raise exception 'INVALID_GROUP_MEMBERS';
  end if;

  select count(distinct member_id) into requested_count
  from unnest(p_member_ids) member_id
  where member_id is not null and member_id <> uid;
  select count(distinct p.id) into active_count
  from public.profiles p
  where p.id = any(p_member_ids) and p.id <> uid and p.status = 'active';
  if requested_count < 1 or requested_count <> active_count then raise exception 'INVALID_GROUP_MEMBERS'; end if;

  insert into public.group_chats (name, created_by) values (clean_name, uid) returning id into new_group_id;
  insert into public.group_chat_members (group_id, user_id, role) values (new_group_id, uid, 'admin');
  insert into public.group_chat_members (group_id, user_id, role)
  select new_group_id, p.id, 'member'
  from public.profiles p
  where p.id = any(p_member_ids) and p.id <> uid and p.status = 'active'
  on conflict do nothing;
  return new_group_id;
end $$;

create or replace function public.unsend_group_chat_message(p_message_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.group_chat_messages
  set body = null, image_path = null, audio_path = null, unsent_at = now()
  where id = p_message_id and sender_id = auth.uid() and unsent_at is null;
  if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
end $$;

create or replace function public.my_group_chats()
returns table (group_id uuid, name text, created_at timestamptz, last_body text, last_at timestamptz, member_count bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.created_at, latest.body, latest.created_at,
         (select count(*) from public.group_chat_members m where m.group_id = g.id)
  from public.group_chat_members mine
  join public.group_chats g on g.id = mine.group_id
  left join lateral (
    select coalesce(
      gm.body,
      case when gm.unsent_at is not null then 'This message was unsent'
           when gm.image_path is not null then 'Photo'
           when gm.audio_path is not null then 'Voice message'
           else 'Message' end
    ) as body, gm.created_at
    from public.group_chat_messages gm
    where gm.group_id = g.id
    order by gm.created_at desc
    limit 1
  ) latest on true
  where mine.user_id = auth.uid() and public.is_active_user()
  order by coalesce(latest.created_at, g.created_at) desc
$$;

create or replace function public.send_group_chat_message(
  p_group_id uuid,
  p_body text,
  p_image_path text,
  p_audio_path text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean_body text := nullif(btrim(p_body), '');
  new_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.group_chat_members where group_id = p_group_id and user_id = uid) then
    raise exception 'NOT_GROUP_MEMBER';
  end if;
  if clean_body is null and p_image_path is null and p_audio_path is null then raise exception 'EMPTY_MESSAGE'; end if;
  if (p_image_path is not null and p_image_path not like uid::text || '/%')
     or (p_audio_path is not null and p_audio_path not like uid::text || '/%') then
    raise exception 'INVALID_MEDIA_PATH';
  end if;
  if clean_body is not null and char_length(clean_body) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;

  insert into public.group_chat_messages (group_id, sender_id, body, image_path, audio_path)
  values (p_group_id, uid, clean_body, p_image_path, p_audio_path)
  returning id into new_id;
  insert into public.notifications (user_id, type, message, link)
  select m.user_id, 'direct_message', 'New message in ' || g.name, '/messages/group/' || g.id::text
  from public.group_chat_members m join public.group_chats g on g.id = m.group_id
  where m.group_id = p_group_id and m.user_id <> uid
    and not exists (
      select 1 from public.chat_preferences cp
      where cp.user_id = m.user_id and cp.group_id = p_group_id and cp.muted
    );
  return new_id;
end $$;

create or replace function public.toggle_message_reaction(
  p_emoji text,
  p_direct_message_id uuid default null,
  p_group_message_id uuid default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥') then raise exception 'INVALID_REACTION'; end if;
  if (p_direct_message_id is null) = (p_group_message_id is null) then raise exception 'INVALID_MESSAGE'; end if;
  if p_direct_message_id is not null and not exists (
    select 1 from public.direct_messages
    where id = p_direct_message_id and (sender_id = uid or recipient_id = uid) and unsent_at is null
  ) then raise exception 'MESSAGE_NOT_FOUND'; end if;
  if p_group_message_id is not null and not exists (
    select 1 from public.group_chat_messages gm join public.group_chat_members m on m.group_id = gm.group_id
    where gm.id = p_group_message_id and m.user_id = uid and gm.unsent_at is null
  ) then raise exception 'MESSAGE_NOT_FOUND'; end if;

  select id into existing_id from public.message_reactions
  where user_id = uid
    and ((p_direct_message_id is not null and direct_message_id = p_direct_message_id)
      or (p_group_message_id is not null and group_message_id = p_group_message_id))
  limit 1;
  if existing_id is not null then
    if exists (select 1 from public.message_reactions where id = existing_id and emoji = p_emoji) then
      delete from public.message_reactions where id = existing_id;
      return false;
    end if;
    update public.message_reactions set emoji = p_emoji, created_at = now() where id = existing_id;
    return true;
  end if;
  insert into public.message_reactions (user_id, direct_message_id, group_message_id, emoji)
  values (uid, p_direct_message_id, p_group_message_id, p_emoji);
  return true;
end $$;

revoke all on function public.create_group_chat(text, uuid[]) from public, anon, authenticated;
revoke all on function public.my_group_chats() from public, anon, authenticated;
revoke all on function public.send_group_chat_message(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.unsend_group_chat_message(uuid) from public, anon, authenticated;
revoke all on function public.toggle_message_reaction(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.send_direct_message(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
grant execute on function public.my_group_chats() to authenticated;

create table if not exists public.chat_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  other_user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.group_chats(id) on delete cascade,
  muted boolean not null default false,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((other_user_id is not null)::int + (group_id is not null)::int = 1),
  check (other_user_id is null or other_user_id <> user_id)
);

create unique index if not exists chat_preferences_direct_unique
  on public.chat_preferences (user_id, other_user_id) where other_user_id is not null;
create unique index if not exists chat_preferences_group_unique
  on public.chat_preferences (user_id, group_id) where group_id is not null;

alter table public.chat_preferences enable row level security;
revoke all on public.chat_preferences from public, anon, authenticated;
grant select on public.chat_preferences to authenticated;
drop policy if exists chat_preferences_read_own on public.chat_preferences;
create policy chat_preferences_read_own on public.chat_preferences for select to authenticated
  using (user_id = auth.uid());

create or replace function public.set_chat_muted(
  p_other_user_id uuid default null,
  p_group_id uuid default null,
  p_muted boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if (p_other_user_id is not null)::int + (p_group_id is not null)::int <> 1 then
    raise exception 'INVALID_CONVERSATION';
  end if;

  if p_other_user_id is not null then
    if p_other_user_id = uid or not exists (
      select 1 from public.profiles where id = p_other_user_id and status = 'active'
    ) then raise exception 'USER_NOT_FOUND'; end if;
    insert into public.chat_preferences (user_id, other_user_id, muted, updated_at)
    values (uid, p_other_user_id, p_muted, now())
    on conflict (user_id, other_user_id) where other_user_id is not null
    do update set muted = excluded.muted, updated_at = excluded.updated_at;
  else
    if not public.is_group_chat_member(p_group_id) then raise exception 'NOT_GROUP_MEMBER'; end if;
    insert into public.chat_preferences (user_id, group_id, muted, updated_at)
    values (uid, p_group_id, p_muted, now())
    on conflict (user_id, group_id) where group_id is not null
    do update set muted = excluded.muted, updated_at = excluded.updated_at;
  end if;
end $$;

create or replace function public.delete_direct_conversation(p_other_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_other_user_id is null or p_other_user_id = uid then raise exception 'INVALID_CONVERSATION'; end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id and status = 'active') then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.chat_preferences (user_id, other_user_id, deleted_at, updated_at)
  values (uid, p_other_user_id, now(), now())
  on conflict (user_id, other_user_id) where other_user_id is not null
  do update set deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;
end $$;

create or replace function public.leave_group_chat(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  departing_role text;
  next_admin uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select role into departing_role
  from public.group_chat_members
  where group_id = p_group_id and user_id = uid;
  if departing_role is null then raise exception 'NOT_GROUP_MEMBER'; end if;

  if departing_role = 'admin' then
    select user_id into next_admin
    from public.group_chat_members
    where group_id = p_group_id and user_id <> uid
    order by joined_at, user_id
    limit 1;
    if next_admin is not null then
      update public.group_chat_members set role = 'admin'
      where group_id = p_group_id and user_id = next_admin;
    end if;
  end if;

  delete from public.group_chat_members where group_id = p_group_id and user_id = uid;
end $$;

revoke all on function public.set_chat_muted(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_direct_conversation(uuid) from public, anon, authenticated;
revoke all on function public.leave_group_chat(uuid) from public, anon, authenticated;
grant execute on function public.set_chat_muted(uuid, uuid, boolean) to authenticated;
grant execute on function public.delete_direct_conversation(uuid) to authenticated;
grant execute on function public.leave_group_chat(uuid) to authenticated;
grant execute on function public.send_group_chat_message(uuid, text, text, text) to authenticated;
grant execute on function public.unsend_group_chat_message(uuid) to authenticated;
grant execute on function public.toggle_message_reaction(text, uuid, uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-audio', 'chat-audio', false, 10485760, array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cv_chat_audio_read on storage.objects;
drop policy if exists cv_chat_audio_insert on storage.objects;
drop policy if exists cv_chat_audio_delete on storage.objects;
create policy cv_chat_audio_read on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-audio' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.direct_messages dm
        where dm.audio_path = name and (dm.sender_id = auth.uid() or dm.recipient_id = auth.uid())
      )
      or exists (
        select 1 from public.group_chat_messages gm
        where gm.audio_path = name and public.is_group_chat_member(gm.group_id)
      )
    )
  );
create policy cv_chat_audio_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-audio' and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
  );
create policy cv_chat_audio_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-audio' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
