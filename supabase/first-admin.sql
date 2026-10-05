-- Run this in the Supabase SQL Editor for the same project used by CampusVoice.
-- It fails clearly if the email has not registered in this Supabase project.
do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('ljerikodeguzman@gmail.com')
  limit 1;

  if target_user_id is null then
    raise exception 'No account found for ljerikodeguzman@gmail.com. Check Authentication > Users and update the email in this script.';
  end if;

  insert into public.admin_users (user_id, role)
  values (target_user_id, 'admin')
  on conflict (user_id) do update set role = 'admin';
end
$$;

select u.email, a.role
from public.admin_users a
join auth.users u on u.id = a.user_id
where lower(u.email) = lower('ljerikodeguzman@gmail.com');
