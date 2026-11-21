-- ============================================================================
-- 180news Newsroom CMS: database tables
-- ============================================================================
-- Creates every table the CMS reads and writes, the two storage buckets it
-- uploads to, and the few starting rows it expects.
-- Written for Supabase (PostgreSQL 15 or newer).
--
-- HOW TO RUN IT
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   It is safe to run more than once. The table shown at the end lists what
--   is in place.
--
-- WHAT IT DOES TO TABLES YOU ALREADY HAVE
--   * A table that already fits is left exactly as it is, rows included.
--   * A table with one of these names that does NOT fit (a column is missing
--     or has the wrong type) is renamed to <name>_old and a correct, empty
--     one is made in its place. Nothing is deleted. This is the fix when the
--     CMS reports errors such as "column sections.label does not exist".
--   * Tables with any other name are not touched.
--
-- TWO THINGS THAT ARE NOT TABLES
--   * Team (users and roles): each person is a Supabase sign-in account,
--     listed under Authentication > Users. Their role is kept on the account
--     itself, where only the CMS server can change it.
--   * Analytics: worked out from the article_views table. One row per read.
--
-- ON A NEW SUPABASE PROJECT, AFTER RUNNING THIS
--   1. Authentication > Users > Add user, with "Auto Confirm User" ticked.
--      The account that was created first becomes the owner when it signs in
--      to the CMS. Add everyone else from Users and roles inside the CMS.
--   2. Give the CMS host (for example Vercel) these three settings from
--      Project Settings > API, then deploy again:
--        NEXT_PUBLIC_SUPABASE_URL
--        NEXT_PUBLIC_SUPABASE_ANON_KEY
--        SUPABASE_SERVICE_ROLE_KEY   (secret: server only, never in a page)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Move aside any table of the same name that does not fit
-- ----------------------------------------------------------------------------
-- Compares each existing table with the columns the CMS needs. One that does
-- not match is kept under a new name (<name>_old) so the correct one can be
-- created below. Tables that match are not touched.
--
-- Note for later versions: this list is the first version of each table. A
-- column added after that must be added with "alter table ... add column if
-- not exists", and must NOT be added to this list, or an existing database
-- would have its table moved aside instead of upgraded.
do $$
declare
  expected constant jsonb := '{
    "sections":      {"id":"int","slug":"text","label":"text","enabled":"bool","position":"int"},
    "articles":      {"id":"int","headline":"text","slug":"text","summary":"text","body":"text","section":"text","tags":"json",
                      "image_url":"text","image_caption":"text","image_credit":"text","author_name":"text","author_id":"int",
                      "placement":"text","status":"text","publish_at":"time","created_at":"time","updated_at":"time","updated_by":"text"},
    "article_media": {"id":"int","article_id":"int","kind":"text","url":"text","youtube_id":"text","title":"text","caption":"text",
                      "credit":"text","slot":"text","position":"int","width":"int","height":"int","content_type":"text","size":"int",
                      "file_name":"text","created_at":"time"},
    "article_views": {"id":"int","article_id":"int","section":"text","viewed_at":"time"},
    "comments":      {"id":"int","article_id":"int","author_name":"text","body":"text","status":"text","created_at":"time",
                      "moderated_by":"text","moderated_at":"time"},
    "authors":       {"id":"int","name":"text","title":"text","bio":"text","email":"text","photo_url":"text","active":"bool",
                      "created_at":"time","updated_at":"time"},
    "media":         {"id":"int","file_name":"text","path":"text","url":"text","content_type":"text","size":"int","width":"int",
                      "height":"int","alt":"text","uploaded_by":"text","uploader_id":"int","created_at":"time"},
    "ads":           {"id":"int","slot":"text","slot_name":"text","description":"text","shape":"text","positions":"json",
                      "position":"text","advertiser":"text","image_url":"text","link_url":"text","enabled":"bool","width":"int",
                      "height":"int","sort":"int","updated_at":"time"},
    "settings":      {"key":"text","value":"json","updated_at":"time"},
    "activity":      {"id":"int","actor":"text","action":"text","entity_type":"text","entity_id":"int","summary":"text","created_at":"time"}
  }';
  -- These point at articles, so they move with it.
  children constant text[] := array['article_media', 'article_views', 'comments'];
  misfit text[] := '{}';
  t text;
  kept text;
  n integer;
