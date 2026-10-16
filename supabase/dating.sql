-- Run after supabase/schema.sql.
-- Presence ("Online"), dating profiles, friends, Telegram-style photos, and DMs with unsend.
-- Run supabase/admin-support.sql after this script to enable the admin support contact list.

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_status_idx
  on public.friendships (addressee_id, status);

create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists profile_photos_user_created_idx
  on public.profile_photos (user_id, created_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) between 1 and 2000),
  image_path text,
  created_at timestamptz not null default now(),
  unsent_at timestamptz,
  check (sender_id <> recipient_id),
  check (unsent_at is not null or body is not null or image_path is not null)
);

create index if not exists direct_messages_thread_idx
  on public.direct_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    created_at desc
  );

create table if not exists public.direct_thread_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  other_user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, other_user_id),
  check (user_id <> other_user_id)
);

alter table public.user_presence enable row level security;
alter table public.friendships enable row level security;
alter table public.profile_photos enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_thread_reads enable row level security;

revoke all on public.user_presence, public.friendships, public.profile_photos,
  public.direct_messages, public.direct_thread_reads
  from public, anon, authenticated;
grant select on public.user_presence, public.friendships, public.profile_photos,
  public.direct_messages, public.direct_thread_reads to authenticated;

drop policy if exists presence_read_active on public.user_presence;
create policy presence_read_active on public.user_presence for select
  using (public.is_active_user() or public.is_admin());

drop policy if exists friendships_read_own on public.friendships;
create policy friendships_read_own on public.friendships for select
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_admin());

