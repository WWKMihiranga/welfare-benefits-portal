-- =============================================================================
-- Migration 0003 — Storage
--
-- Bill scans and supporting documents live in a PRIVATE storage bucket.
-- Files are NOT publicly accessible — every read goes through a signed URL
-- that we generate server-side after verifying the user has access to the
-- parent claim.
--
-- Storage paths follow a convention so RLS policies can check ownership
-- by parsing the path:
--   {family_unit_id}/{claim_id}/{file_name}
--
-- This way the storage layer can enforce access independently of the
-- claims table, providing defense in depth.
-- =============================================================================

-- Create the private bucket (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claim-documents',
  'claim-documents',
  false,                                     -- NOT public — signed URLs only
  10 * 1024 * 1024,                          -- 10 MB max per file
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies — these live on storage.objects, not on our tables.

-- A user can SELECT (download) files in their own family unit's folder,
-- admins can access everything.
create policy "claim_documents_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'claim-documents'
    and (
      (storage.foldername(name))[1] = (select public.current_user_family_unit_id())::text
      or (select public.is_admin())
    )
  );

-- A user can INSERT (upload) files only into their own family unit's folder.
create policy "claim_documents_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'claim-documents'
    and (
      (storage.foldername(name))[1] = (select public.current_user_family_unit_id())::text
      or (select public.is_admin())
    )
  );

-- Only admins can delete or modify files (claims are immutable; if a
-- document needs replacement, an admin handles it explicitly).
create policy "claim_documents_storage_admin_modify"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'claim-documents' and (select public.is_admin()))
  with check (bucket_id = 'claim-documents' and (select public.is_admin()));

create policy "claim_documents_storage_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'claim-documents' and (select public.is_admin()));