begin
  for t in select jsonb_object_keys(expected) loop
    continue when to_regclass(format('public.%I', t)) is null;
    if exists (
      select 1
      from jsonb_each_text(expected -> t) as want(col, family)
      left join information_schema.columns have
        on have.table_schema = 'public' and have.table_name = t and have.column_name = want.col
      where have.column_name is null
         or not case want.family
                  when 'int'  then have.data_type in ('integer', 'bigint')
                  when 'text' then have.data_type in ('text', 'character varying')
                  when 'bool' then have.data_type = 'boolean'
                  when 'json' then have.data_type = 'jsonb'
                  when 'time' then have.data_type = 'timestamp with time zone'
                end
    ) then
      misfit := misfit || t;
    end if;
  end loop;

  if 'articles' = any (misfit) then
    foreach t in array children loop
      if to_regclass(format('public.%I', t)) is not null and not (t = any (misfit)) then
        misfit := misfit || t;
      end if;
    end loop;
  end if;

  foreach t in array misfit loop
    kept := t || '_old';
    n := 1;
    while to_regclass(format('public.%I', kept)) is not null loop
      n := n + 1;
      kept := t || '_old_' || n;
    end loop;
    execute format('alter table public.%I rename to %I', t, kept);
    raise notice 'The existing table "%" did not fit the CMS. It is kept as "%", and a correct "%" is created.', t, kept, t;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- Categories: the sections of the site that stories are filed under.
create table if not exists public.sections (
  id        integer generated by default as identity primary key,
  slug      text    not null,           -- used in addresses and on articles.section, e.g. 'south-africa'
  label     text    not null,           -- the name readers see, e.g. 'South Africa'
  enabled   boolean default true,       -- false hides the category and its stories from the site
  position  integer                     -- order in the site menu, smallest first
);

-- Stories.
create table if not exists public.articles (
  id             integer generated by default as identity primary key,
  headline       text not null,
  slug           text,
  summary        text,
  body           text,                        -- plain text: blank line between paragraphs, '## ' subheading, '> ' quote
  section        text,                        -- a sections.slug
  tags           jsonb default '[]'::jsonb,   -- up to five strings, e.g. ["Elections", "Gauteng"]
  image_url      text,                        -- main picture, in the newsroom-media bucket
  image_caption  text,
  image_credit   text,
  author_name    text,                        -- the byline readers see
  author_id      integer,                     -- the team member who wrote it (member number on their sign-in account)
  placement      text default 'none',         -- front page: 'none' | 'main' (main headline) | 'headline' (headline news)
  status         text default 'draft',        -- 'draft' | 'review' | 'scheduled' | 'published' | 'hidden'
  publish_at     timestamptz,                 -- when it went live, or when a scheduled story will
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  updated_by     text
);

-- YouTube videos, short videos and audio clips attached to a story.
create table if not exists public.article_media (
  id            integer generated by default as identity primary key,
  article_id    integer not null references public.articles (id) on delete cascade,
  kind          text not null,           -- 'youtube' | 'video' | 'audio'
  url           text not null,           -- the YouTube watch link, or the file in the newsroom-av bucket
  youtube_id    text,                    -- the 11-character video id, for kind 'youtube'
  title         text,
  caption       text,
  credit        text,
  slot          text default 'top',      -- 'top' (before the story text) | 'bottom' (after it)
  position      integer,                 -- order within the story, smallest first
  width         integer,
  height        integer,
  content_type  text,                    -- e.g. 'video/mp4', 'audio/mpeg'; empty for YouTube
  size          integer,                 -- bytes; empty for YouTube
  file_name     text,
  created_at    timestamptz default now()
);

-- Analytics: one row each time a reader opens a story on the site.
create table if not exists public.article_views (
  id          integer generated by default as identity primary key,
  article_id  integer not null references public.articles (id) on delete cascade,
  section     text,                      -- the story's category at the time, for reads by category
  viewed_at   timestamptz default now()
);

