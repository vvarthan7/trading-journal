-- Run after trade_charges.sql.
--
-- The whole site is now behind sign-in, and journal_entries was the one table anyone could read
-- (its select policy was `using (true)`, created in the SQL editor with no file here). Hiding the
-- UI is not enough: the publishable key ships in the browser bundle, so a stranger could still
-- query the table directly. This makes it owner-only, like trades and everything hanging off it.
--
-- Every existing SELECT policy is dropped by looking it up, because the original's name was never
-- recorded. Re-running the file is safe: it drops and recreates the owner-only policy too.

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'journal_entries' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.journal_entries', p.policyname);
  end loop;
end $$;

create policy "journal_entries: owner reads"
  on public.journal_entries for select
  using (user_id = auth.uid());
