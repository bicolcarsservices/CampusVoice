-- Run this in the Supabase SQL Editor for the same project used by CampusVoice.
-- It fails clearly if an email has not registered in this Supabase project.
-- Existing admins are kept; this only inserts/updates the listed accounts.
do $$
declare
  admin_email text;
  target_user_id uuid;
  admin_emails text[] := array[
    'ljerikodeguzman@gmail.com',
    'lanceblanco262@gmail.com'
  ];
begin
  foreach admin_email in array admin_emails loop
    select id into target_user_id
    from auth.users
    where lower(email) = lower(admin_email)
    limit 1;

    if target_user_id is null then
      raise exception 'No account found for %. Check Authentication > Users and make sure that email has registered first.', admin_email;
    end if;

    insert into public.admin_users (user_id, role)
    values (target_user_id, 'admin')
    on conflict (user_id) do update set role = 'admin';
  end loop;
end
$$;

select u.email, a.role
from public.admin_users a
join auth.users u on u.id = a.user_id
where lower(u.email) in (
  lower('ljerikodeguzman@gmail.com'),
  lower('lanceblanco262@gmail.com')
)
order by u.email;
