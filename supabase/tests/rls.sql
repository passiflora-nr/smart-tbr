-- FR-011 isolation proof: cross-account access denied, owner access works.
-- Run: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--
-- UUIDs and the expected count are hardcoded inline: psql does not
-- interpolate :variables inside dollar-quoted (do $$ ... $$) blocks,
-- which is where the fixtures are used. Keep seed.sql UUIDs in sync.

-- User B cannot read User A's books
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  if auth.uid() is distinct from 'b0000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'auth.uid() mismatch: got %', auth.uid();
  end if;
end $$;

do $$
declare
  n int;
begin
  select count(*) into n from public.books where user_id = 'a0000000-0000-4000-8000-000000000001'::uuid;
  if n != 0 then
    raise exception 'User B read User A books: expected 0 rows, got %', n;
  end if;
end $$;

rollback;

-- User B cannot update User A's books
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  n int;
begin
  update public.books
  set title = 'hacked'
  where user_id = 'a0000000-0000-4000-8000-000000000001'::uuid;
  get diagnostics n = row_count;
  if n != 0 then
    raise exception 'User B update User A books: expected 0 rows, got %', n;
  end if;
end $$;

rollback;

-- User B cannot delete User A's books
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  n int;
begin
  delete from public.books
  where user_id = 'a0000000-0000-4000-8000-000000000001'::uuid;
  get diagnostics n = row_count;
  if n != 0 then
    raise exception 'User B delete User A books: expected 0 rows, got %', n;
  end if;
end $$;

rollback;

-- User B cannot insert a book owned by User A
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  insert into public.books (user_id, title, author, tropes)
  values (
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'Cross-account insert',
    'Attacker',
    array['intrusion']
  );
  raise exception 'User B insert for User A should have been rejected by RLS';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlstate = '42501' or sqlerrm like '%row-level security%' then
      null;
    else
      raise;
    end if;
end $$;

rollback;

-- User A sees exactly their own books (RLS is not over-denying)
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  if auth.uid() is distinct from 'a0000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'auth.uid() mismatch: got %', auth.uid();
  end if;
end $$;

do $$
declare
  n int;
begin
  select count(*) into n from public.books;
  if n != 6 then
    raise exception 'User A own books: expected 6 rows, got %', n;
  end if;
end $$;

do $$
declare
  n int;
begin
  select count(*) into n from public.books where user_id = 'b0000000-0000-4000-8000-000000000001'::uuid;
  if n != 0 then
    raise exception 'User A read User B books: expected 0 rows, got %', n;
  end if;
end $$;

rollback;