-- Reader comments and their moderation.
create table if not exists public.comments (
  id            integer generated by default as identity primary key,
  article_id    integer not null references public.articles (id) on delete cascade,
  author_name   text not null,           -- the name the reader gave; no email address is stored
  body          text not null,
  status        text default 'pending',  -- 'pending' | 'approved' | 'rejected' | 'spam'
  created_at    timestamptz default now(),
  moderated_by  text,
  moderated_at  timestamptz
);

-- Author profiles: title, bio and photo for a byline. Matched to stories by name.
create table if not exists public.authors (
  id          integer generated by default as identity primary key,
  name        text not null,
  title       text,
  bio         text,
  email       text,
  photo_url   text,
  active      boolean default true,      -- false keeps the profile off the site
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Media library: every picture, short video and audio clip that was uploaded.
create table if not exists public.media (
  id            integer generated by default as identity primary key,
  file_name     text not null,
  path          text,                    -- where the file sits inside its bucket
  url           text not null,           -- public address of the file
  content_type  text,                    -- image/... is in newsroom-media; video/... and audio/... are in newsroom-av
  size          integer,                 -- bytes
  width         integer,
  height        integer,
  alt           text,                    -- description of the file
  uploaded_by   text,
  uploader_id   integer,
  created_at    timestamptz default now()
);

-- Advert positions. The nine rows, with their banner sizes, are added in part 6;
-- the CMS only edits them.
create table if not exists public.ads (
  id           integer generated by default as identity primary key,
  slot         text not null,            -- 'header' | 'banner' | 'billboard' | 'home' | 'section' | 'article' | 'sidebar' | 'halfpage' | 'footer'
  slot_name    text not null,
  description  text,
  shape        text,                     -- the banner size the position is built for, in words
  positions    jsonb,                    -- the places this slot can go: [["value", "Label"], ...]
  position     text,                     -- the place chosen, one of the values in positions
  advertiser   text,
  image_url    text,
  link_url     text,
  enabled      boolean default false,
  width        integer,                  -- size of the image that was uploaded, in pixels
  height       integer,
  sort         integer,                  -- listing order
  updated_at   timestamptz
);

-- Site settings, one row per group. The CMS fills these in as they are saved.
-- Keys in use: ads_enabled, crawl, notice, elections_update, live_updates,
-- scheduled_panel, contact, comments, homepage, site_link.
create table if not exists public.settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz default now()
);

