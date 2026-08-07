-- RPC 9종 (SPEC §데이터 계층 — 시그니처 고정) + updated_at 자동 갱신 트리거.
--
-- 보안 규칙 (docs/design/04 §위협모델 · 05 §권한 모델):
--   · 전 함수 search_path 를 빈 문자열로 고정 → search_path 하이재킹 차단. 테이블은 항상 public. 전체 경로로 참조
--   · EXECUTE 는 public·anon 에서 회수한 뒤 authenticated 에만 부여 (예외: get_shared_trip 만 anon 허용 — 공유 뷰 전제)
--   · 운영 테이블(search_cache·api_usage)의 유일한 접근 경로는 아래 SECURITY DEFINER 함수들 — service role 키 불사용 (결정 #11)
--   · owner 대상 RPC 5종은 SECURITY INVOKER — 소유 검증을 0002 의 RLS 정책에 그대로 위임한다

-- ── updated_at 자동 갱신 ─────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.days
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.stops
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.legs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.api_usage
  for each row execute function public.set_updated_at();

-- ── E-02 create_trip — trip + 기간만큼 days 를 단일 트랜잭션으로 ─────────────

create or replace function public.create_trip(
  id uuid,
  name text,
  start_date date,
  end_date date,
  timezone text default 'Asia/Seoul'
)
returns public.trips
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  if create_trip.end_date < create_trip.start_date then
    raise exception 'validation/date-range: end_date must not precede start_date';
  end if;

  -- owner_id 는 클라이언트 입력이 아니라 세션에서 채운다 (RLS with check 와 동일 값)
  insert into public.trips (id, owner_id, name, start_date, end_date, timezone)
  values (create_trip.id, auth.uid(), create_trip.name,
          create_trip.start_date, create_trip.end_date,
          coalesce(create_trip.timezone, 'Asia/Seoul'))
  returning * into v_trip;

  insert into public.days (id, trip_id, date, position)
  select gen_random_uuid(), v_trip.id, g.d::date,
         (row_number() over (order by g.d))::int - 1
    from generate_series(create_trip.start_date::timestamp,
                         create_trip.end_date::timestamp,
                         interval '1 day') as g(d);

  return v_trip;
end;
$$;

-- ── E-14 update_trip_dates — Day 증감 캐스케이드 (FR-015) ────────────────────

create or replace function public.update_trip_dates(
  trip_id uuid,
  start_date date,
  end_date date
)
returns table (removed_stops integer, unassigned_places integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_placed uuid[];
  v_removed integer;
  v_unassigned integer;
  v_offset integer;
begin
  if update_trip_dates.end_date < update_trip_dates.start_date then
    raise exception 'validation/date-range: end_date must not precede start_date';
  end if;

  -- RLS(SECURITY INVOKER) 로 보이지 않는 trip 은 존재 자체를 알리지 않는다
  if not exists (
    select 1 from public.trips t
     where t.id = update_trip_dates.trip_id and t.deleted_at is null
  ) then
    raise exception 'not-found: trip %', update_trip_dates.trip_id;
  end if;

  -- 변경 전 어느 Day 엔가 배치돼 있던 Place 집합
  select coalesce(array_agg(distinct s.place_id), '{}'::uuid[])
    into v_placed
    from public.stops s
    join public.days d on d.id = s.day_id
   where d.trip_id = update_trip_dates.trip_id;

  select count(*)::int
    into v_removed
    from public.stops s
    join public.days d on d.id = s.day_id
   where d.trip_id = update_trip_dates.trip_id
     and (d.date < update_trip_dates.start_date or d.date > update_trip_dates.end_date);

  delete from public.days d
   where d.trip_id = update_trip_dates.trip_id
     and (d.date < update_trip_dates.start_date or d.date > update_trip_dates.end_date);

  -- 신규 Day 는 잔존 Day 의 최대 position 위쪽에 얹는다 (unique(trip_id, position) 충돌 회피)
  select coalesce(max(d.position), -1) + 1
    into v_offset
    from public.days d
   where d.trip_id = update_trip_dates.trip_id;

  insert into public.days (id, trip_id, date, position)
  select gen_random_uuid(), update_trip_dates.trip_id, g.d::date,
         v_offset + (row_number() over (order by g.d))::int - 1
    from generate_series(update_trip_dates.start_date::timestamp,
                         update_trip_dates.end_date::timestamp,
                         interval '1 day') as g(d)
   where not exists (
     select 1 from public.days x
      where x.trip_id = update_trip_dates.trip_id and x.date = g.d::date
   );

  -- 날짜 순 0..n 재부여. unique(trip_id, position) 이 즉시 검사되므로
  -- 목표 구간(0..n) 위쪽으로 한 번 밀어 올린 뒤 확정한다.
  select coalesce(max(d.position), -1) + count(*)::int + 1
    into v_offset
    from public.days d
   where d.trip_id = update_trip_dates.trip_id;

  update public.days d
     set position = d.position + v_offset
   where d.trip_id = update_trip_dates.trip_id;

  update public.days d
     set position = s.rn
    from (
      select x.id, (row_number() over (order by x.date))::int - 1 as rn
        from public.days x
       where x.trip_id = update_trip_dates.trip_id
    ) s
   where d.id = s.id and d.position <> s.rn;

  update public.trips t
     set start_date = update_trip_dates.start_date,
         end_date = update_trip_dates.end_date
   where t.id = update_trip_dates.trip_id;

  -- 이번 변경으로 어느 Day 에도 Stop 이 남지 않게 된 Place = 보관함 복귀분
  select count(*)::int
    into v_unassigned
    from unnest(v_placed) as p(place_id)
   where not exists (
     select 1
       from public.stops s
       join public.days d on d.id = s.day_id
      where d.trip_id = update_trip_dates.trip_id and s.place_id = p.place_id
   );

  removed_stops := v_removed;
  unassigned_places := v_unassigned;
  return next;
end;
$$;

-- ── E-07 reorder_day_items — stops∪legs 통합 position 재배열 (결정 #15) ──────

create or replace function public.reorder_day_items(day_id uuid, ordered_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_given integer := coalesce(array_length(reorder_day_items.ordered_ids, 1), 0);
  v_matched integer;
begin
  if not exists (select 1 from public.days d where d.id = reorder_day_items.day_id) then
    raise exception 'not-found: day %', reorder_day_items.day_id;
  end if;

  select count(*)::int
    into v_total
    from (
      select s.id from public.stops s where s.day_id = reorder_day_items.day_id
      union all
      select l.id from public.legs l where l.day_id = reorder_day_items.day_id
    ) items;

  select count(distinct x.item_id)::int
    into v_matched
    from unnest(reorder_day_items.ordered_ids) as x(item_id)
   where exists (select 1 from public.stops s
                  where s.id = x.item_id and s.day_id = reorder_day_items.day_id)
      or exists (select 1 from public.legs l
                  where l.id = x.item_id and l.day_id = reorder_day_items.day_id);

  -- 길이가 다르면 누락·이물질, distinct 가 모자라면 중복 — 셋 다 같은 계약 위반
  if v_given <> v_total or v_matched <> v_total then
    raise exception 'validation/position-dup: ordered_ids must list every stop and leg of the day exactly once';
  end if;

  update public.stops s
     set position = o.ord
    from (
      select t.item_id, (t.ord - 1)::int as ord
        from unnest(reorder_day_items.ordered_ids) with ordinality as t(item_id, ord)
    ) o
   where s.id = o.item_id and s.day_id = reorder_day_items.day_id;

  update public.legs l
     set position = o.ord
    from (
      select t.item_id, (t.ord - 1)::int as ord
        from unnest(reorder_day_items.ordered_ids) with ordinality as t(item_id, ord)
    ) o
   where l.id = o.item_id and l.day_id = reorder_day_items.day_id;
end;
$$;

-- ── E-10 enable_share / disable_share ────────────────────────────────────────

create or replace function public.enable_share(trip_id uuid)
returns bytea
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- UUID v4(122bit)로는 기준 미달 — 128bit CSPRNG (04 §위협모델)
  v_token bytea := extensions.gen_random_bytes(16);
begin
  update public.trips t
     set share_token = v_token,
         share_enabled = true
   where t.id = enable_share.trip_id and t.deleted_at is null;

  if not found then
    raise exception 'not-found: trip %', enable_share.trip_id;
  end if;

  return v_token;
end;
$$;

create or replace function public.disable_share(trip_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.trips t
     set share_token = null,
         share_enabled = false
   where t.id = disable_share.trip_id;

  if not found then
    raise exception 'not-found: trip %', disable_share.trip_id;
  end if;
end;
$$;

-- ── E-11 get_shared_trip — share-viewer 의 유일한 표면 ───────────────────────
-- 테이블 GRANT 가 없는 anon 이 호출하므로 SECURITY DEFINER. 반환은 읽기전용 스냅샷이며
-- owner_id·share_token 은 번들에서 제외한다.

create or replace function public.get_shared_trip(token bytea)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_bundle jsonb;
begin
  select * into v_trip
    from public.trips t
   where t.share_enabled
     and t.share_token is not null
     and t.deleted_at is null
     and t.share_token = get_shared_trip.token;

  if not found then
    -- 실패 계측 (04 알람 #4). 카운터는 호출자 트랜잭션에 속하므로
    -- 아래 예외로 롤백된다 — 계측이 필요한 호출자는 예외를 잡은 뒤 별도 트랜잭션에서 기록한다.
    insert into public.api_usage as u (date, counter, count)
    values (current_date, 'share_fail', 1)
    on conflict (date, counter) do update set count = u.count + 1;

    -- 해제·오타를 구분하지 않는 단일 예외 (05 E-11)
    raise exception 'share/invalid-token';
  end if;

  with pj as (
    select p.id,
           p.name,
           jsonb_build_object(
             'id', p.id,
             'category', p.category,
             'name', p.name,
             'address', p.address,
             'road_address', p.road_address,
             'lat', p.lat,
             'lng', p.lng,
             'provider', p.provider,
             'provider_link', p.provider_link,
             'memo', p.memo,
             'photos', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', ph.id,
                        'storage_path', ph.storage_path,
                        'thumb_path', ph.thumb_path,
                        'is_cover', ph.is_cover
                      ) order by ph.created_at, ph.id)
                 from public.photos ph where ph.place_id = p.id
             ), '[]'::jsonb)
           ) as obj
      from public.places p
     where p.trip_id = v_trip.id and p.deleted_at is null
  ),
  dj as (
    select d.position,
           jsonb_build_object(
             'id', d.id,
             'date', d.date,
             'position', d.position,
             'stops', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', s.id,
                        'place_id', s.place_id,
                        'position', s.position,
                        'start_time', s.start_time,
                        'note', s.note,
                        'place', pj.obj
                      ) order by s.position, s.id)
                 from public.stops s
                 left join pj on pj.id = s.place_id
                where s.day_id = d.id
             ), '[]'::jsonb),
             'legs', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', l.id,
                        'mode', l.mode,
                        'depart_at', l.depart_at,
                        'arrive_at', l.arrive_at,
                        'arrive_day_offset', l.arrive_day_offset,
                        'from_label', l.from_label,
                        'to_label', l.to_label,
                        'booking_ref', l.booking_ref,
                        'cost_amount', l.cost_amount,
                        'memo', l.memo,
                        'position', l.position,
                        'photos', coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'id', ph.id,
                                   'storage_path', ph.storage_path,
                                   'thumb_path', ph.thumb_path,
                                   'is_cover', ph.is_cover
                                 ) order by ph.created_at, ph.id)
                            from public.photos ph where ph.leg_id = l.id
                        ), '[]'::jsonb)
                      ) order by l.position, l.id)
                 from public.legs l where l.day_id = d.id
             ), '[]'::jsonb)
           ) as obj
      from public.days d
     where d.trip_id = v_trip.id
  )
  select jsonb_build_object(
           'id', v_trip.id,
           'name', v_trip.name,
           'start_date', v_trip.start_date,
           'end_date', v_trip.end_date,
           'timezone', v_trip.timezone,
           'created_at', v_trip.created_at,
           'updated_at', v_trip.updated_at,
           'days', coalesce((select jsonb_agg(dj.obj order by dj.position) from dj), '[]'::jsonb),
           'places', coalesce((select jsonb_agg(pj.obj order by pj.name, pj.id) from pj), '[]'::jsonb)
         )
    into v_bundle;

  return v_bundle;
