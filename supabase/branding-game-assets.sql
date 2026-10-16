-- Public logo buckets for administrator-managed auth branding and game art.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('brand-assets', 'brand-assets', true, 2097152, array['image/jpeg','image/png','image/webp']),
  ('game-logos', 'game-logos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cv_brand_game_logo_public_read on storage.objects;
create policy cv_brand_game_logo_public_read on storage.objects for select
  using (bucket_id in ('brand-assets', 'game-logos'));

drop policy if exists cv_brand_game_logo_admin_write on storage.objects;
create policy cv_brand_game_logo_admin_write on storage.objects for all to authenticated
  using (bucket_id in ('brand-assets', 'game-logos') and public.is_admin())
  with check (bucket_id in ('brand-assets', 'game-logos') and public.is_admin());