-- Recent editorial activity, shown on the dashboard.
create table if not exists public.activity (
  id           integer generated by default as identity primary key,
  actor        text,
  action       text,                     -- e.g. 'published', 'scheduled', 'submitted', 'updated', 'deleted'
  entity_type  text,                     -- e.g. 'article', 'section', 'comment', 'media', 'team', 'settings'
  entity_id    integer,
  summary      text,
  created_at   timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
create index if not exists cms_articles_status_publish_idx  on public.articles (status, publish_at desc);
create index if not exists cms_articles_section_idx         on public.articles (section);
create index if not exists cms_articles_updated_idx         on public.articles (updated_at desc);
create index if not exists cms_article_media_article_idx    on public.article_media (article_id, position);
create index if not exists cms_article_views_viewed_idx     on public.article_views (viewed_at desc);
create index if not exists cms_article_views_article_idx    on public.article_views (article_id);
create index if not exists cms_comments_status_created_idx  on public.comments (status, created_at desc);
create index if not exists cms_comments_article_idx         on public.comments (article_id);
create index if not exists cms_media_created_idx            on public.media (created_at desc);
create index if not exists cms_activity_created_idx         on public.activity (created_at desc);

-- One row per category slug and per advert slot. Skipped, not failed, if an
-- existing table already holds a duplicate.
do $$
begin
  if not exists (select 1 from public.sections group by slug having count(*) > 1) then
    create unique index if not exists cms_sections_slug_uidx on public.sections (slug);
  end if;
  if not exists (select 1 from public.ads group by slot having count(*) > 1) then
    create unique index if not exists cms_ads_slot_uidx on public.ads (slot);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Row-level security
-- ----------------------------------------------------------------------------
-- Switched on with no policies, which closes every table to the public
-- ("anon") key that ships in the pages. The CMS is not affected: its server
-- uses the service role key, and readers get published content through the
-- CMS's own public feed, never from the tables directly.
-- If another app is ever to read a table with the public key, add a "select"
-- policy for exactly the rows it may see.
alter table public.sections       enable row level security;
alter table public.articles       enable row level security;
alter table public.article_media  enable row level security;
alter table public.article_views  enable row level security;
alter table public.comments       enable row level security;
alter table public.authors        enable row level security;
alter table public.media          enable row level security;
alter table public.ads            enable row level security;
alter table public.settings       enable row level security;
alter table public.activity       enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Access for the CMS server
-- ----------------------------------------------------------------------------
-- Supabase normally grants this by itself; stated here so it never depends on
-- how the project was set up. Skipped on a database that is not Supabase.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all on table
      public.sections, public.articles, public.article_media, public.article_views, public.comments,
      public.authors, public.media, public.ads, public.settings, public.activity
    to service_role;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Storage buckets
-- ----------------------------------------------------------------------------
-- newsroom-media: pictures for stories, adverts and author photos (up to 4 MB).
-- newsroom-av:    short videos and audio clips (up to 50 MB).
-- Both are public to read, so the site can show the files. No storage
-- policies are needed: every upload is made or signed by the CMS server.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values
        ('newsroom-media', 'newsroom-media', true, 4194304,
         array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
        ('newsroom-av', 'newsroom-av', true, 52428800,
         array['video/mp4', 'video/webm', 'video/quicktime',
               'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm'])
      on conflict (id) do nothing
    $sql$;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Starting rows
-- ----------------------------------------------------------------------------
-- The ten categories the 180news site has pages for. Only added when the
-- table is empty, so categories you have changed or removed stay that way.
insert into public.sections (slug, label, enabled, position)
select v.slug, v.label, true, v.position
from (values
  ('elections',    'Elections',    1),
  ('south-africa', 'South Africa', 2),
  ('politics',     'Politics',     3),
  ('business',     'Business',     4),
  ('sport',        'Sport',        5),
  ('world',        'World',        6),
  ('africa',       'Africa',       7),
  ('tech',         'Tech',         8),
  ('life',         'Life',         9),
  ('opinion',      'Opinions',     10)
) as v(slug, label, position)
where not exists (select 1 from public.sections);

-- The nine advert positions, each with the banner size it is built for
-- (pixels, width x height). The first comment on each row gives the size;
-- "shape" holds the same advice in words, as the CMS shows it.
--
--   header     Site header            480 x 120   news app
--   banner     Top banner             728 x 90    news app
--   billboard  Front page billboard   970 x 250   site connector
--   home       Front page             970 x 250   news app (any shape, up to 280 tall)
--   section    Section pages          728 x 90    site connector
--   article    Story pages            300 x 250   news app (any shape, up to 280 tall)
--   sidebar    Story sidebar          300 x 250   site connector
--   halfpage   Tall story sidebar     300 x 600   site connector (computers only)
--   footer     Footer banner          728 x 90    site connector
--
-- "news app" positions are drawn by the app itself. "site connector"
-- positions are drawn by /connect.js, so the site must load the current
-- connector for them to appear.
--
-- A position is added only if it is missing, and always switched off. An
-- advert you have already set up is never touched: on positions that were
-- already there, only the listing order is refreshed and the size advice is
-- filled in where it was empty.
with slots (slot, slot_name, description, shape, positions, position, sort) as (
  values
    -- Header banner, 480 x 120. Drawn by the news app.
    ('header', 'Site header', 'One advert at the top of every public page.',
     'A compact banner about four times as wide as it is tall works best here, for example 480 by 120. It is shown up to 60 pixels tall, and 44 on a phone, where a long thin banner becomes too small to read.',
     '[["header", "Beside the logo, in the same row, on every screen size"]]',
     'header', 1),
    -- Leaderboard, 728 x 90. Drawn by the news app.
    ('banner', 'Top banner', 'An advert-only banner directly above the navigation bar on every public page.',
     'A wide leaderboard works best here: 728 by 90. It is shown up to 90 pixels tall, and scaled to the width of the screen on a phone, where it is about 44 pixels tall.',
     '[["abovemenu", "Above the navigation bar"], ["verytop", "Very top of the page"]]',
     'abovemenu', 2),
    -- Billboard, 970 x 250. Drawn by the site connector.
    ('billboard', 'Front page billboard', 'A large advert at the top of the front page, above the headline news.',
     'Billboard: 970 by 250 pixels. On a phone it is scaled to the width of the screen, about 90 pixels tall, so keep the wording large.',
     '[["top", "Top of the front page, above the headline news"]]',
     'top', 3),
    -- Billboard, 970 x 250. Drawn by the news app.
    ('home', 'Front page', 'One advert on the front page.',
     'A billboard, 970 by 250 pixels, fills this space best. Any shape works: it is shown up to 280 pixels tall, and scaled to the width of the screen on a phone.',
     '[["top", "Directly under the headline news"], ["elections", "After the Elections update"], ["middle", "Mid-page, above Sport"], ["bottom", "End of the page"]]',
     'elections', 4),
    -- Leaderboard, 728 x 90. Drawn by the site connector.
    ('section', 'Section pages', 'One advert at the top of every section page, and of Latest, tag pages and search.',
     'Leaderboard: 728 by 90 pixels. On a phone it is scaled to the width of the screen, about 44 pixels tall.',
     '[["top", "Top of the page, above the title"]]',
     'top', 5),
    -- Medium rectangle, 300 x 250. Drawn by the news app.
    ('article', 'Story pages', 'One advert on every story and article.',
     'A medium rectangle, 300 by 250 pixels, suits this space best and stays full size on a phone. Any shape works: it is shown up to 280 pixels tall.',
     '[["inline", "Straight after the story"], ["below", "Lower down, after the related headlines"]]',
     'inline', 6),
    -- Medium rectangle, 300 x 250. Drawn by the site connector.
    ('sidebar', 'Story sidebar', 'One advert beside every story. On a phone it follows the story.',
     'Medium rectangle: 300 by 250 pixels. It stays full size on a phone.',
     '[["top", "Top of the sidebar, above the list of headlines"], ["bottom", "Bottom of the sidebar, under the list of headlines"]]',
     'top', 7),
    -- Half page, 300 x 600. Drawn by the site connector.
    ('halfpage', 'Tall story sidebar', 'A tall advert beside every story. It sits under the list of headlines and stays in view as the reader scrolls on. Shown on computers only.',
     'Half page: 300 by 600 pixels. It is not shown on phones or small tablets, where it would fill the screen.',
     '[["sticky", "Under the list of headlines, staying in view as the reader scrolls on"]]',
     'sticky', 8),
    -- Leaderboard, 728 x 90. Drawn by the site connector.
    ('footer', 'Footer banner', 'One advert above the footer on every public page.',
     'Leaderboard: 728 by 90 pixels. On a phone it is scaled to the width of the screen, about 44 pixels tall.',
     '[["abovefooter", "Above the footer"]]',
     'abovefooter', 9)
),
added as (
  insert into public.ads (slot, slot_name, description, shape, positions, position, enabled, sort)
  select s.slot, s.slot_name, s.description, s.shape, s.positions::jsonb, s.position, false, s.sort
  from slots s
  where not exists (select 1 from public.ads a where a.slot = s.slot)
  returning 1
)
update public.ads a
set sort = s.sort, shape = coalesce(a.shape, s.shape)
from slots s
where a.slot = s.slot
  and (a.sort is distinct from s.sort or a.shape is null);

-- Tell the Supabase API about the new tables straight away.
notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- What is in place now
-- ----------------------------------------------------------------------------
select
  c.relname as "table",
  case when c.relname ~ '_old(_[0-9]+)?$' then 'kept from before, not used by the CMS' else 'ready' end as "status",
  (select count(*) from information_schema.columns k
    where k.table_schema = 'public' and k.table_name = c.relname) as "columns",
  c.relrowsecurity as "row-level security on"
from pg_class c
join pg_namespace s on s.oid = c.relnamespace
where s.nspname = 'public'
  and c.relkind = 'r'
  and c.relname ~ '^(sections|articles|article_media|article_views|comments|authors|media|ads|settings|activity)(_old(_[0-9]+)?)?$'
order by 2 desc, 1;
