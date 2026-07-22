-- ============================================================================
-- FindIt4You — database schema (Postgres / Supabase)
-- Run this in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to re-run: uses "if not exists" / "create or replace" throughout.
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- profiles — one row per user, linked to Supabase Auth (auth.users)
-- Auth (email/password, sessions) is handled by Supabase; this holds the
-- app-level profile + marketplace fields.
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  full_name          text,
  role               text not null default 'buyer' check (role in ('buyer','finder','both')),
  region             text,
  phone              text,
  rating             numeric(3,2) not null default 0,
  ratings_count      integer not null default 0,
  stripe_customer_id text,          -- for paying (buyers/subscribers)
  stripe_account_id  text,          -- Stripe Connect payout account (finders)
  created_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- finds — a buyer's request ("I'm looking for X")
-- ----------------------------------------------------------------------------
create table if not exists finds (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references profiles(id) on delete cascade,
  finder_id   uuid references profiles(id) on delete set null,
  title       text not null,
  detail      text,
  category    text,
  size        text,
  max_price   numeric(10,2),
  reward      numeric(10,2),        -- finder's fee
  region      text,
  deadline    text,
  status      text not null default 'open'
              check (status in ('open','claimed','found','completed','cancelled')),
  proof       text,                 -- text note; photo lives in photo_url
  photo_url   text,                 -- Supabase Storage URL of proof photo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- transactions — escrow record. Real money lives in Stripe; we store refs.
-- ----------------------------------------------------------------------------
create table if not exists transactions (
  id                       uuid primary key default gen_random_uuid(),
  find_id                  uuid not null references finds(id) on delete cascade,
  buyer_id                 uuid not null references profiles(id),
  finder_id                uuid references profiles(id),
  amount                   numeric(10,2),   -- item cost
  finder_fee               numeric(10,2),
  platform_fee             numeric(10,2),
  currency                 text not null default 'usd',
  status                   text not null default 'pending'
                           check (status in ('pending','held','released','refunded')),
  stripe_payment_intent_id text,
  stripe_transfer_id       text,
  created_at               timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- messages — buyer/finder chat scoped to a find
-- ----------------------------------------------------------------------------
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  find_id    uuid not null references finds(id) on delete cascade,
  sender_id  uuid not null references profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- reviews — ratings after a completed find (builds Finder reputation)
-- ----------------------------------------------------------------------------
create table if not exists reviews (
  id          uuid primary key default gen_random_uuid(),
  find_id     uuid not null references finds(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  reviewee_id uuid not null references profiles(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- subscriptions — memberships (Stripe Billing); refs only
-- ----------------------------------------------------------------------------
create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text,
  plan                   text,
  status                 text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- indexes — the queries we'll actually run
-- ----------------------------------------------------------------------------
create index if not exists idx_finds_status    on finds (status);
create index if not exists idx_finds_buyer      on finds (buyer_id);
create index if not exists idx_finds_finder      on finds (finder_id);
create index if not exists idx_finds_region      on finds (region);
create index if not exists idx_finds_created      on finds (created_at desc);
create index if not exists idx_messages_find      on messages (find_id);
create index if not exists idx_transactions_find on transactions (find_id);
create index if not exists idx_reviews_reviewee   on reviews (reviewee_id);

-- ----------------------------------------------------------------------------
-- keep finds.updated_at fresh
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_finds_updated_at on finds;
create trigger trg_finds_updated_at before update on finds
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- auto-create a profile row whenever someone signs up via Supabase Auth
-- ----------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'buyer')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- The Node server talks to the DB with the SERVICE ROLE key, which bypasses
-- RLS — so all trust/authorization logic lives server-side. We still enable
-- RLS (Supabase best practice) and add sane policies, so if the browser ever
-- reads Supabase directly it's locked down by default.
-- ----------------------------------------------------------------------------
alter table profiles      enable row level security;
alter table finds         enable row level security;
alter table transactions  enable row level security;
alter table messages      enable row level security;
alter table reviews       enable row level security;
alter table subscriptions enable row level security;

-- profiles: anyone signed in can read profiles (needed for ratings/names);
-- a user can update only their own.
drop policy if exists p_profiles_read   on profiles;
drop policy if exists p_profiles_update on profiles;
create policy p_profiles_read   on profiles for select using (auth.role() = 'authenticated');
create policy p_profiles_update on profiles for update using (auth.uid() = id);

-- finds: signed-in users can browse open finds and anything they're party to;
-- buyers manage their own finds.
drop policy if exists p_finds_read   on finds;
drop policy if exists p_finds_insert on finds;
drop policy if exists p_finds_update on finds;
create policy p_finds_read on finds for select using (
  auth.role() = 'authenticated'
  and (status = 'open' or buyer_id = auth.uid() or finder_id = auth.uid())
);
create policy p_finds_insert on finds for insert with check (buyer_id = auth.uid());
create policy p_finds_update on finds for update using (
  buyer_id = auth.uid() or finder_id = auth.uid()
);

-- messages: only the two parties on the find can read/write (enforced server-side too)
drop policy if exists p_messages_rw on messages;
create policy p_messages_rw on messages for all using (sender_id = auth.uid());

-- reviews: readable by authenticated, writable by the reviewer
drop policy if exists p_reviews_read   on reviews;
drop policy if exists p_reviews_insert on reviews;
create policy p_reviews_read   on reviews for select using (auth.role() = 'authenticated');
create policy p_reviews_insert on reviews for insert with check (reviewer_id = auth.uid());

-- transactions & subscriptions: no direct browser access — server (service role) only.
-- (RLS on with no policies = deny all for anon/authenticated.)
