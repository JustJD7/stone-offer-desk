-- Stone Offer Desk — Postgres schema (Neon)
-- Run once against a fresh database: psql "$DATABASE_URL" -f db/schema.sql

create extension if not exists pgcrypto; -- for gen_random_uuid()

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
  unread            boolean not null default true,
  created_by_office text,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists offers_status_idx on offers (status);
create index if not exists offers_client_id_idx on offers (client_id);

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