drop policy if exists profile_photos_read_active on public.profile_photos;
create policy profile_photos_read_active on public.profile_photos for select
  using (
    exists (select 1 from public.profiles p where p.id = user_id and p.status = 'active')
    or user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists dm_read_participants on public.direct_messages;
create policy dm_read_participants on public.direct_messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

drop policy if exists dm_reads_own on public.direct_thread_reads;
create policy dm_reads_own on public.direct_thread_reads for select
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.touch_presence() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  seen_at timestamptz := now();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  insert into public.user_presence (user_id, last_seen_at)
  values (uid, seen_at)
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
  return seen_at;
end $$;

create or replace function public.online_now_count() returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from public.user_presence up
  join public.profiles p on p.id = up.user_id
  where p.status = 'active'
    and up.last_seen_at > now() - interval '5 minutes'
$$;

create or replace function public.send_friend_request(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing public.friendships;
  new_id uuid;
  requester_name text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_user_id is null or p_user_id = uid then raise exception 'INVALID_USER'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'USER_NOT_FOUND';
  end if;

  select * into existing
  from public.friendships
  where least(requester_id, addressee_id) = least(uid, p_user_id)
    and greatest(requester_id, addressee_id) = greatest(uid, p_user_id);

  if existing.id is not null then
    if existing.status = 'accepted' then raise exception 'ALREADY_FRIENDS'; end if;
    if existing.status = 'pending' and existing.requester_id = uid then raise exception 'REQUEST_PENDING'; end if;
    if existing.status = 'pending' and existing.addressee_id = uid then
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = existing.id;
      return existing.id;
    end if;
    if existing.status = 'declined' then
      update public.friendships
         set requester_id = uid, addressee_id = p_user_id, status = 'pending',
             created_at = now(), responded_at = null
       where id = existing.id;
      new_id := existing.id;
    end if;
  else
    insert into public.friendships (requester_id, addressee_id, status)
    values (uid, p_user_id, 'pending')
    returning id into new_id;
  end if;

  select display_name into requester_name from public.profiles where id = uid;
  insert into public.notifications (user_id, type, message, link)
  values (
    p_user_id,
    'friend_request',
    coalesce(requester_name, 'Someone') || ' sent you a friend request.',
    '/dating'
  );
  return new_id;
end $$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rec public.friendships;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into rec from public.friendships where id = p_request_id;
  if rec.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if rec.addressee_id <> uid then raise exception 'FORBIDDEN'; end if;
  if rec.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  update public.friendships
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = rec.id;
end $$;

create or replace function public.remove_friend(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.friendships
  where status = 'accepted'
    and least(requester_id, addressee_id) = least(uid, p_user_id)
    and greatest(requester_id, addressee_id) = greatest(uid, p_user_id);
end $$;

create or replace function public.add_profile_photo(p_image_path text, p_caption text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  photo_count int;
  new_id uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_image_path is null or p_image_path not like uid::text || '/%' then
    raise exception 'INVALID_IMAGE_PATH';
  end if;
  select count(*) into photo_count from public.profile_photos where user_id = uid;
  if photo_count >= 24 then raise exception 'PHOTO_LIMIT_REACHED'; end if;
  insert into public.profile_photos (user_id, image_path, caption)
  values (uid, p_image_path, nullif(btrim(p_caption), ''))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.delete_profile_photo(p_photo_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  path text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.profile_photos
   where id = p_photo_id and user_id = uid
  returning image_path into path;
  if path is null then raise exception 'PHOTO_NOT_FOUND'; end if;
  return path;
end $$;

create or replace function public.send_direct_message(p_recipient_id uuid, p_body text, p_image_path text default null)
returns uuid
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
  if cleaned is null and p_image_path is null then raise exception 'EMPTY_MESSAGE'; end if;
  if p_image_path is not null and p_image_path not like uid::text || '/%' then
    raise exception 'INVALID_IMAGE_PATH';
  end if;
  if cleaned is not null and char_length(cleaned) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;

  insert into public.direct_messages (sender_id, recipient_id, body, image_path)
  values (uid, p_recipient_id, cleaned, p_image_path)
  returning id into new_id;

  select display_name into sender_name from public.profiles where id = uid;
  insert into public.notifications (user_id, type, message, link)
  values (
    p_recipient_id,
    'direct_message',
    coalesce(sender_name, 'Someone') || ' sent you a message.',
    '/messages/' || uid::text
  );
  return new_id;
end $$;

create or replace function public.unsend_direct_message(p_message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.direct_messages
     set body = null, image_path = null, unsent_at = now()
   where id = p_message_id and sender_id = uid and unsent_at is null;
  if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
end $$;

create or replace function public.mark_thread_read(p_other_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_other_user_id is null or p_other_user_id = uid then return; end if;
  insert into public.direct_thread_reads (user_id, other_user_id, last_read_at)
  values (uid, p_other_user_id, now())
  on conflict (user_id, other_user_id) do update set last_read_at = now();
end $$;

create or replace function public.my_conversations()
returns table (
  other_user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  last_body text,
  last_image boolean,
  last_unsent boolean,
  last_at timestamptz,
  unread_count bigint
)
language sql stable security definer set search_path = public as $$
  with threads as (
    select
      case when dm.sender_id = auth.uid() then dm.recipient_id else dm.sender_id end as other_user_id,
      dm.body,
      dm.image_path,
      dm.unsent_at,
      dm.created_at,
      row_number() over (
        partition by least(dm.sender_id, dm.recipient_id), greatest(dm.sender_id, dm.recipient_id)
        order by dm.created_at desc
      ) as rn
    from public.direct_messages dm
    where dm.sender_id = auth.uid() or dm.recipient_id = auth.uid()
  )
  select
    t.other_user_id,
    p.username,
    p.display_name,
    p.avatar_path,
    t.body,
    t.image_path is not null,
    t.unsent_at is not null,
    t.created_at,
    (
      select count(*)
      from public.direct_messages m
      left join public.direct_thread_reads r
        on r.user_id = auth.uid() and r.other_user_id = t.other_user_id
      where m.sender_id = t.other_user_id
        and m.recipient_id = auth.uid()
        and m.unsent_at is null
        and m.created_at > coalesce(r.last_read_at, to_timestamp(0))
    ) as unread_count
  from threads t
  join public.profiles p on p.id = t.other_user_id
  where t.rn = 1
  order by t.created_at desc
$$;

revoke all on function public.touch_presence() from public, anon, authenticated;
revoke all on function public.online_now_count() from public, anon, authenticated;
revoke all on function public.send_friend_request(uuid) from public, anon, authenticated;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.remove_friend(uuid) from public, anon, authenticated;
revoke all on function public.add_profile_photo(text, text) from public, anon, authenticated;
revoke all on function public.delete_profile_photo(uuid) from public, anon, authenticated;
revoke all on function public.send_direct_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.unsend_direct_message(uuid) from public, anon, authenticated;
revoke all on function public.mark_thread_read(uuid) from public, anon, authenticated;
revoke all on function public.my_conversations() from public, anon, authenticated;

grant execute on function public.touch_presence() to authenticated;
grant execute on function public.online_now_count() to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.add_profile_photo(text, text) to authenticated;
grant execute on function public.delete_profile_photo(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, text, text) to authenticated;
grant execute on function public.unsend_direct_message(uuid) to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('profile-photos', 'profile-photos', true, 3145728, array['image/jpeg','image/png','image/webp']),
    ('chat-images', 'chat-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = excluded.public,
    file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists cv_profile_photos_read on storage.objects;
  drop policy if exists cv_profile_photos_insert on storage.objects;
  drop policy if exists cv_profile_photos_delete on storage.objects;
  drop policy if exists cv_chat_images_read on storage.objects;
  drop policy if exists cv_chat_images_insert on storage.objects;
  drop policy if exists cv_chat_images_delete on storage.objects;

  create policy cv_profile_photos_read on storage.objects for select
    using (bucket_id = 'profile-photos');
  create policy cv_profile_photos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
                and public.is_active_user());
  create policy cv_profile_photos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy cv_chat_images_read on storage.objects for select
    using (bucket_id = 'chat-images');
  create policy cv_chat_images_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text
                and public.is_active_user());
  create policy cv_chat_images_delete on storage.objects for delete to authenticated
    using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
exception when others then
  raise notice 'Dating storage setup skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
