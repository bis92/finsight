insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

create policy "uploads_storage_select_own"
  on storage.objects
  for select
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "uploads_storage_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "uploads_storage_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
