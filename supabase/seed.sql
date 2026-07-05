-- Local-only fixtures for RLS verification and Studio inspection (never apply to production).

-- User A
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'a0000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'user-a@example.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
)
on conflict (id) do nothing;

-- User B
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'b0000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'user-b@example.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
)
on conflict (id) do nothing;

-- User A books (6 rows, overlapping tropes for downstream S-05 inspection)
insert into public.books (id, user_id, title, author, tropes, description)
values
  (
    'a1000001-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'The Hating Game',
    'Sally Thorne',
    array['enemies-to-lovers', 'workplace romance'],
    'Rivalry turns to romance in a shared office.'
  ),
  (
    'a1000002-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'Beach Read',
    'Emily Henry',
    array['enemies-to-lovers', 'contemporary'],
    'Writers swap genres for the summer.'
  ),
  (
    'a1000003-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'The House in the Cerulean Sea',
    'TJ Klune',
    array['found family', 'cozy fantasy'],
    'A caseworker visits a magical orphanage.'
  ),
  (
    'a1000004-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    'Fourth Wing',
    'Rebecca Yarros',
    array['romantasy', 'slow burn'],
    'Dragon rider training with deadly stakes.'
  ),
  (
    'a1000005-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001',
    'Red White and Royal Blue',
    'Casey McQuiston',
    array['contemporary', 'forced proximity'],
    'First son falls for a British prince.'
  ),
  (
    'a1000006-0000-4000-8000-000000000006',
    'a0000000-0000-4000-8000-000000000001',
    'The Seven Husbands of Evelyn Hugo',
    'Taylor Jenkins Reid',
    array['historical', 'slow burn'],
    'A reclusive star tells her life story.'
  )
on conflict (id) do nothing;

-- User B books (6 rows, tropes overlap with User A for mood-matching fixtures)
insert into public.books (id, user_id, title, author, tropes, description)
values
  (
    'b1000001-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'People We Meet on Vacation',
    'Emily Henry',
    array['enemies-to-lovers', 'second chance'],
    'Exes reunite on annual trips.'
  ),
  (
    'b1000002-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    'The Song of Achilles',
    'Madeline Miller',
    array['slow burn', 'historical'],
    'Patroclus narrates his bond with Achilles.'
  ),
  (
    'b1000003-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000001',
    'Legends and Lattes',
    'Travis Baldree',
    array['cozy fantasy', 'found family'],
    'An orc opens a coffee shop.'
  ),
  (
    'b1000004-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000001',
    'A Court of Thorns and Roses',
    'Sarah J. Maas',
    array['romantasy', 'enemies-to-lovers'],
    'Fae courts, curses, and retellings.'
  ),
  (
    'b1000005-0000-4000-8000-000000000005',
    'b0000000-0000-4000-8000-000000000001',
    'Book Lovers',
    'Emily Henry',
    array['workplace romance', 'contemporary'],
    'Rival literary agents in a small town.'
  ),
  (
    'b1000006-0000-4000-8000-000000000006',
    'b0000000-0000-4000-8000-000000000001',
    'The Invisible Life of Addie LaRue',
    'V.E. Schwab',
    array['historical', 'slow burn'],
    'A woman cursed to be forgotten by everyone she meets.'
  )
on conflict (id) do nothing;
