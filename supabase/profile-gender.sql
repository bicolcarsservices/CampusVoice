-- Run in Supabase SQL Editor to add private male/female gender to profiles.
alter table public.profiles
  add column if not exists gender text;

alter table public.profiles
  drop constraint if exists profiles_gender_check;

alter table public.profiles
  add constraint profiles_gender_check
  check (gender in ('male', 'female'));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles
    (id, username, display_name, gender, school_id, school_name, grade_level)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'username'),
    nullif(new.raw_user_meta_data->>'gender',''),
    nullif(new.raw_user_meta_data->>'school_id','')::uuid,
    nullif(trim(new.raw_user_meta_data->>'school_name'),''),
    new.raw_user_meta_data->>'grade_level'
  );
  return new;
end $$;

revoke update on public.profiles from authenticated;
grant update (username, display_name, gender, school_id, school_name, grade_level, bio, avatar_path)
  on public.profiles to authenticated;
