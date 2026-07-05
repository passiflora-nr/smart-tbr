-- F-01: books table with owner-scoped RLS
create extension if not exists moddatetime schema extensions;

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  author text not null,
  tropes text[] not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint title_nonempty check (length(trim(title)) > 0),
  constraint author_nonempty check (length(trim(author)) > 0),
  constraint tropes_nonempty check (cardinality(tropes) >= 1),
  constraint tropes_no_blanks check (
    array_position(tropes, null) is null
    and array_position(tropes, '') is null
  )
);

create index books_tropes_gin_idx on public.books using gin (tropes);
create index books_user_id_idx on public.books (user_id);

create trigger books_updated_at
before update on public.books
for each row
execute function extensions.moddatetime (updated_at);

alter table public.books enable row level security;

create policy "Users can select own books"
on public.books
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own books"
on public.books
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own books"
on public.books
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own books"
on public.books
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.books to authenticated;
revoke all on public.books from anon;