end;
$$;

-- ── 운영 카운터·검색 캐시 (SECURITY DEFINER — 결정 #11) ─────────────────────

create or replace function public.record_search_usage(kind text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.api_usage as u (date, counter, count)
  values (current_date, record_search_usage.kind, 1)
  on conflict (date, counter) do update set count = u.count + 1
  returning u.count into v_count;

  return v_count;
end;
$$;

create or replace function public.store_search_cache(qhash text, response jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.search_cache as c (query_hash, response, fetched_at)
  values (store_search_cache.qhash, store_search_cache.response, now())
  on conflict (query_hash) do update
     set response = excluded.response,
         fetched_at = excluded.fetched_at;
end;
$$;

create or replace function public.get_cached_search(qhash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
begin
  -- 5분을 넘긴 캐시는 miss 로 취급 (SPEC §알고리즘 4)
  select c.response into v_response
    from public.search_cache c
   where c.query_hash = get_cached_search.qhash
     and c.fetched_at > now() - interval '5 minutes';

  return v_response;
end;
$$;

-- ── EXECUTE 권한 ────────────────────────────────────────────────────────────
-- Supabase 기본 default privileges 가 신규 함수에 anon 실행권을 부여하므로 명시적으로 회수한다.

revoke execute on function public.set_updated_at() from public, anon;
revoke execute on function public.create_trip(uuid, text, date, date, text) from public, anon;
revoke execute on function public.update_trip_dates(uuid, date, date) from public, anon;
revoke execute on function public.reorder_day_items(uuid, uuid[]) from public, anon;
revoke execute on function public.enable_share(uuid) from public, anon;
revoke execute on function public.disable_share(uuid) from public, anon;
revoke execute on function public.get_shared_trip(bytea) from public;
revoke execute on function public.record_search_usage(text) from public, anon;
revoke execute on function public.store_search_cache(text, jsonb) from public, anon;
revoke execute on function public.get_cached_search(text) from public, anon;

grant execute on function public.create_trip(uuid, text, date, date, text) to authenticated;
grant execute on function public.update_trip_dates(uuid, date, date) to authenticated;
grant execute on function public.reorder_day_items(uuid, uuid[]) to authenticated;
grant execute on function public.enable_share(uuid) to authenticated;
grant execute on function public.disable_share(uuid) to authenticated;
grant execute on function public.record_search_usage(text) to authenticated;
grant execute on function public.store_search_cache(text, jsonb) to authenticated;
grant execute on function public.get_cached_search(text) to authenticated;

-- 공유 뷰만 예외 — anon 도 실행 가능 (05 §권한 모델 RPC EXECUTE 정책)
grant execute on function public.get_shared_trip(bytea) to anon, authenticated;
