-- =====================================================================
-- CAMPUSVOICE — COMPLETE SUPABASE SCHEMA (idempotent / re-runnable)
-- Paste the whole thing into Supabase → SQL Editor → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. HELPER FUNCTIONS (no table dependencies)
-- ---------------------------------------------------------------------
create or replace function public.manila_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text,
  description text,
  logo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.schools add column if not exists location text;
alter table public.schools add column if not exists description text;
alter table public.schools add column if not exists logo_path text;
alter table public.schools add column if not exists is_active boolean not null default true;
alter table public.schools add column if not exists created_at timestamptz not null default now();

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- keys starting with 'private_' are hidden from the public
create table if not exists public.website_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null,
  school_id uuid references public.schools(id) on delete set null,
  grade_level text,
  bio text check (char_length(bio) <= 300),
  avatar_path text,
  status text not null default 'active' check (status in ('active','suspended','banned')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists school_name text
  check (char_length(school_name) <= 100);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','moderator')),
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                          -- 'free' | 'basic' | 'premium' | future tiers
  name text not null,
  description text,
  price_php numeric(10,2) not null default 0 check (price_php >= 0),
  duration_days int check (duration_days > 0),        -- null for free
  daily_post_limit int check (daily_post_limit >= 0), -- null = unlimited
  badge_label text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table if not exists public.subscription_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  label text not null,
  feature_key text,        -- gating keys: custom_avatar, bookmarks, edit_posts, premium_themes, featured_profile
  sort_order int not null default 0
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'pending'
    check (status in ('pending','active','expired','cancelled','rejected','suspended','refunded')),
  starts_at timestamptz,
  expires_at timestamptz,
  payment_method text default 'manual',   -- later: 'gcash' | 'maya' | 'paymongo' | 'stripe'
  payment_reference text,
  payment_provider_id text,
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('pending','active','expired','cancelled','rejected','suspended','refunded'));

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  anon_number bigint generated always as identity,
  author_id uuid not null references public.profiles(id) on delete cascade,  -- ALWAYS stored
  is_anonymous boolean not null default false,
  school_id uuid references public.schools(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  content text not null check (char_length(content) between 1 and 2000),
  image_path text,
  status text not null default 'approved'
    check (status in ('pending','approved','rejected','flagged','hidden','removed')),
  reaction_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  status text not null default 'approved' check (status in ('approved','hidden','removed')),
  reaction_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.comments add column if not exists reaction_count int not null default 0;

-- "Likes" = reactions of kind 'like'. One reaction per user per post/comment.
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  kind text not null check (kind in ('like','love','haha','sad','angry')),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (comment_id is null))
);

create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null check (reason in ('bullying','harassment','hate_speech','threat','sexual_content',
    'spam','scam','personal_information','doxxing','misinformation','other')),
  details text check (char_length(details) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  action_taken text,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (comment_id is null))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_post_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  post_count int not null default 0,
  primary key (user_id, usage_date)
);

-- ---------------------------------------------------------------------
-- 3. INDEXES
-- ---------------------------------------------------------------------
create unique index if not exists profiles_username_lower on public.profiles (lower(username));
create index if not exists profiles_school_idx on public.profiles (school_id);
create index if not exists profiles_status_idx on public.profiles (status);

create index if not exists features_plan_idx on public.subscription_features (plan_id, sort_order);

create index if not exists subs_user_idx on public.subscriptions (user_id, status, expires_at);
create index if not exists subs_status_expiry_idx on public.subscriptions (status, expires_at);
create unique index if not exists subs_one_pending_per_user on public.subscriptions (user_id) where status = 'pending';

create index if not exists posts_status_created_idx on public.posts (status, created_at desc);
create index if not exists posts_school_created_idx on public.posts (school_id, created_at desc);
create index if not exists posts_category_idx on public.posts (category_id);
create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists posts_popular_idx on public.posts (reaction_count desc, created_at desc) where status = 'approved';
create index if not exists posts_discussed_idx on public.posts (comment_count desc, created_at desc) where status = 'approved';
create index if not exists posts_search_idx on public.posts using gin (to_tsvector('simple', content));

create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_parent_idx on public.comments (parent_id);
create index if not exists comments_author_idx on public.comments (author_id, created_at desc);

create unique index if not exists reactions_one_per_post on public.reactions (user_id, post_id) where post_id is not null;
create unique index if not exists reactions_one_per_comment on public.reactions (user_id, comment_id) where comment_id is not null;
create index if not exists reactions_post_idx on public.reactions (post_id);
create index if not exists reactions_comment_idx on public.reactions (comment_id);

create index if not exists bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

create unique index if not exists reports_once_per_post on public.reports (reporter_id, post_id) where post_id is not null;
create unique index if not exists reports_once_per_comment on public.reports (reporter_id, comment_id) where comment_id is not null;
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_post_idx on public.reports (post_id);

