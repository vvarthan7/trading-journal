-- Chart screenshots for a trade, held in Supabase Storage rather than in a table.
--
-- Run this in the Supabase SQL editor. Like trades.sql, this file is the record of what was
-- run, not a migration anything applies automatically.
--
-- MODEL
-- There is no `trade_screenshots` table. A trade's shots are simply the objects under
--
--   trade-screenshots/{user_id}/{trade_id}/{uuid}.{ext}
--
-- so listing a trade's screenshots is a folder listing and there is nothing to keep in step with
-- the `trades` row. The trade id is the folder name, and the owner is the first path segment —
-- which is what every policy below checks.
--
-- The bucket is PRIVATE, for the same reason trades has no public select policy: the
-- publishable key ships inside the browser bundle, so a public bucket would put screenshots of a
-- live trading account on the open internet. The app reads them through short-lived signed URLs.
--
-- NOT HANDLED HERE: deleting a trades row does not delete its folder. Nothing deletes trades
-- today (there is no UI for it), so the orphan case cannot arise yet.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trade-screenshots',
  'trade-screenshots',
  false,
  8388608, -- 8 MB, comfortably above a full-screen PNG
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- storage.objects already has RLS enabled by Supabase; these policies scope this one bucket to
-- the folder named after the signed-in user. `(storage.foldername(name))[1]` is the first path
-- segment, so a request can only ever touch its own subtree.
-- ---------------------------------------------------------------------------
drop policy if exists "trade shots owner read"   on storage.objects;
drop policy if exists "trade shots owner insert" on storage.objects;
drop policy if exists "trade shots owner update" on storage.objects;
drop policy if exists "trade shots owner delete" on storage.objects;

create policy "trade shots owner read"
  on storage.objects for select
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "trade shots owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Upsert needs update as well as insert: re-uploading over a name replaces the object.
create policy "trade shots owner update"
  on storage.objects for update
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "trade shots owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
