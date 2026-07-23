-- 002_accounts.sql — full profiles, wallet ledger, watchlist.

-- profiles: full contact info + onboarding + phone verification (Twilio later)
alter table profiles add column if not exists phone            text;
alter table profiles add column if not exists phone_verified   boolean not null default false;
alter table profiles add column if not exists address_line1    text;
alter table profiles add column if not exists address_line2    text;
alter table profiles add column if not exists city             text;
alter table profiles add column if not exists state            text;
alter table profiles add column if not exists postal_code      text;
alter table profiles add column if not exists avatar_url       text;
alter table profiles add column if not exists onboarding_complete boolean not null default false;

-- allow an "undecided" role at signup ("I don't know yet")
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add  constraint profiles_role_check
  check (role in ('buyer','finder','both','undecided'));

-- wallet: cached balance + append-only ledger (source of truth = sum of entries)
create table if not exists wallets (
  user_id       uuid primary key references profiles(id) on delete cascade,
  balance_cents integer not null default 0,
  currency      text not null default 'usd',
  updated_at    timestamptz not null default now()
);
create table if not exists wallet_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  amount_cents integer not null,                 -- signed: +credit / -debit
  kind         text not null check (kind in ('deposit','hold','release','refund','payout','fee','adjustment')),
  find_id      uuid references finds(id) on delete set null,
  stripe_ref   text,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_wallet_entries_user on wallet_entries(user_id, created_at desc);

-- watchlist
create table if not exists watchlist (
  user_id    uuid not null references profiles(id) on delete cascade,
  find_id    uuid not null references finds(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, find_id)
);

-- auto-create a wallet whenever a profile is created
create or replace function handle_new_profile() returns trigger as $$
begin
  insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end; $$ language plpgsql security definer;
drop trigger if exists trg_profile_wallet on profiles;
create trigger trg_profile_wallet after insert on profiles
  for each row execute function handle_new_profile();

-- backfill wallets for profiles that already exist
insert into wallets (user_id) select id from profiles on conflict (user_id) do nothing;

-- RLS (server uses service role; these lock down any direct browser access)
alter table wallets        enable row level security;
alter table wallet_entries enable row level security;
alter table watchlist      enable row level security;
drop policy if exists p_wallet_own         on wallets;
drop policy if exists p_wallet_entries_own on wallet_entries;
drop policy if exists p_watchlist_own      on watchlist;
create policy p_wallet_own         on wallets        for select using (user_id = auth.uid());
create policy p_wallet_entries_own on wallet_entries for select using (user_id = auth.uid());
create policy p_watchlist_own      on watchlist      for all    using (user_id = auth.uid());
