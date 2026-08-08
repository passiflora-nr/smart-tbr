-- Local-only fixture for browse-TBR manual verification (never apply to production).
-- Opt-in: load with psql against the local stack; not in db.seed.sql_paths.

-- User C
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
  'c0000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'user-c@example.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
)
on conflict (id) do nothing;

-- User C books (25 rows for browse-TBR verification)
insert into public.books (id, user_id, title, author, tropes, description, created_at)
values
  (
    'c1000001-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'Red, White & Royal Blue',
    'Casey McQuiston',
    array['enemies to lovers', 'forced proximity', 'royalty', 'secret relationship'],
    'The First Son of the United States and the Prince of Wales stage a truce for the cameras and fall for each other off them.',
    now() - interval '1 day' * 1
  ),
  (
    'c1000002-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000001',
    'The Song of Achilles',
    'Madeline Miller',
    array['childhood friends to lovers', 'slow burn', 'mythology retelling', 'tragic ending'],
    'Patroclus narrates a lifetime beside Achilles, from exiled boyhood to the beach at Troy.',
    now() - interval '1 day' * 2
  ),
  (
    'c1000003-0000-4000-8000-000000000003',
    'c0000000-0000-4000-8000-000000000001',
    'Call Me by Your Name',
    'André Aciman',
    array['summer romance', 'first love', 'age gap', 'coming of age'],
    'A teenager and his father''s visiting scholar circle each other through one Italian summer.',
    now() - interval '1 day' * 3
  ),
  (
    'c1000004-0000-4000-8000-000000000004',
    'c0000000-0000-4000-8000-000000000001',
    'Boyfriend Material',
    'Alexis Hall',
    array['fake dating', 'grumpy sunshine', 'opposites attract', 'British humour'],
    'A tabloid-battered disaster needs a respectable boyfriend, and the most respectable man in London agrees to pretend.',
    now() - interval '1 day' * 4
  ),
  (
    'c1000005-0000-4000-8000-000000000005',
    'c0000000-0000-4000-8000-000000000001',
    'Husband Material',
    'Alexis Hall',
    array['established couple', 'marriage plot', 'found family', 'wedding season'],
    'Three weddings later, a couple who never planned to marry has to work out what they actually want.',
    now() - interval '1 day' * 5
  ),
  (
    'c1000006-0000-4000-8000-000000000006',
    'c0000000-0000-4000-8000-000000000001',
    'Heartstopper: Volume One',
    'Alice Oseman',
    array['friends to lovers', 'coming out', 'sweet romance', 'school setting'],
    'A quiet sixth-former and the rugby player who sits next to him edge from friendship into something else.',
    now() - interval '1 day' * 6
  ),
  (
    'c1000007-0000-4000-8000-000000000007',
    'c0000000-0000-4000-8000-000000000001',
    'Simon vs. the Homo Sapiens Agenda',
    'Becky Albertalli',
    array['epistolary', 'secret identity', 'coming out', 'high school'],
    null,
    now() - interval '1 day' * 7
  ),
  (
    'c1000008-0000-4000-8000-000000000008',
    'c0000000-0000-4000-8000-000000000001',
    'They Both Die at the End',
    'Adam Silvera',
    array['one-day romance', 'tragic ending', 'found family', 'insta-connection'],
    'Two strangers get the call that today is their last, and spend it together.',
    now() - interval '1 day' * 8
  ),
  (
    'c1000009-0000-4000-8000-000000000009',
    'c0000000-0000-4000-8000-000000000001',
    'Cemetery Boys',
    'Aiden Thomas',
    array['ghost romance', 'trans protagonist', 'magic', 'slow burn'],
    'A trans brujo summons the wrong ghost and can''t bring himself to send him on.',
    now() - interval '1 day' * 9
  ),
  (
    'c1000010-0000-4000-8000-000000000010',
    'c0000000-0000-4000-8000-000000000001',
    'The Charm Offensive',
    'Alison Cochrun',
    array['reality TV', 'opposites attract', 'hurt/comfort', 'slow burn'],
    'The star of a dating show falls for the producer paid to make him fall for someone else.',
    now() - interval '1 day' * 10
  ),
  (
    'c1000011-0000-4000-8000-000000000011',
    'c0000000-0000-4000-8000-000000000001',
    'Winter''s Orbit',
    'Everina Maxwell',
    array['arranged marriage', 'political intrigue', 'slow burn', 'sci-fi romance'],
    'A frivolous prince is married off to a grieving diplomat to hold a treaty together.',
    now() - interval '1 day' * 11
  ),
  (
    'c1000012-0000-4000-8000-000000000012',
    'c0000000-0000-4000-8000-000000000001',
    'Carry On',
    'Rainbow Rowell',
    array['enemies to lovers', 'chosen one', 'roommates', 'magic school'],
    'The worst Chosen One in history spends his last year at magic school sharing a room with his nemesis.',
    now() - interval '1 day' * 11
  ),
  (
    'c1000013-0000-4000-8000-000000000013',
    'c0000000-0000-4000-8000-000000000001',
    'Wayward Son',
    'Rainbow Rowell',
    array['road trip', 'established couple', 'hurt/comfort', 'post-canon'],
    'After the prophecy is over, a road trip across America goes badly wrong.',
    now() - interval '1 day' * 13
  ),
  (
    'c1000014-0000-4000-8000-000000000014',
    'c0000000-0000-4000-8000-000000000001',
    'The Foxhole Court',
    'Nora Sakavic',
    array['sports romance', 'enemies to lovers', 'found family', 'hurt/comfort'],
    'A runaway with a false name joins a college team built entirely out of other people''s disasters.',
    now() - interval '1 day' * 14
  ),
  (
    'c1000015-0000-4000-8000-000000000015',
    'c0000000-0000-4000-8000-000000000001',
    'Captive Prince',
    'C. S. Pacat',
    array['enemies to lovers', 'slow burn', 'captivity', 'political intrigue'],
    null,
    now() - interval '1 day' * 15
  ),
  (
    'c1000016-0000-4000-8000-000000000016',
    'c0000000-0000-4000-8000-000000000001',
    'Prince''s Gambit',
    'C. S. Pacat',
    array['forced proximity', 'slow burn', 'war campaign', 'mutual pining'],
    'A campaign north puts a captive prince and his captor on the same side of a battlefield.',
    now() - interval '1 day' * 16
  ),
  (
    'c1000017-0000-4000-8000-000000000017',
    'c0000000-0000-4000-8000-000000000001',
    'Kings Rising',
    'C. S. Pacat',
    array['royalty', 'mutual pining', 'political intrigue', 'hidden identity'],
    'Two kings with every reason to destroy each other choose an alliance instead.',
    now() - interval '1 day' * 17
  ),
  (
    'c1000018-0000-4000-8000-000000000018',
    'c0000000-0000-4000-8000-000000000001',
    'Aristotle and Dante Discover the Secrets of the Universe',
    'Benjamin Alire Sáenz',
    array['friends to lovers', 'coming of age', 'slow burn', 'literary'],
    'Aristotle Mendoza is an angry teen with a brother in prison when Dante Quintana moves in across the street one summer in El Paso. The two boys could not be more different — Dante is confident, curious, and open in ways Ari cannot fathom — yet they become inseparable, swimming and talking about everything and nothing until the desert heat feels like the only constant. When Dante leaves for Chicago and returns changed, and when a violent accident forces both families to confront what they have been avoiding, Ari must decide whether he can name the feeling that has been building inside him for years. Set against the backdrop of the late eighties on the Texas–Mexico border, this is a story about identity, family silence, and the terrifying freedom of discovering who you are when no one has shown you how. Benjamin Alire Sáenz writes in spare, luminous prose that captures the ache of adolescence and the particular loneliness of boys who do not yet have words for what they feel. Every scene between Ari and Dante — the swimming lessons, the rainstorm, the letters across the miles — carries the weight of a first love that neither boy is ready to claim. The novel asks what it means to be Mexican American, what it means to be a son, and what it means to risk everything for the person who sees you clearly for the first time. It is funny and devastating in equal measure, a book that stays with you long after the last page because it understands that some secrets are not shameful — they are just waiting for the right moment to be spoken aloud. Readers who come to Smart TBR with this title are often looking for the slow burn of a friendship that becomes something more, and this description is deliberately long to test that the browse page clamps overflowing text rather than letting a single row dominate the entire list view when a user has dozens of books to scan through at once.',
    now() - interval '1 day' * 18
  ),
  (
    'c1000019-0000-4000-8000-000000000019',
    'c0000000-0000-4000-8000-000000000001',
    'What If It''s Us',
    'Becky Albertalli and Adam Silvera',
    array['meet cute', 'missed connections', 'first love', 'dual POV'],
    'A New York post office meet-cute, then a whole summer spent trying to make a second chance work.',
    now() - interval '1 day' * 19
  ),
  (
    'c1000020-0000-4000-8000-000000000020',
    'c0000000-0000-4000-8000-000000000001',
    'Under the Whispering Door',
    'TJ Klune',
    array['grumpy sunshine', 'afterlife', 'found family', 'slow burn'],
    'A dead lawyer refuses to cross over and falls for the ferryman running the tea shop.',
    now() - interval '1 day' * 20
  ),
  (
    'c1000021-0000-4000-8000-000000000021',
    'c0000000-0000-4000-8000-000000000001',
    'Wolfsong',
    'TJ Klune',
    array['fated mates', 'werewolves', 'found family', 'slow burn'],
    'A boy with a stammer meets the wolf who becomes his whole vocabulary.',
    now() - interval '1 day' * 21
  ),
  (
    'c1000022-0000-4000-8000-000000000022',
    'c0000000-0000-4000-8000-000000000001',
    'Him',
    'Sarina Bowen and Elle Kennedy',
    array['sports romance', 'friends to lovers', 'bisexual awakening', 'summer camp'],
    'Two hockey players share a coaching job at the camp where everything went wrong between them.',
    now() - interval '1 day' * 22
  ),
  (
    'c1000023-0000-4000-8000-000000000023',
    'c0000000-0000-4000-8000-000000000001',
    'Heated Rivalry',
    'Rachel Reid',
    array['rivals to lovers', 'secret relationship', 'hockey', 'slow burn'],
    'Two rival NHL stars spend years pretending their hotel rooms mean nothing.',
    now() - interval '1 day' * 23
  ),
  (
    'c1000024-0000-4000-8000-000000000024',
    'c0000000-0000-4000-8000-000000000001',
    'The Magpie Lord',
    'K. J. Charles',
    array['historical', 'paranormal', 'class difference', 'magic'],
    'A reluctant earl hires a magician to work out who keeps trying to kill him.',
    now() - interval '1 day' * 24
  ),
  (
    'c1000025-0000-4000-8000-000000000025',
    'c0000000-0000-4000-8000-000000000001',
    'The Gentleman''s Guide to Vice and Virtue',
    'Mackenzi Lee',
    array['historical', 'road trip', 'pining', 'disaster bisexual'],
    null,
    now() - interval '1 day' * 25
  )
on conflict (id) do nothing;
