alter table public.trips enable row level security;
alter table public.days enable row level security;
alter table public.places enable row level security;
alter table public.stops enable row level security;
alter table public.legs enable row level security;
alter table public.photos enable row level security;
alter table public.search_cache enable row level security;
alter table public.api_usage enable row level security;

grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.days to authenticated;
grant select, insert, update, delete on public.places to authenticated;
grant select, insert, update, delete on public.stops to authenticated;
grant select, insert, update, delete on public.legs to authenticated;
grant select, insert, update, delete on public.photos to authenticated;
create policy trips_owner_select on public.trips
  for select to authenticated
  using (owner_id = auth.uid());

create policy trips_owner_insert on public.trips
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy trips_owner_update on public.trips
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy trips_owner_delete on public.trips
  for delete to authenticated
  using (owner_id = auth.uid());

create policy days_owner_select on public.days
  for select to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = days.trip_id and t.owner_id = auth.uid()
    )
  );

create policy days_owner_insert on public.days
  for insert to authenticated
  with check (
    exists (
      select 1 from public.trips t
      where t.id = days.trip_id and t.owner_id = auth.uid()
    )
  );

create policy days_owner_update on public.days
  for update to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = days.trip_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trips t
      where t.id = days.trip_id and t.owner_id = auth.uid()
    )
  );

create policy days_owner_delete on public.days
  for delete to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = days.trip_id and t.owner_id = auth.uid()
    )
  );

create policy places_owner_select on public.places
  for select to authenticated
  using (owner_id = auth.uid());

create policy places_owner_insert on public.places
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.trips t
      where t.id = places.trip_id and t.owner_id = auth.uid()
    )
  );

create policy places_owner_update on public.places
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.trips t
      where t.id = places.trip_id and t.owner_id = auth.uid()
    )
  );

create policy places_owner_delete on public.places
  for delete to authenticated
  using (owner_id = auth.uid());

create policy stops_owner_select on public.stops
  for select to authenticated
  using (
    exists (
      select 1
      from public.days d
      join public.trips t on t.id = d.trip_id
      where d.id = stops.day_id and t.owner_id = auth.uid()
    )
  );

create policy stops_owner_write on public.stops
  for all to authenticated
  using (
    exists (
      select 1
      from public.days d
      join public.trips t on t.id = d.trip_id
      where d.id = stops.day_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.days d
      join public.trips t on t.id = d.trip_id
      where d.id = stops.day_id and t.owner_id = auth.uid()
    )
  );

create policy legs_owner_select on public.legs
  for select to authenticated
  using (
    exists (
      select 1
      from public.days d
      join public.trips t on t.id = d.trip_id
      where d.id = legs.day_id and t.owner_id = auth.uid()
    )
  );

create policy legs_owner_write on public.legs
  for all to authenticated
  using (
    exists (
      select 1
      from public.days d
      join public.trips t on t.id = d.trip_id
      where d.id = legs.day_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.days d
      join public.trips t on t.id = d.trip_id
      where d.id = legs.day_id and t.owner_id = auth.uid()
    )
  );

create policy photos_owner_select on public.photos
  for select to authenticated
  using (
    (
      place_id is not null
      and exists (
        select 1 from public.places p
        where p.id = photos.place_id and p.owner_id = auth.uid()
      )
    )
    or (
      leg_id is not null
      and exists (
        select 1
        from public.legs l
        join public.days d on d.id = l.day_id
        join public.trips t on t.id = d.trip_id
        where l.id = photos.leg_id and t.owner_id = auth.uid()
      )
    )
  );

create policy photos_owner_write on public.photos
  for all to authenticated
  using (
    (
      place_id is not null
      and exists (
        select 1 from public.places p
        where p.id = photos.place_id and p.owner_id = auth.uid()
      )
    )
    or (
      leg_id is not null
      and exists (
        select 1
        from public.legs l
        join public.days d on d.id = l.day_id
        join public.trips t on t.id = d.trip_id
        where l.id = photos.leg_id and t.owner_id = auth.uid()
      )
    )
  )
  with check (
    (
      place_id is not null
      and exists (
        select 1 from public.places p
        where p.id = photos.place_id and p.owner_id = auth.uid()
      )
    )
    or (
      leg_id is not null
      and exists (
        select 1
        from public.legs l
        join public.days d on d.id = l.day_id
        join public.trips t on t.id = d.trip_id
        where l.id = photos.leg_id and t.owner_id = auth.uid()
      )
    )
  );
