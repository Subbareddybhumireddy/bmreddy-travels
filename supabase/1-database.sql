-- =========================================================
-- BMReddy Travels – bookings database
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to run again (it only creates what is missing / replaces functions).
-- =========================================================

-- ---------- Admins ----------
-- Only users listed here can read or change bookings.
-- Nobody can read or change this table from the website.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ---------- Bookings ----------
create table if not exists public.bookings (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  customer_name    text not null check (char_length(customer_name) between 2 and 80),
  mobile_number    text not null check (mobile_number ~ '^[6-9][0-9]{9}$'),
  email            text check (email is null or (char_length(email) <= 120 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')),
  car              text not null check (char_length(car) between 1 and 40),
  pickup_date      date not null,
  number_of_days   integer not null check (number_of_days between 1 and 60),
  driver_option    text not null check (driver_option in ('Self Drive', 'Need Driver')),
  pickup_location  text check (pickup_location is null or char_length(pickup_location) <= 200),
  notes            text check (notes is null or char_length(notes) <= 1000),
  estimated_total  integer check (estimated_total is null or estimated_total between 0 and 10000000),
  status           text not null default 'New' check (status in ('New', 'Confirmed', 'Completed', 'Cancelled')),
  admin_notes      text check (admin_notes is null or char_length(admin_notes) <= 4000),
  updated_at       timestamptz not null default now()
);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_mobile_idx on public.bookings (mobile_number, created_at desc);


-- ---------- Activity log ----------
create table if not exists public.booking_events (
  id          bigint generated always as identity primary key,
  booking_id  bigint not null references public.bookings (id) on delete cascade,
  created_at  timestamptz not null default now(),
  event       text not null check (event in ('created', 'status_changed')),
  old_status  text,
  new_status  text
);
create index if not exists booking_events_booking_idx on public.booking_events (booking_id, created_at);
create index if not exists booking_events_created_idx on public.booking_events (created_at desc);

-- Messages sent to the customer (email / WhatsApp) are logged here too.
alter table public.booking_events add column if not exists channel text;
alter table public.booking_events add column if not exists message text;
alter table public.booking_events drop constraint if exists booking_events_event_check;
alter table public.booking_events add constraint booking_events_event_check
  check (event in ('created', 'status_changed', 'customer_notified'));


-- ---------- Checks on every new booking ----------
-- Runs on the server, so it can't be skipped by a visitor.
create or replace function public.bookings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  -- Visitors can't choose these
  new.created_at  := now();
  new.updated_at  := now();
  new.status      := 'New';
  new.admin_notes := null;

  -- Tidy text
  new.customer_name   := btrim(new.customer_name);
  new.email           := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.pickup_location := nullif(btrim(coalesce(new.pickup_location, '')), '');
  new.notes           := nullif(btrim(coalesce(new.notes, '')), '');

  -- No past pickup dates (India time)
  if new.pickup_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Pickup date cannot be in the past' using errcode = 'P0001';
  end if;

  -- Simple spam limit: max 5 bookings per mobile number per hour
  select count(*) into recent
  from public.bookings
  where mobile_number = new.mobile_number
    and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'Too many bookings from this number' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.bookings_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.bookings_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (booking_id, event, new_status)
    values (new.id, 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into public.booking_events (booking_id, event, old_status, new_status)
    values (new.id, 'status_changed', old.status, new.status);
  end if;
  return null;
end;
$$;

drop trigger if exists bookings_before_insert on public.bookings;
create trigger bookings_before_insert
  before insert on public.bookings
  for each row execute function public.bookings_before_insert();

drop trigger if exists bookings_before_update on public.bookings;
create trigger bookings_before_update
  before update on public.bookings
  for each row execute function public.bookings_before_update();

drop trigger if exists bookings_log_insert on public.bookings;
create trigger bookings_log_insert
  after insert on public.bookings
  for each row execute function public.bookings_log_event();

drop trigger if exists bookings_log_status on public.bookings;
create trigger bookings_log_status
  after update of status on public.bookings
  for each row execute function public.bookings_log_event();


-- ---------- Who can do what (row level security) ----------
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

-- Start from nothing, then allow only what's needed.
revoke all on public.bookings from anon, authenticated;
revoke all on public.booking_events from anon, authenticated;

-- Visitors: may ADD a booking with these fields only. No reading, editing or deleting.
grant insert (customer_name, mobile_number, email, car, pickup_date, number_of_days,
              driver_option, pickup_location, notes, estimated_total)
  on public.bookings to anon, authenticated;

-- Logged-in users: may read bookings and change status / admin notes
-- (the policies below limit this to admins).
grant select on public.bookings to authenticated;
grant update (status, admin_notes) on public.bookings to authenticated;
grant select on public.booking_events to authenticated;

drop policy if exists "Anyone can submit a booking" on public.bookings;
create policy "Anyone can submit a booking"
  on public.bookings for insert
  to anon, authenticated
  with check (status = 'New' and admin_notes is null);

drop policy if exists "Admin can read bookings" on public.bookings;
create policy "Admin can read bookings"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin can update bookings" on public.bookings;
create policy "Admin can update bookings"
  on public.bookings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin can read activity" on public.booking_events;
create policy "Admin can read activity"
  on public.booking_events for select
  to authenticated
  using (public.is_admin());


-- ---------- Live updates on the admin dashboard ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
