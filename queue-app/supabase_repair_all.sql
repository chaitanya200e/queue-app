create extension if not exists pgcrypto;

create table if not exists public.queue (
  id uuid primary key default gen_random_uuid()
);

alter table public.queue
  add column if not exists token_id text,
  add column if not exists token_number integer,
  add column if not exists name text,
  add column if not exists domain text,
  add column if not exists slot_id uuid,
  add column if not exists slot_date date,
  add column if not exists slot_label text,
  add column if not exists service_type text,
  add column if not exists service_detail text,
  add column if not exists domain_location text,
  add column if not exists domain_location_label text,
  add column if not exists scope_key text,
  add column if not exists status text default 'waiting',
  add column if not exists created_at timestamptz default now(),
  add column if not exists served_at timestamptz;

alter table public.queue alter column id set default gen_random_uuid();

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid()
);

alter table public.slots
  add column if not exists date date,
  add column if not exists domain text,
  add column if not exists domain_location text,
  add column if not exists domain_location_label text,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists capacity integer default 0,
  add column if not exists booked integer default 0,
  add column if not exists status text default 'active',
  add column if not exists created_at timestamptz default now();

alter table public.slots alter column id set default gen_random_uuid();

create table if not exists public.counters (
  id text primary key,
  value integer not null default 1
);

insert into public.counters (id, value)
values ('tokenCounter', 1)
on conflict (id) do nothing;

create table if not exists public.meta (
  id text primary key,
  current_token text default 'Q000',
  current_name text default '',
  current_slot_label text default '',
  current_slot_date date,
  updated_at timestamptz default now()
);

insert into public.meta (id, current_token)
values ('queue', 'Q000')
on conflict (id) do nothing;

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid()
);

alter table public.admins
  add column if not exists email text unique,
  add column if not exists name text,
  add column if not exists domain text,
  add column if not exists organization_name text,
  add column if not exists branch_city text,
  add column if not exists address text,
  add column if not exists scope_key text,
  add column if not exists scope_label text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists created_at timestamptz default now();

insert into public.admins (email, name, domain, scope_key, scope_label, approved_by, approved_at)
values ('chaitanyamandale125@gmail.com', 'Super Admin', 'general', 'general', 'General', 'system', now())
on conflict (email) do nothing;

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.admin_requests
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists domain text,
  add column if not exists organization_name text,
  add column if not exists branch_city text,
  add column if not exists address text,
  add column if not exists status text default 'pending',
  add column if not exists scope_key text,
  add column if not exists scope_label text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by text,
  add column if not exists rejected_at timestamptz,
  add column if not exists created_at timestamptz default now();

alter table public.admin_requests alter column id set default gen_random_uuid();

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid()
);

alter table public.locations
  add column if not exists domain text,
  add column if not exists scope_key text,
  add column if not exists scope_label text,
  add column if not exists address text,
  add column if not exists created_by text,
  add column if not exists created_at timestamptz default now();

create unique index if not exists locations_domain_scope_key_idx
on public.locations (domain, scope_key);

alter table public.queue enable row level security;
alter table public.slots enable row level security;
alter table public.counters enable row level security;
alter table public.meta enable row level security;
alter table public.admins enable row level security;
alter table public.admin_requests enable row level security;
alter table public.locations enable row level security;

drop policy if exists "Queue public read" on public.queue;
drop policy if exists "Queue public insert" on public.queue;
drop policy if exists "Queue admins update" on public.queue;
drop policy if exists "Slots public read" on public.slots;
drop policy if exists "Slots public update booking" on public.slots;
drop policy if exists "Slots admins insert" on public.slots;
drop policy if exists "Slots admins update" on public.slots;
drop policy if exists "Counters public read" on public.counters;
drop policy if exists "Counters public insert" on public.counters;
drop policy if exists "Counters public update" on public.counters;
drop policy if exists "Meta public read" on public.meta;
drop policy if exists "Meta admins update" on public.meta;
drop policy if exists "Admins self or super read" on public.admins;
drop policy if exists "Super admin manage admins" on public.admins;
drop policy if exists "Admin requests public insert" on public.admin_requests;
drop policy if exists "Super admin read requests" on public.admin_requests;
drop policy if exists "Super admin update requests" on public.admin_requests;
drop policy if exists "Locations public read" on public.locations;
drop policy if exists "Super admin manage locations" on public.locations;

create policy "Queue public read" on public.queue for select using (true);
create policy "Queue public insert" on public.queue for insert with check (true);
create policy "Queue admins update" on public.queue for update to authenticated
using (
  lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
  or exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'))
)
with check (
  lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
  or exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'))
);

create policy "Slots public read" on public.slots for select using (true);
create policy "Slots public update booking" on public.slots for update using (true) with check (true);
create policy "Slots admins insert" on public.slots for insert to authenticated
with check (
  lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
  or exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'))
);
create policy "Slots admins update" on public.slots for update to authenticated
using (
  lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
  or exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'))
)
with check (
  lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
  or exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'))
);

create policy "Counters public read" on public.counters for select using (true);
create policy "Counters public insert" on public.counters for insert with check (true);
create policy "Counters public update" on public.counters for update using (true) with check (true);

create policy "Meta public read" on public.meta for select using (true);
create policy "Meta admins update" on public.meta for update to authenticated
using (
  lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
  or exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'))
)
with check (
  lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
  or exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'))
);

create policy "Admins self or super read" on public.admins for select to authenticated
using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com'
);
create policy "Super admin manage admins" on public.admins for all to authenticated
using (lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com')
with check (lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com');

create policy "Admin requests public insert" on public.admin_requests for insert with check (true);
create policy "Super admin read requests" on public.admin_requests for select to authenticated
using (lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com');
create policy "Super admin update requests" on public.admin_requests for update to authenticated
using (lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com')
with check (lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com');

create policy "Locations public read" on public.locations for select using (true);
create policy "Super admin manage locations" on public.locations for all to authenticated
using (lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com')
with check (lower(auth.jwt() ->> 'email') = 'chaitanyamandale125@gmail.com');

notify pgrst, 'reload schema';
