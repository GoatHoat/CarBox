-- ============================================================
-- CarBox — Storage policies for the `photos` bucket
-- Run in Supabase → SQL Editor AFTER creating a bucket named `photos`.
-- Lets a logged-in user upload/update/delete ONLY inside their own
-- folder (photos/<their-user-id>/...), while anyone can read (public bucket).
-- Paths are: photos/${userId}/${carId}/${entryId}/filename
-- ============================================================

-- anyone can read objects in the photos bucket (public garages / sharing)
create policy "photos public read"
  on storage.objects for select
  using (bucket_id = 'photos');

-- a logged-in user can upload only under their own user-id folder
create policy "photos own upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- a logged-in user can update/delete only their own files
create policy "photos own update"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos own delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
