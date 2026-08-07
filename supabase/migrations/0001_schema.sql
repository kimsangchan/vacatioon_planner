create extension if not exists pgcrypto;

create table public.trips (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Asia/Seoul' check (char_length(trim(timezone)) > 0),
  share_token bytea unique,
  share_enabled boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((share_enabled = false and share_token is null) or (share_enabled = true and share_token is not null))
);

create table public.days (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, date),
  unique (trip_id, position)
);

create table public.places (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('restaurant', 'lodging', 'spot')),
  name text not null check (char_length(trim(name)) > 0),
  address text not null default '',
  road_address text not null default '',
  lat numeric(9,6) not null check (lat >= 33 and lat <= 39),
  lng numeric(9,6) not null check (lng >= 124 and lng <= 132),
  provider text not null check (provider in ('naver', 'kakao', 'google', 'manual')),
  provider_link text,
  memo text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider <> 'manual' or provider_link is null)
);

create unique index places_trip_name_coords_active_key
  on public.places (trip_id, name, lat, lng)
  where deleted_at is null;

create table public.stops (
  id uuid primary key,
  day_id uuid not null references public.days(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  position integer not null check (position >= 0),
  start_time time,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.legs (
  id uuid primary key,
  day_id uuid not null references public.days(id) on delete cascade,
  mode text not null check (mode in ('train', 'bus', 'flight', 'ship', 'car', 'walk', 'other')),
  depart_at time not null,
  arrive_at time not null,
  arrive_day_offset integer not null default 0 check (arrive_day_offset >= 0 and arrive_day_offset <= 2),
  from_label text not null default '',
  to_label text not null default '',
  booking_ref text not null default '',
  cost_amount integer check (cost_amount is null or cost_amount >= 0),
  memo text not null default '',
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (arrive_day_offset > 0 or arrive_at >= depart_at)
);

create table public.photos (
  id uuid primary key,
  place_id uuid references public.places(id) on delete cascade,
  leg_id uuid references public.legs(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^photos/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  thumb_path text not null unique check (thumb_path ~ '^photos/[0-9a-f-]{36}/[0-9a-f-]{36}-thumb\.webp$'),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  check (num_nonnulls(place_id, leg_id) = 1)
);

create table public.search_cache (
  query_hash text primary key check (char_length(query_hash) >= 32),
  response jsonb not null,
  fetched_at timestamptz not null default now()
);

create table public.api_usage (
  date date not null,
  counter text not null check (char_length(trim(counter)) > 0),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (date, counter)
);

create index days_trip_id_idx on public.days (trip_id);
create index places_trip_id_idx on public.places (trip_id) where deleted_at is null;
create index places_owner_id_idx on public.places (owner_id);
create index stops_day_id_idx on public.stops (day_id);
create index stops_place_id_idx on public.stops (place_id);
create index legs_day_id_idx on public.legs (day_id);
create index photos_place_id_idx on public.photos (place_id) where place_id is not null;
create index photos_leg_id_idx on public.photos (leg_id) where leg_id is not null;
create index search_cache_fetched_at_idx on public.search_cache (fetched_at);