create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);
create index if not exists logs_created_idx on public.moderation_logs (created_at desc);
create index if not exists logs_admin_idx on public.moderation_logs (admin_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. CORE FUNCTIONS
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

create or replace function public.post_is_public(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts where id = pid and status = 'approved')
$$;

-- Current plan, computed at read time so expiry is automatic and exact.
create or replace function public.effective_plan(uid uuid) returns public.subscription_plans
language sql stable security definer set search_path = public as $$
  select p.* from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = uid and s.status = 'active' and s.expires_at > now() and p.is_active
  order by p.price_php desc limit 1
$$;

create or replace function public.has_feature(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscription_features f
    where f.feature_key = k and f.plan_id = (public.effective_plan(uid)).id
  )
$$;

create or replace function public.free_daily_limit() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.website_settings where key = 'free_daily_post_limit'), 2)
$$;

-- Registration: profile is created from signUp() metadata
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, school_id, school_name, grade_level)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'username'),
    nullif(new.raw_user_meta_data->>'school_id','')::uuid,
    nullif(trim(new.raw_user_meta_data->>'school_name'),''),
    new.raw_user_meta_data->>'grade_level'
  );
  return new;
end $$;

-- THE ONLY WAY TO CREATE A POST. Enforces the daily limit inside the database.
create or replace function public.create_post(
  p_content text, p_category_id uuid, p_school_id uuid,
  p_is_anonymous boolean, p_image_path text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  plan public.subscription_plans;
  lim int;
  used int;
  new_status text;
  new_id uuid;
  clean text := trim(coalesce(p_content, ''));
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into prof from public.profiles where id = uid;
  if prof.id is null or prof.status <> 'active' then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  if coalesce((select (value #>> '{}')::boolean from public.website_settings where key = 'maintenance_mode'), false)
     and not public.is_admin() then
    raise exception 'MAINTENANCE';
  end if;

  if char_length(clean) = 0 then raise exception 'EMPTY_POST'; end if;
  if p_category_id is not null and not exists (select 1 from public.categories where id = p_category_id and is_active) then
    raise exception 'INVALID_CATEGORY';
  end if;
  p_school_id := coalesce(p_school_id, prof.school_id);
  if p_school_id is not null and not exists (select 1 from public.schools where id = p_school_id and is_active) then
    raise exception 'INVALID_SCHOOL';
  end if;
  if p_image_path is not null and p_image_path not like uid::text || '/%' then
    raise exception 'INVALID_IMAGE_PATH';
  end if;

  plan := public.effective_plan(uid);
  if plan.id is not null then lim := plan.daily_post_limit;   -- null = unlimited
  else lim := public.free_daily_limit();
  end if;

  -- row lock => two simultaneous requests cannot both slip past the limit
  insert into public.daily_post_usage (user_id, usage_date, post_count)
  values (uid, public.manila_today(), 0) on conflict do nothing;
  select post_count into used from public.daily_post_usage
   where user_id = uid and usage_date = public.manila_today() for update;

  if lim is not null and used >= lim then raise exception 'DAILY_LIMIT_REACHED'; end if;

  new_status := case when coalesce((select (value #>> '{}')::boolean from public.website_settings
                  where key = 'require_post_approval'), false) then 'pending' else 'approved' end;

  insert into public.posts (author_id, is_anonymous, school_id, category_id, content, image_path, status)
  values (uid, coalesce(p_is_anonymous, false), p_school_id, p_category_id, clean, p_image_path, new_status)
  returning id into new_id;

  update public.daily_post_usage set post_count = post_count + 1
   where user_id = uid and usage_date = public.manila_today();
  return new_id;
end $$;

-- Edit own post (subscriber feature 'edit_posts')
create or replace function public.update_my_post(p_post uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); clean text := trim(coalesce(p_content,''));
begin
  if uid is null or not public.is_active_user() then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_feature(uid, 'edit_posts') then raise exception 'FEATURE_REQUIRES_SUBSCRIPTION'; end if;
  if char_length(clean) not between 1 and 2000 then raise exception 'INVALID_CONTENT'; end if;
  update public.posts set content = clean,
         status = case when coalesce((select (value #>> '{}')::boolean from public.website_settings
                    where key = 'require_post_approval'), false) then 'pending' else status end
   where id = p_post and author_id = uid and status in ('pending','approved');
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Delete own post (allowed for everyone; does not refund the daily quota)
create or replace function public.delete_my_post(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.posts where id = p_post and author_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.delete_my_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.comments where id = p_comment and author_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- For the UI: "1/2 used today"
create or replace function public.my_post_quota() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); plan public.subscription_plans; lim int; used int;
begin
  if uid is null then return null; end if;
  plan := public.effective_plan(uid);
  if plan.id is not null then lim := plan.daily_post_limit; else lim := public.free_daily_limit(); end if;
  select post_count into used from public.daily_post_usage where user_id = uid and usage_date = public.manila_today();
  used := coalesce(used, 0);
  return jsonb_build_object('plan', coalesce(plan.code,'free'), 'limit', lim, 'used', used,
           'remaining', case when lim is null then null else greatest(lim - used, 0) end);
end $$;

-- For the UI: Free / Basic / Premium / Expired / Suspended
create or replace function public.my_subscription() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); pstat text; latest_status text; latest_expiry timestamptz;
        plan public.subscription_plans; exp timestamptz; sid uuid;
begin
  if uid is null then return null; end if;
  select status into pstat from public.profiles where id = uid;
  select status, expires_at into latest_status, latest_expiry from public.subscriptions
   where user_id = uid order by created_at desc limit 1;
  plan := public.effective_plan(uid);
  if plan.id is not null then
    select id, expires_at into sid, exp from public.subscriptions
     where user_id = uid and plan_id = plan.id and status = 'active' and expires_at > now()
     order by expires_at desc limit 1;
  end if;
  return jsonb_build_object(
    'status', case when pstat = 'suspended' then 'suspended'
                   when plan.id is not null then plan.code
                   when latest_status = 'expired' or (latest_status = 'active' and latest_expiry <= now()) then 'expired'
                   when latest_status = 'cancelled' then 'cancelled'
                   when latest_status = 'refunded' then 'refunded'
                   when latest_status = 'pending' then 'pending'
                   else 'free' end,
    'plan_name', plan.name, 'expires_at', exp, 'subscription_id', sid);
end $$;

create or replace function public.cancel_my_subscription(p_sub uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.subscriptions
     set status = 'cancelled'
   where id = p_sub and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND_OR_INACTIVE'; end if;
end $$;

-- Called by pg_cron (below). Not callable by clients.
create or replace function public.expire_subscriptions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.subscriptions set status = 'expired' where status = 'active' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 5. ADMIN FUNCTIONS (each checks is_admin() and writes moderation_logs)
-- ---------------------------------------------------------------------
create or replace function public.assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
end $$;

create or replace function public.admin_log(p_action text, p_type text, p_target text, p_reason text, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), p_action, p_type, p_target, p_reason, p_meta)
$$;

create or replace function public.admin_set_post_status(p_post uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_status not in ('pending','approved','rejected','flagged','hidden','removed') then raise exception 'INVALID_STATUS'; end if;
  update public.posts set status = p_status where id = p_post;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.admin_log('set_post_' || p_status, 'post', p_post::text, p_reason);
end $$;

create or replace function public.admin_set_comment_status(p_comment uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_status not in ('approved','hidden','removed') then raise exception 'INVALID_STATUS'; end if;
  update public.comments set status = p_status where id = p_comment;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.admin_log('set_comment_' || p_status, 'comment', p_comment::text, p_reason);
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_status not in ('active','suspended','banned') then raise exception 'INVALID_STATUS'; end if;
  if p_user = auth.uid() then raise exception 'CANNOT_MODIFY_SELF'; end if;
  update public.profiles set status = p_status where id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.admin_log('set_user_' || p_status, 'user', p_user::text, p_reason);
end $$;

create or replace function public.admin_activate_subscription(
  p_user uuid, p_plan_code text, p_request_id uuid default null, p_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare plan public.subscription_plans; sid uuid;
begin
  perform public.assert_admin();
  select * into plan from public.subscription_plans where code = p_plan_code and duration_days is not null;
  if plan.id is null then raise exception 'PLAN_NOT_FOUND'; end if;
  update public.subscriptions set status = 'cancelled' where user_id = p_user and status = 'active';
  if p_request_id is not null then
    update public.subscriptions
       set plan_id = plan.id, status = 'active', starts_at = now(),
           expires_at = now() + make_interval(days => plan.duration_days), verified_by = auth.uid()
     where id = p_request_id and user_id = p_user returning id into sid;
    if sid is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  else
    insert into public.subscriptions (user_id, plan_id, status, starts_at, expires_at, verified_by)
    values (p_user, plan.id, 'active', now(), now() + make_interval(days => plan.duration_days), auth.uid())
    returning id into sid;
  end if;
  perform public.admin_log('activate_' || plan.code, 'subscription', sid::text, p_reason,
                           jsonb_build_object('user_id', p_user, 'price_php', plan.price_php));
  return sid;
end $$;

create or replace function public.admin_extend_subscription(p_sub uuid, p_days int, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_days is null or p_days = 0 then raise exception 'INVALID_DAYS'; end if;
  update public.subscriptions
     set expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(days => p_days),
         status = 'active', starts_at = coalesce(starts_at, now()), verified_by = auth.uid()
   where id = p_sub and status in ('active','expired');
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.admin_log('extend_subscription', 'subscription', p_sub::text, p_reason, jsonb_build_object('days', p_days));
end $$;

create or replace function public.admin_cancel_subscription(p_sub uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.subscriptions
     set status = case when status = 'pending' then 'rejected' else 'cancelled' end
   where id = p_sub and status in ('pending','active');
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.admin_log('cancel_subscription', 'subscription', p_sub::text, p_reason);
end $$;

create or replace function public.admin_reset_daily_limit(p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.daily_post_usage where user_id = p_user and usage_date = public.manila_today();
  perform public.admin_log('reset_daily_limit', 'user', p_user::text, p_reason);
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text, p_action text default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_status not in ('pending','reviewing','resolved','dismissed') then raise exception 'INVALID_STATUS'; end if;
  update public.reports
     set status = p_status, action_taken = coalesce(p_action, action_taken),
         resolved_by = case when p_status in ('resolved','dismissed') then auth.uid() else resolved_by end
   where id = p_report;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.admin_log('report_' || p_status, 'report', p_report::text, p_reason, jsonb_build_object('action', p_action));
end $$;

-- The ONLY way to see who wrote an anonymous post. A reason is mandatory and it is always logged.
create or replace function public.admin_reveal_post_author(p_post uuid, p_reason text)
returns table (author_id uuid, username text, display_name text, anon_number bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if char_length(trim(coalesce(p_reason,''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  perform public.admin_log('reveal_anonymous_author', 'post', p_post::text, p_reason);
  return query
    select po.author_id, pr.username, pr.display_name, po.anon_number
    from public.posts po join public.profiles pr on pr.id = po.author_id where po.id = p_post;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; paid_basic int; paid_premium int; total_u int;
begin
  perform public.assert_admin();
  select count(*) into total_u from public.profiles;
  select count(distinct s.user_id) into paid_basic from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
   where s.status = 'active' and s.expires_at > now() and p.code = 'basic';
  select count(distinct s.user_id) into paid_premium from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
   where s.status = 'active' and s.expires_at > now() and p.code = 'premium';
  r := jsonb_build_object(
    'total_users', total_u,
    'active_users_30d', (select count(distinct a) from (
        select author_id a from public.posts where created_at > now() - interval '30 days'
        union select author_id from public.comments where created_at > now() - interval '30 days') x),
    'free_users', total_u - paid_basic - paid_premium,
    'basic_users', paid_basic,
    'premium_users', paid_premium,
    'total_posts', (select count(*) from public.posts),
    'posts_today', (select count(*) from public.posts where created_at >= (public.manila_today()::timestamp at time zone 'Asia/Manila')),
    'pending_posts', (select count(*) from public.posts where status = 'pending'),
    'reported_posts', (select count(distinct post_id) from public.reports where post_id is not null and status in ('pending','reviewing')),
    'removed_posts', (select count(*) from public.posts where status = 'removed'),
    'total_comments', (select count(*) from public.comments),
    'active_subscriptions', (select count(*) from public.subscriptions where status = 'active' and expires_at > now()),
    'expired_subscriptions', (select count(*) from public.subscriptions where status = 'expired'));
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 6. TRIGGERS
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update of content, status on public.posts
  for each row execute function public.set_updated_at();

-- comment validation + spam rate limit (max 10 comments / minute / user)
create or replace function public.comments_validate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null and not exists
     (select 1 from public.comments where id = new.parent_id and post_id = new.post_id) then
    raise exception 'INVALID_PARENT';
  end if;
  if (select count(*) from public.comments where author_id = new.author_id
        and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'RATE_LIMITED';
  end if;
  return new;
end $$;
drop trigger if exists comments_validate_trg on public.comments;
create trigger comments_validate_trg before insert on public.comments
  for each row execute function public.comments_validate();

-- keep denormalized counters accurate
create or replace function public.refresh_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; cid uuid;
begin
  if tg_table_name = 'reactions' then
    if tg_op = 'DELETE' then pid := old.post_id; cid := old.comment_id;
    else pid := new.post_id; cid := new.comment_id; end if;
    if pid is not null then
      update public.posts set reaction_count = (select count(*) from public.reactions where post_id = pid) where id = pid;
    end if;
    if cid is not null then
      update public.comments set reaction_count = (select count(*) from public.reactions where comment_id = cid) where id = cid;
    end if;
  else
    if tg_op = 'DELETE' then pid := old.post_id; else pid := new.post_id; end if;
    update public.posts set comment_count =
      (select count(*) from public.comments where post_id = pid and status = 'approved') where id = pid;
  end if;
  return null;
end $$;
drop trigger if exists reactions_counts_trg on public.reactions;
create trigger reactions_counts_trg after insert or update or delete on public.reactions
  for each row execute function public.refresh_counts();
drop trigger if exists comments_counts_trg on public.comments;
create trigger comments_counts_trg after insert or update of status or delete on public.comments
  for each row execute function public.refresh_counts();

-- notifications: comment / reply
create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare post_author uuid; parent_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
    if parent_author is not null and parent_author <> new.author_id then
      insert into public.notifications (user_id, type, message, link)
      values (parent_author, 'comment_reply', 'Someone replied to your comment.', '/wall/' || new.post_id);
    end if;
  end if;
  if post_author is not null and post_author <> new.author_id and post_author is distinct from parent_author then
    insert into public.notifications (user_id, type, message, link)
    values (post_author, 'new_comment', 'Someone commented on your post.', '/wall/' || new.post_id);
  end if;
  return null;
end $$;
drop trigger if exists comments_notify_trg on public.comments;
create trigger comments_notify_trg after insert on public.comments
  for each row execute function public.notify_on_comment();

-- notifications: post moderation result
create or replace function public.notify_on_post_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      insert into public.notifications (user_id, type, message, link)
      values (new.author_id, 'post_approved', 'Your post was approved.', '/wall/' || new.id);
    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, type, message)
      values (new.author_id, 'post_rejected', 'Your post was not approved. Please review the Community Guidelines.');
    elsif new.status in ('hidden','removed') then
      insert into public.notifications (user_id, type, message)
      values (new.author_id, 'post_removed', 'One of your posts was removed by moderators.');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists posts_notify_trg on public.posts;
create trigger posts_notify_trg after update of status on public.posts
  for each row execute function public.notify_on_post_status();

-- notifications: subscription activation / expiry
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
        '/subscription');
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
drop trigger if exists subscriptions_notify_trg on public.subscriptions;
create trigger subscriptions_notify_trg after update of status on public.subscriptions
  for each row execute function public.notify_on_subscription();

-- notifications: report outcome
create or replace function public.notify_on_report_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('resolved','dismissed') then
    insert into public.notifications (user_id, type, message)
    values (new.reporter_id, 'report_update', 'Your report has been reviewed. Thank you for helping keep CampusVoice safe.');
  end if;
  return null;
end $$;
drop trigger if exists reports_notify_trg on public.reports;
create trigger reports_notify_trg after update of status on public.reports
  for each row execute function public.notify_on_report_status();

-- auto-flag a post when 2 different people report it as a threat / doxxing
create or replace function public.reports_autoflag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.post_id is not null and new.reason in ('threat','doxxing') then
    if (select count(distinct reporter_id) from public.reports
         where post_id = new.post_id and reason in ('threat','doxxing')) >= 2 then
      update public.posts set status = 'flagged' where id = new.post_id and status = 'approved';
    end if;
  end if;
  return null;
end $$;
drop trigger if exists reports_autoflag_trg on public.reports;
create trigger reports_autoflag_trg after insert on public.reports
  for each row execute function public.reports_autoflag();

-- audit log for direct admin edits of config tables (price, duration, features, settings, schools...)
create or replace function public.log_admin_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  if auth.uid() is null or not public.is_admin() then return null; end if;
  rec := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into public.moderation_logs (admin_id, action, target_type, target_id, metadata)
  values (auth.uid(), lower(tg_op) || '_' || tg_table_name, tg_table_name,
          coalesce(rec->>'id', rec->>'key'),
          jsonb_build_object('new', to_jsonb(new), 'old', to_jsonb(old)));
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['subscription_plans','subscription_features','website_settings','schools','categories','announcements']
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.log_admin_change()', 'audit_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. VIEWS (anonymity lives here: author_id is never exposed publicly)
-- ---------------------------------------------------------------------
-- Refuse to replace a legacy table that still contains posts.
do $$
declare object_kind "char"; has_rows boolean;
begin
  select c.relkind into object_kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'public_posts';

  if object_kind in ('r', 'p') then
    execute 'select exists (select 1 from public.public_posts limit 1)' into has_rows;
    if has_rows then
      raise exception 'Legacy public.public_posts contains rows; migrate them before applying this schema.';
    end if;
    drop table public.public_posts;
  elsif object_kind is not null and object_kind <> 'v' then
    raise exception 'public.public_posts exists as an unsupported object; inspect it before applying this schema.';
  end if;
end $$;

create or replace view public.public_posts with (security_invoker = false) as
select p.id, p.created_at, p.content, p.image_path, p.school_id, p.category_id,
       p.reaction_count, p.comment_count, p.is_anonymous,
       case when p.is_anonymous then null else pr.username end     as username,
       case when p.is_anonymous then null else pr.display_name end as display_name,
       case when p.is_anonymous then null else pr.avatar_path end  as avatar_path
from public.posts p join public.profiles pr on pr.id = p.author_id
where p.status = 'approved' and pr.status <> 'banned';

create or replace view public.public_profiles with (security_invoker = false) as
select id, username, display_name, school_id, bio, avatar_path, created_at, school_name
from public.profiles
where status = 'active';

create or replace view public.my_comment_ids with (security_invoker = false) as
select id, post_id
from public.comments
where author_id = auth.uid();

create or replace view public.my_posts with (security_invoker = false) as
select id, created_at, content, status, is_anonymous, school_id, category_id
from public.posts where author_id = auth.uid();

create or replace view public.school_stats with (security_invoker = false) as
select s.id, s.name, s.location, s.description, s.logo_path,
       (select count(*) from public.profiles p where p.school_id = s.id and p.status = 'active') as user_count,
       (select count(*) from public.posts po where po.school_id = s.id and po.status = 'approved') as post_count
from public.schools s where s.is_active;

-- admin-only moderation queue (anonymous authors stay hidden; use admin_reveal_post_author)
create or replace view public.admin_posts with (security_invoker = false) as
select p.id, p.anon_number, p.created_at, p.content, p.image_path, p.status, p.is_anonymous,
       p.school_id, p.category_id, p.reaction_count, p.comment_count,
       case when p.is_anonymous then null else pr.username end as username,
       (select count(*) from public.reports r where r.post_id = p.id) as report_count
from public.posts p join public.profiles pr on pr.id = p.author_id
where public.is_admin();

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.schools enable row level security;
alter table public.categories enable row level security;
alter table public.website_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscription_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.moderation_logs enable row level security;
alter table public.daily_post_usage enable row level security;

-- Replace policies only on CampusVoice tables.
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'schools', 'categories', 'website_settings', 'profiles', 'admin_users',
        'subscription_plans', 'subscription_features', 'subscriptions', 'posts',
        'comments', 'reactions', 'bookmarks', 'reports', 'notifications',
        'announcements', 'moderation_logs', 'daily_post_usage'
      ])
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- public config
create policy schools_read on public.schools for select using (is_active or public.is_admin());
create policy schools_admin on public.schools for all using (public.is_admin()) with check (public.is_admin());
create policy categories_read on public.categories for select using (is_active or public.is_admin());
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy plans_read on public.subscription_plans for select using (is_active or public.is_admin());
create policy plans_admin on public.subscription_plans for all using (public.is_admin()) with check (public.is_admin());
create policy features_read on public.subscription_features for select using (true);
create policy features_admin on public.subscription_features for all using (public.is_admin()) with check (public.is_admin());
create policy settings_read on public.website_settings for select using (key not like 'private\_%' or public.is_admin());
create policy settings_admin on public.website_settings for all using (public.is_admin()) with check (public.is_admin());
create policy announcements_read on public.announcements for select using (is_published or public.is_admin());
create policy announcements_admin on public.announcements for all using (public.is_admin()) with check (public.is_admin());

-- profiles (status/id/created_at are not updatable by users; see column grants below)
create policy profiles_read on public.profiles for select
  using (status = 'active' or id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid() and status = 'active')
  with check (id = auth.uid() and status = 'active'
              and (avatar_path is null or avatar_path like auth.uid()::text || '/%'));

-- admin_users: NO policies => no client can read or write it
-- posts: NO policies and no grants => clients use create_post() and the views only

-- subscriptions (users may only file a clean pending request)
create policy subs_read on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy subs_request on public.subscriptions for insert
  with check (user_id = auth.uid() and status = 'pending' and starts_at is null
              and expires_at is null and verified_by is null and public.is_active_user());
create policy subs_cancel_pending on public.subscriptions for delete
  using (user_id = auth.uid() and status = 'pending');

-- comments
create policy comments_read on public.comments for select
  using ((status = 'approved' and public.post_is_public(post_id)) or author_id = auth.uid() or public.is_admin());
create policy comments_insert on public.comments for insert
  with check (author_id = auth.uid() and status = 'approved'
              and public.is_active_user() and public.post_is_public(post_id));
create policy comments_delete_own on public.comments for delete using (author_id = auth.uid());

-- reactions ("likes")
create policy reactions_read on public.reactions for select using (user_id = auth.uid() or public.is_admin());
create policy reactions_insert on public.reactions for insert
  with check (user_id = auth.uid() and public.is_active_user()
              and (comment_id is not null or public.post_is_public(post_id)));
create policy reactions_update on public.reactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (comment_id is not null or public.post_is_public(post_id)));
create policy reactions_delete on public.reactions for delete using (user_id = auth.uid());

-- bookmarks (subscriber feature 'bookmarks')
create policy bookmarks_read on public.bookmarks for select using (user_id = auth.uid());
create policy bookmarks_insert on public.bookmarks for insert
  with check (user_id = auth.uid() and public.has_feature(auth.uid(), 'bookmarks'));
create policy bookmarks_delete on public.bookmarks for delete using (user_id = auth.uid());

-- reports
create policy reports_insert on public.reports for insert
  with check (reporter_id = auth.uid() and public.is_active_user() and status = 'pending'
              and resolved_by is null and action_taken is null);
create policy reports_read on public.reports for select using (reporter_id = auth.uid() or public.is_admin());

-- notifications
create policy notifications_read on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

-- usage + audit trail
create policy usage_read on public.daily_post_usage for select using (user_id = auth.uid() or public.is_admin());
create policy logs_read on public.moderation_logs for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 9. GRANTS (defence in depth on top of RLS)
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on
  public.schools, public.categories, public.website_settings, public.profiles,
  public.admin_users, public.subscription_plans, public.subscription_features,
  public.subscriptions, public.posts, public.comments, public.reactions,
  public.bookmarks, public.reports, public.notifications, public.announcements,
  public.moderation_logs, public.daily_post_usage
from public, anon;
revoke truncate, references, trigger on
  public.schools, public.categories, public.website_settings, public.profiles,
  public.admin_users, public.subscription_plans, public.subscription_features,
  public.subscriptions, public.posts, public.comments, public.reactions,
  public.bookmarks, public.reports, public.notifications, public.announcements,
  public.moderation_logs, public.daily_post_usage
from public, authenticated;

revoke all on public.posts from public, anon, authenticated;
revoke all on public.admin_users from public, anon, authenticated;
revoke insert, update, delete on public.moderation_logs from authenticated;
revoke insert, update, delete on public.daily_post_usage from authenticated;
revoke update on public.subscriptions from authenticated;

revoke update on public.profiles from authenticated;
grant update (username, display_name, school_id, school_name, grade_level, bio, avatar_path) on public.profiles to authenticated;
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

revoke select on public.profiles from public, anon;
revoke select on public.comments from public, anon, authenticated;
grant select (id, post_id, parent_id, content, status, reaction_count, created_at)
  on public.comments to anon, authenticated;
revoke select on public.reactions from public, anon, authenticated;
grant select on public.reactions to authenticated;
revoke update, delete on public.comments from authenticated;

revoke all on public.public_posts, public.public_profiles, public.my_comment_ids,
  public.my_posts, public.school_stats, public.admin_posts from public, anon, authenticated;
grant select on public.public_posts, public.school_stats to anon, authenticated;
grant select on public.public_profiles to anon, authenticated;
grant select on public.my_comment_ids, public.my_posts, public.admin_posts to authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'manila_today', 'set_updated_at', 'is_admin', 'is_active_user',
        'post_is_public', 'effective_plan', 'has_feature', 'free_daily_limit',
        'handle_new_user', 'create_post', 'update_my_post', 'delete_my_post',
        'delete_my_comment', 'my_post_quota', 'my_subscription',
        'cancel_my_subscription',
        'expire_subscriptions', 'assert_admin', 'admin_log',
        'admin_set_post_status', 'admin_set_comment_status', 'admin_set_user_status',
        'admin_activate_subscription', 'admin_extend_subscription',
        'admin_cancel_subscription', 'admin_reset_daily_limit',
        'admin_resolve_report', 'admin_reveal_post_author', 'admin_stats',
        'comments_validate', 'refresh_counts', 'notify_on_comment',
        'notify_on_post_status', 'notify_on_subscription',
        'notify_on_report_status', 'reports_autoflag', 'log_admin_change'
      ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
  end loop;
end $$;

-- used inside RLS expressions, so every role needs to evaluate them
grant execute on function public.is_admin(), public.is_active_user(),
  public.post_is_public(uuid), public.has_feature(uuid, text) to anon, authenticated;
grant execute on function
  public.create_post(text, uuid, uuid, boolean, text),
  public.update_my_post(uuid, text),
  public.delete_my_post(uuid),
  public.delete_my_comment(uuid),
  public.my_post_quota(),
  public.my_subscription(),
  public.cancel_my_subscription(uuid),
  public.admin_stats(),
  public.admin_set_post_status(uuid, text, text),
  public.admin_set_comment_status(uuid, text, text),
  public.admin_set_user_status(uuid, text, text),
  public.admin_activate_subscription(uuid, text, uuid, text),
  public.admin_extend_subscription(uuid, int, text),
  public.admin_cancel_subscription(uuid, text),
  public.admin_reset_daily_limit(uuid, text),
  public.admin_resolve_report(uuid, text, text, text),
  public.admin_reveal_post_author(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 10. STORAGE (avatars, school logos, post images) — skipped with a notice if not permitted
-- ---------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('avatars',      'avatars',      true, 2097152, array['image/jpeg','image/png','image/webp']),
    ('school-logos', 'school-logos', true, 2097152, array['image/jpeg','image/png','image/webp']),
    ('post-images',  'post-images',  true, 3145728, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = excluded.public,
    file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists cv_public_read on storage.objects;
  drop policy if exists cv_avatar_insert on storage.objects;
  drop policy if exists cv_avatar_delete on storage.objects;
  drop policy if exists cv_post_image_insert on storage.objects;
  drop policy if exists cv_post_image_delete on storage.objects;
  drop policy if exists cv_school_logo_admin on storage.objects;

  create policy cv_public_read on storage.objects for select
    using (bucket_id in ('avatars','school-logos','post-images'));

  -- avatar upload requires the 'custom_avatar' feature (Basic/Premium); files live in /<user id>/...
  create policy cv_avatar_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
                and public.has_feature(auth.uid(), 'custom_avatar'));
  create policy cv_avatar_delete on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy cv_post_image_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text
                and public.is_active_user());
  create policy cv_post_image_delete on storage.objects for delete to authenticated
    using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy cv_school_logo_admin on storage.objects for all to authenticated
    using (bucket_id = 'school-logos' and public.is_admin())
    with check (bucket_id = 'school-logos' and public.is_admin());
exception when others then
  raise notice 'Storage setup skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 11. SEED DATA (DEMO — edit or replace from the Admin dashboard)
-- ---------------------------------------------------------------------
insert into public.subscription_plans (code, name, description, price_php, duration_days, daily_post_limit, badge_label, sort_order) values
  ('free',    'Free',    'Basic account features',                          0,  null, null, null,      0),
  ('basic',   'Basic',   'Unlimited posting and profile customization',    59,  14,   null, 'Basic',   1),
  ('premium', 'Premium', 'Everything in Basic plus premium perks',         82,  30,   null, 'Premium', 2)
on conflict (code) do nothing;

insert into public.subscription_features (plan_id, label, feature_key, sort_order)
select p.id, v.label, v.fkey, v.ord
from public.subscription_plans p
join (values
  ('free',    'Post up to the daily free limit', null,              1),
  ('free',    'Comments and reactions',          null,              2),
  ('basic',   'Unlimited posts',                 null,              1),
  ('basic',   'Anonymous and personal posting',  null,              2),
  ('basic',   'Custom profile avatar / logo',    'custom_avatar',   3),
  ('basic',   'Save / bookmark posts',           'bookmarks',       4),
  ('basic',   'Edit your own posts',             'edit_posts',      5),
  ('basic',   'Basic subscriber badge',          null,              6),
  ('premium', 'Everything in Basic',             null,              1),
  ('premium', 'Unlimited posts',                 null,              2),
  ('premium', 'Custom profile avatar / logo',    'custom_avatar',   3),
  ('premium', 'Save / bookmark posts',           'bookmarks',       4),
  ('premium', 'Edit your own posts',             'edit_posts',      5),
  ('premium', 'Exclusive themes',                'premium_themes',  6),
  ('premium', 'Featured profile option',         'featured_profile',7),
  ('premium', 'Premium badge',                   null,              8)
) as v(code, label, fkey, ord) on v.code = p.code
where not exists (select 1 from public.subscription_features f where f.plan_id = p.id);

insert into public.website_settings (key, value) values
  ('site_name',             '"CampusVoice"'),
  ('tagline',               '"Your Voice. Your Space. Your Story."'),
  ('free_daily_post_limit', '2'),
  ('require_post_approval', 'false'),
  ('maintenance_mode',      'false')
on conflict (key) do nothing;

insert into public.categories (name, sort_order) values
  ('Rant',1),('Confession',2),('Question',3),('Advice',4),('Experience',5),
  ('Appreciation',6),('Achievement',7),('School Life',8),('Random Thoughts',9),('Other',10)
on conflict (name) do nothing;

insert into public.schools (name, location, description) values
  ('Demo School A', 'Demo City', 'SAMPLE DATA - replace in Admin'),
  ('Demo School B', 'Demo City', 'SAMPLE DATA - replace in Admin')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 12. AUTO-EXPIRE SUBSCRIPTIONS (pg_cron; skipped with a notice if unavailable)
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'campusvoice-expire-subscriptions';
  perform cron.schedule('campusvoice-expire-subscriptions', '*/15 * * * *', 'select public.expire_subscriptions()');
exception when others then
  raise notice 'pg_cron not enabled; expiry still works at read time. (%)', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 13. CREATE YOUR FIRST ADMIN (run manually AFTER registering normally)
-- ---------------------------------------------------------------------
-- insert into public.admin_users (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;