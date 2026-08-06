-- Stone Offer Desk — Postgres schema (Neon)
-- Run once against a fresh database: psql "$DATABASE_URL" -f db/schema.sql

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Desk users: name + password login for this app. Named "desk_users" (not
-- "users") because this database already has a pre-existing "users" table
-- from an older, unrelated CRM build — kept fully separate and untouched.
--
-- role: 'user' (add/edit/remove offers, sees only own activity) |
--       'admin' (also manages users, exports, sees all non-superadmin
--       activity) | 'superadmin' (oversight account — full visibility
--       including admin activity, hidden from every user list and from
--       every other role's activity view; never appears as the author of
--       an offer/message since it can't create or edit either).
-- ---------------------------------------------------------------------------
create table if not exists desk_users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  password_hash text not null,
  role          text not null default 'user' check (role in ('user', 'admin', 'superadmin')),
  created_at    timestamptz not null default now()
);
create unique index if not exists desk_users_name_lower_idx on desk_users (lower(name));

-- ---------------------------------------------------------------------------
-- Clients: trading-partner directory (bulk-imported once, then edited/added to)
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id             uuid primary key default gen_random_uuid(),
  entity_name    text not null,
  country        text,
  stock_category text,
  source         text not null default 'manual', -- 'import' | 'manual'
  created_at     timestamptz not null default now()
);
create unique index if not exists clients_entity_name_lower_idx on clients (lower(entity_name));

-- ---------------------------------------------------------------------------
-- Offers: the pipeline. `version` supports optimistic concurrency across
-- offices editing the same offer; `thread`/`matched_stones` mirror the JSON
-- shapes already used by the frontend, so the API can pass them through mostly
-- as-is.
-- ---------------------------------------------------------------------------
create table if not exists offers (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references clients(id) on delete set null,
  contact           text default '',
  channel           text default '',
  type              text not null check (type in ('sell', 'buy')),
  shape             text default '',
  carat             text default '',
  color             text default '',
  clarity           text default '',
  cut               text default '',
  cert              text default '',
  price_type        text not null check (price_type in ('per_carat', 'total', 'back')),
  price             numeric not null default 0,
  priority          boolean not null default false,
  status            text not null default 'new' check (status in ('new', 'review', 'negotiating', 'accepted', 'rejected')),
  notes             text default '',
  thread            jsonb not null default '[]'::jsonb,
  matched_stones    jsonb not null default '[]'::jsonb,
  -- One client offer can bundle several stones together (added via "+ Add another
  -- stone" in the New Offer form). Empty for an ordinary single-stone offer, in
  -- which case the shape/carat/.../price columns above are the one stone's data,
  -- same as before this column existed. When it holds 2+ entries, each has its
  -- own shape/carat/color/clarity/cut/cert/priceType/price/matchedStone, and the
  -- top-level columns just mirror the first entry as a fallback for old code that
  -- doesn't know about this column.
  stones            jsonb not null default '[]'::jsonb,
  unread            boolean not null default true,
  created_by_office text,
  version           integer not null default 1,
  batch_id          uuid, -- legacy: earlier "batch" offers were one row per stone sharing this id; unused by new inserts, kept for existing rows
  -- Who has opened this offer's detail view — [{ id, name, seenAt }], deduped per user
  -- (each open updates that user's seenAt rather than appending a new entry).
  seen_by           jsonb not null default '[]'::jsonb,
  -- Captured when a deal is marked Accepted: the final negotiated price, separate from
  -- the original asking price so the negotiation history above isn't overwritten.
  sold_price_type   text check (sold_price_type in ('per_carat', 'total', 'back')),
  sold_price        numeric,
  sold_at           timestamptz,
  -- Captured when a deal is marked Rejected.
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists offers_status_idx on offers (status);
create index if not exists offers_client_id_idx on offers (client_id);
create index if not exists offers_batch_id_idx on offers (batch_id);

-- ---------------------------------------------------------------------------
-- Inventory: AutoMail stock snapshot. Replaced wholesale on each successful
-- ingestion run via a staging table (see worker/ingest-automail.ts), never
-- truncated blind, so a failed run can't leave this empty.
-- ---------------------------------------------------------------------------
create table if not exists inventory (
  stone_id      text primary key,
  shape         text,
  weight        numeric,
  color         text,
  clarity       text,
  cut           text,
  polish        text,
  symmetry      text,
  fluorescence  text,
  lab           text,
  report_no     text,
  rate          numeric,
  amt           numeric,
  rap_rate      numeric,
  rap_amt       numeric,
  back          text,
  status        text,
  location      text,
  cert_date     text,
  image_link    text,
  video         text,
  cert_filename text,
  raw           jsonb
);
create index if not exists inventory_shape_idx on inventory (shape);
create index if not exists inventory_status_idx on inventory (status);

create table if not exists inventory_staging (like inventory including all);

-- Singleton row describing the last successful inventory load (manual upload
-- or the automated Gmail refresh) — surfaced in the Inventory tab's status bar.
create table if not exists inventory_meta (
  id          integer primary key default 1,
  file_name   text,
  source      text, -- 'manual-upload' | 'gmail-refresh'
  row_count   integer,
  imported_at timestamptz, -- when we processed it
  email_date  timestamptz, -- when the source email itself was sent (null for manual uploads)
  constraint inventory_meta_singleton check (id = 1)
);

-- ---------------------------------------------------------------------------
-- Notifications: new-offer / new-client-message activity feed
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  type       text not null, -- 'new_offer' | 'new_message'
  offer_id   uuid references offers(id) on delete cascade,
  text       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_read_idx on notifications (read);

-- ---------------------------------------------------------------------------
-- Activity log: audit trail, visibility filtered by role at query time
-- (see server/routes/activity.ts) — superadmin sees everything, admin sees
-- everything except superadmin rows, a plain user sees only their own rows.
-- ---------------------------------------------------------------------------
create table if not exists activity_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references desk_users(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action     text not null,
  detail     text default '',
  offer_id   uuid references offers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_actor_id_idx on activity_log (actor_id);
create index if not exists activity_log_created_at_idx on activity_log (created_at desc);
