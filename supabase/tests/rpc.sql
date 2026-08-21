begin;

select plan(82);

-- ── 픽스처 (superuser) ────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@example.com', '', now(), now(), now());

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

-- ── 1. RPC 9종 존재·시그니처·보안 속성 (12) ───────────────────────────────────

select has_function('public', 'create_trip', array['uuid', 'text', 'date', 'date', 'text'],
  'create_trip(id, name, start_date, end_date, timezone) exists');
select has_function('public', 'update_trip_dates', array['uuid', 'date', 'date'],
  'update_trip_dates(trip_id, start_date, end_date) exists');
select has_function('public', 'reorder_day_items', array['uuid', 'uuid[]'],
  'reorder_day_items(day_id, ordered_ids) exists');
select has_function('public', 'enable_share', array['uuid'],
  'enable_share(trip_id) exists');
select has_function('public', 'disable_share', array['uuid'],
  'disable_share(trip_id) exists');
select has_function('public', 'get_shared_trip', array['bytea'],
  'get_shared_trip(token) exists');
select has_function('public', 'record_search_usage', array['text'],
  'record_search_usage(kind) exists');
select has_function('public', 'store_search_cache', array['text', 'jsonb'],
  'store_search_cache(qhash, response) exists');
select has_function('public', 'get_cached_search', array['text'],
  'get_cached_search(qhash) exists');

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array['get_shared_trip', 'record_search_usage', 'store_search_cache', 'get_cached_search'])),
  4,
  'share + 운영 RPC 4종은 SECURITY DEFINER'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not p.prosecdef
      and p.proname = any (array['create_trip', 'update_trip_dates', 'reorder_day_items', 'enable_share', 'disable_share'])),
  5,
  'owner RPC 5종은 SECURITY INVOKER (RLS 적용)'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""'])),
  0,
  'SECURITY DEFINER 함수는 전부 search_path 를 빈 문자열로 고정'
);

-- ── 2. create_trip (7) ────────────────────────────────────────────────────────

set local role authenticated;

select lives_ok(
  $$select public.create_trip(
      '11000000-0000-0000-0000-000000000001'::uuid, '제주 3일',
      '2026-09-01'::date, '2026-09-03'::date, 'Asia/Seoul')$$,
  'create_trip 은 trip + days 를 단일 트랜잭션으로 만든다'
);
select is(
  (select owner_id from public.trips where id = '11000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'create_trip 이 owner_id 를 auth.uid() 로 채운다'
);
select is(
  (select count(*)::int from public.days where trip_id = '11000000-0000-0000-0000-000000000001'),
  3,
  'create_trip 이 기간(3일)만큼 day 를 만든다'
);
select results_eq(
  $$select position, date from public.days
     where trip_id = '11000000-0000-0000-0000-000000000001' order by position$$,
  $$values (0, '2026-09-01'::date), (1, '2026-09-02'::date), (2, '2026-09-03'::date)$$,
  'day position 은 날짜 순 0..n'
);
select is(
  (select timezone from public.trips where id = '11000000-0000-0000-0000-000000000001'),
  'Asia/Seoul',
  'create_trip 이 timezone 을 저장한다'
);
select throws_like(
  $$select public.create_trip(
      '11000000-0000-0000-0000-0000000000ee'::uuid, '뒤집힌 기간',
      '2026-09-05'::date, '2026-09-01'::date, 'Asia/Seoul')$$,
  '%date-range%',
  'create_trip 은 end_date < start_date 를 거부한다'
);
select is(
  (select count(*)::int from public.trips where id = '11000000-0000-0000-0000-0000000000ee'),
  0,
  '거부된 create_trip 은 trip 을 남기지 않는다'
);

-- ── 3. update_trip_dates (14) ─────────────────────────────────────────────────

reset role;

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'restaurant', 'Alpha Resto', 33.499600, 126.531200, 'naver'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'lodging', 'Bravo Hotel', 33.510000, 126.520000, 'naver'),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'spot', 'Charlie Spot', 33.520000, 126.540000, 'naver');

insert into public.stops (id, day_id, place_id, position)
select '41000000-0000-0000-0000-000000000001'::uuid, d.id, '31000000-0000-0000-0000-000000000002'::uuid, 0
  from public.days d where d.trip_id = '11000000-0000-0000-0000-000000000001' and d.date = '2026-09-01'
union all
select '41000000-0000-0000-0000-000000000002'::uuid, d.id, '31000000-0000-0000-0000-000000000003'::uuid, 1
  from public.days d where d.trip_id = '11000000-0000-0000-0000-000000000001' and d.date = '2026-09-01'
union all
select '41000000-0000-0000-0000-000000000003'::uuid, d.id, '31000000-0000-0000-0000-000000000001'::uuid, 0
  from public.days d where d.trip_id = '11000000-0000-0000-0000-000000000001' and d.date = '2026-09-03'
union all
select '41000000-0000-0000-0000-000000000004'::uuid, d.id, '31000000-0000-0000-0000-000000000002'::uuid, 1
  from public.days d where d.trip_id = '11000000-0000-0000-0000-000000000001' and d.date = '2026-09-03';

set local role authenticated;

-- 축소: 09-03 삭제 → 그 날의 stop 2건 제거, Alpha Resto 만 어느 Day 에도 남지 않음
select results_eq(
  $$select removed_stops, unassigned_places
      from public.update_trip_dates('11000000-0000-0000-0000-000000000001'::uuid, '2026-09-01'::date, '2026-09-02'::date)$$,
  $$values (2, 1)$$,
  'update_trip_dates 가 제거 stop 수·보관함 복귀 place 수를 반환한다'
);
select is(
  (select count(*)::int from public.days where trip_id = '11000000-0000-0000-0000-000000000001'),
  2,
  '기간 밖 day 가 삭제된다'
);
select is(
  (select count(*)::int from public.stops s join public.days d on d.id = s.day_id
    where d.trip_id = '11000000-0000-0000-0000-000000000001'),
  2,
  '삭제된 day 의 stop 이 함께 제거된다'
);
select is(
  (select count(*)::int from public.places
    where trip_id = '11000000-0000-0000-0000-000000000001' and deleted_at is null),
  3,
  'place 는 보관함에 그대로 남는다'
);
select results_eq(
  $$select position from public.days
     where trip_id = '11000000-0000-0000-0000-000000000001' order by date$$,
  $$values (0), (1)$$,
  '축소 후 position 이 0..n 으로 재부여된다'
);
select results_eq(
  $$select start_date, end_date from public.trips where id = '11000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-09-01'::date, '2026-09-02'::date)$$,
  'trip 기간이 갱신된다'
);

-- 확장: 09-03·09-04 추가
select results_eq(
  $$select removed_stops, unassigned_places
      from public.update_trip_dates('11000000-0000-0000-0000-000000000001'::uuid, '2026-09-01'::date, '2026-09-04'::date)$$,
  $$values (0, 0)$$,
  '기간 확장은 아무것도 제거하지 않는다'
);
select is(
  (select count(*)::int from public.days where trip_id = '11000000-0000-0000-0000-000000000001'),
  4,
  '확장분만큼 day 가 추가된다'
);
select results_eq(
  $$select position from public.days
     where trip_id = '11000000-0000-0000-0000-000000000001' order by date$$,
  $$values (0), (1), (2), (3)$$,
  '확장 후에도 position 은 날짜 순 0..n'
);

-- 이동: 시작일이 밀려 09-01 삭제 (앞 삭제 + 뒤 추가 동시)
select results_eq(
  $$select removed_stops, unassigned_places
      from public.update_trip_dates('11000000-0000-0000-0000-000000000001'::uuid, '2026-09-02'::date, '2026-09-05'::date)$$,
  $$values (2, 2)$$,
  '앞쪽 day 삭제분도 stop·place 카운트에 반영된다'
);
select results_eq(
  $$select position, date from public.days
     where trip_id = '11000000-0000-0000-0000-000000000001' order by position$$,
  $$values (0, '2026-09-02'::date), (1, '2026-09-03'::date), (2, '2026-09-04'::date), (3, '2026-09-05'::date)$$,
  '잔존 day 와 신규 day 가 하나의 0..n 시퀀스를 이룬다'
);

-- 원자성: 잘못된 입력은 예외 + 기존 데이터 무변화
select throws_like(
  $$select * from public.update_trip_dates('11000000-0000-0000-0000-000000000001'::uuid, '2026-09-05'::date, '2026-09-02'::date)$$,
  '%date-range%',
  'update_trip_dates 는 뒤집힌 기간을 거부한다'
);
select is(
  (select count(*)::int from public.days where trip_id = '11000000-0000-0000-0000-000000000001'),
  4,
  '거부된 update_trip_dates 는 day 를 건드리지 않는다'
);
select results_eq(
  $$select start_date, end_date from public.trips where id = '11000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-09-02'::date, '2026-09-05'::date)$$,
  '거부된 update_trip_dates 는 trip 기간을 건드리지 않는다'
);

-- ── 4. reorder_day_items (8) ──────────────────────────────────────────────────

reset role;

insert into public.stops (id, day_id, place_id, position)
select '41000000-0000-0000-0000-000000000011'::uuid, d.id, '31000000-0000-0000-0000-000000000001'::uuid, 0
  from public.days d where d.trip_id = '11000000-0000-0000-0000-000000000001' and d.date = '2026-09-02'
union all
select '41000000-0000-0000-0000-000000000012'::uuid, d.id, '31000000-0000-0000-0000-000000000002'::uuid, 1
  from public.days d where d.trip_id = '11000000-0000-0000-0000-000000000001' and d.date = '2026-09-02';

insert into public.legs (id, day_id, mode, depart_at, arrive_at, from_label, to_label, cost_amount, position)
select '51000000-0000-0000-0000-000000000011'::uuid, d.id, 'train', '09:00', '10:30', '제주', '서귀포', 12800, 2
  from public.days d where d.trip_id = '11000000-0000-0000-0000-000000000001' and d.date = '2026-09-02';

set local role authenticated;

select lives_ok(
  $$select public.reorder_day_items(
      (select id from public.days where trip_id = '11000000-0000-0000-0000-000000000001' and date = '2026-09-02'),
      array['51000000-0000-0000-0000-000000000011',
            '41000000-0000-0000-0000-000000000012',
            '41000000-0000-0000-0000-000000000011']::uuid[])$$,
  'reorder_day_items 가 stop 과 leg 를 통합 재배열한다'
);
select is((select position from public.legs where id = '51000000-0000-0000-0000-000000000011'), 0,
  'leg 가 position 0 으로 이동');
select is((select position from public.stops where id = '41000000-0000-0000-0000-000000000012'), 1,
  '두 번째 stop 이 position 1');
select is((select position from public.stops where id = '41000000-0000-0000-0000-000000000011'), 2,
  '첫 번째 stop 이 position 2');
select throws_like(
  $$select public.reorder_day_items(
      (select id from public.days where trip_id = '11000000-0000-0000-0000-000000000001' and date = '2026-09-02'),
      array['41000000-0000-0000-0000-000000000011',
            '41000000-0000-0000-0000-000000000012']::uuid[])$$,
  '%position-dup%',
  '항목이 빠진 배열은 거부된다'
);
select throws_like(
  $$select public.reorder_day_items(
      (select id from public.days where trip_id = '11000000-0000-0000-0000-000000000001' and date = '2026-09-02'),
      array['41000000-0000-0000-0000-000000000011',
            '41000000-0000-0000-0000-000000000011',
            '51000000-0000-0000-0000-000000000011']::uuid[])$$,
  '%position-dup%',
  '중복된 id 가 있는 배열은 거부된다'
);
select throws_like(
  $$select public.reorder_day_items(
      (select id from public.days where trip_id = '11000000-0000-0000-0000-000000000001' and date = '2026-09-02'),
      array['41000000-0000-0000-0000-000000000011',
            '41000000-0000-0000-0000-000000000012',
            '51000000-0000-0000-0000-000000000011',
            '41000000-0000-0000-0000-0000000000ff']::uuid[])$$,
  '%position-dup%',
  '해당 day 의 항목이 아닌 id 가 섞이면 거부된다'
);
select is((select position from public.legs where id = '51000000-0000-0000-0000-000000000011'), 0,
  '거부된 재배열은 position 을 건드리지 않는다');

-- ── 5. enable_share / disable_share / get_shared_trip (16) ────────────────────

reset role;

insert into public.photos (id, place_id, storage_path, thumb_path, is_cover)
values ('61000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001',
        'photos/61000000-0000-0000-0000-000000000001/61000000-0000-0000-0000-000000000001.webp',
        'photos/61000000-0000-0000-0000-000000000001/61000000-0000-0000-0000-000000000001-thumb.webp', true);

insert into public.photos (id, leg_id, storage_path, thumb_path, is_cover)
values ('61000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000011',
        'photos/61000000-0000-0000-0000-000000000002/61000000-0000-0000-0000-000000000002.webp',
        'photos/61000000-0000-0000-0000-000000000002/61000000-0000-0000-0000-000000000002-thumb.webp', false);

set local role authenticated;

select is(
  (select octet_length(public.enable_share('11000000-0000-0000-0000-000000000001'::uuid))),
  16,
  'enable_share 가 128bit 토큰을 발급한다'
);
select is(
  (select share_enabled from public.trips where id = '11000000-0000-0000-0000-000000000001'),
  true,
  'enable_share 가 share_enabled 를 켠다'
);

reset role;
create temporary table shared_token as
  select share_token as token from public.trips where id = '11000000-0000-0000-0000-000000000001';
grant select on shared_token to anon, authenticated;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select public.get_shared_trip(token)->>'name' from shared_token),
  '제주 3일',
  '공유 번들이 trip 이름을 담는다'
);
select ok(
  (select not (public.get_shared_trip(token) ? 'owner_id') from shared_token),
  '공유 번들에 owner_id 가 없다'
);
select ok(
  (select not (public.get_shared_trip(token) ? 'share_token') from shared_token),
  '공유 번들에 share_token 이 없다'
);
select is(
  (select jsonb_array_length(public.get_shared_trip(token)->'days') from shared_token),
  4,
  '공유 번들이 days 를 전부 중첩한다'
);
select is(
  (select jsonb_array_length(public.get_shared_trip(token)->'places') from shared_token),
  2,
  '공유 번들은 일정에 배치된 places 만 중첩한다'
);
select is(
  (select jsonb_array_length(public.get_shared_trip(token)->'days'->0->'stops') from shared_token),
  2,
  '공유 번들이 day 아래 stops 를 중첩한다'
);
-- 이동은 싣되 **예약번호·비용·메모·캡처는 뺀다** (0017). 자세한 단언은
-- supabase/tests/shared_trip_projection.sql 에 있다 — 여기서는 예약번호가 안 새는 것만 지킨다.
select ok(
  (select not exists (
     select 1
       from jsonb_array_elements(public.get_shared_trip(token)->'days'->0->'legs') as leg
      where leg ?| array['booking_ref', 'cost_amount', 'memo', 'photos']
   ) from shared_token),
  '공유한 이동에 예약번호·비용·메모·사진 경로가 섞이지 않는다'
);
select ok(
  (select bool_and(place->>'memo' = '')
     from shared_token, jsonb_array_elements(public.get_shared_trip(token)->'places') place),
  '공유 장소의 개인 메모는 비워 둔다'
);
select ok(
  (select bool_and(jsonb_array_length(place->'photos') = 0)
     from shared_token, jsonb_array_elements(public.get_shared_trip(token)->'places') place),
  '공유 장소의 사진 경로는 내보내지 않는다'
);
select throws_like(
  $$select public.get_shared_trip(decode('00112233445566778899aabbccddeeff', 'hex'))$$,
  '%share/invalid-token%',
  '틀린 토큰은 단일 예외로 거부된다'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select lives_ok(
  $$select public.disable_share('11000000-0000-0000-0000-000000000001'::uuid)$$,
  'disable_share 가 실행된다'
);
select is(
  (select share_token from public.trips where id = '11000000-0000-0000-0000-000000000001'),
  null::bytea,
  'disable_share 가 토큰을 비운다'
);
select is(
  (select share_enabled from public.trips where id = '11000000-0000-0000-0000-000000000001'),
  false,
  'disable_share 가 share_enabled 를 끈다'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_like(
  $$select public.get_shared_trip((select token from shared_token))$$,
  '%share/invalid-token%',
  '해제된 토큰도 오타와 같은 예외로 거부된다 (구분 없음 — E-11)'
);

-- ── 6. record_search_usage / store_search_cache / get_cached_search (10) ──────

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select is((select public.record_search_usage('naver_search')), 1, '첫 호출은 1 을 반환');
select is((select public.record_search_usage('naver_search')), 2, '두 번째 호출은 2 를 반환');
select is((select public.record_search_usage('map_load')), 1, '카운터는 kind 별로 독립적이다');

select lives_ok(
  $$select public.store_search_cache('a0b1c2d3e4f5060708090a0b0c0d0e0f10111213', '{"items": [1]}'::jsonb)$$,
  'store_search_cache 가 캐시를 기록한다'
);
select is(
  (select public.get_cached_search('a0b1c2d3e4f5060708090a0b0c0d0e0f10111213')),
  '{"items": [1]}'::jsonb,
  '5분 이내 캐시는 그대로 반환된다'
);
select is(
  (select public.get_cached_search('ffffffffffffffffffffffffffffffffffffffff')),
  null::jsonb,
  '없는 해시는 null'
);

reset role;
update public.search_cache
   set fetched_at = now() - interval '6 minutes'
 where query_hash = 'a0b1c2d3e4f5060708090a0b0c0d0e0f10111213';
set local role authenticated;

select is(
  (select public.get_cached_search('a0b1c2d3e4f5060708090a0b0c0d0e0f10111213')),
  null::jsonb,
  '5분을 넘긴 캐시는 null'
);
select lives_ok(
  $$select public.store_search_cache('a0b1c2d3e4f5060708090a0b0c0d0e0f10111213', '{"items": [2]}'::jsonb)$$,
  'store_search_cache 는 upsert 다'
);
select is(
  (select public.get_cached_search('a0b1c2d3e4f5060708090a0b0c0d0e0f10111213')),
  '{"items": [2]}'::jsonb,
  'upsert 가 응답과 fetched_at 을 갱신한다'
);

reset role;
select is(
  (select count(*)::int from public.search_cache where query_hash = 'a0b1c2d3e4f5060708090a0b0c0d0e0f10111213'),
  1,
  'upsert 는 행을 늘리지 않는다'
);

-- ── 7. EXECUTE 권한 (11) ──────────────────────────────────────────────────────

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_like(
  $$select public.record_search_usage('naver_search')$$,
  '%permission denied%', 'anon 은 record_search_usage 를 호출할 수 없다');
select throws_like(
  $$select public.store_search_cache('a0b1c2d3e4f5060708090a0b0c0d0e0f10111213', '{}'::jsonb)$$,
  '%permission denied%', 'anon 은 store_search_cache 를 호출할 수 없다');
select throws_like(
  $$select public.get_cached_search('a0b1c2d3e4f5060708090a0b0c0d0e0f10111213')$$,
  '%permission denied%', 'anon 은 get_cached_search 를 호출할 수 없다');
select throws_like(
  $$select public.create_trip('11000000-0000-0000-0000-0000000000cc'::uuid, 'x', '2026-09-01'::date, '2026-09-02'::date, 'Asia/Seoul')$$,
  '%permission denied%', 'anon 은 create_trip 을 호출할 수 없다');
select throws_like(
  $$select * from public.update_trip_dates('11000000-0000-0000-0000-000000000001'::uuid, '2026-09-02'::date, '2026-09-03'::date)$$,
  '%permission denied%', 'anon 은 update_trip_dates 를 호출할 수 없다');
select throws_like(
  $$select public.reorder_day_items('11000000-0000-0000-0000-0000000000cc'::uuid, array[]::uuid[])$$,
  '%permission denied%', 'anon 은 reorder_day_items 를 호출할 수 없다');
select throws_like(
  $$select public.enable_share('11000000-0000-0000-0000-000000000001'::uuid)$$,
  '%permission denied%', 'anon 은 enable_share 를 호출할 수 없다');
select throws_like(
  $$select public.disable_share('11000000-0000-0000-0000-000000000001'::uuid)$$,
  '%permission denied%', 'anon 은 disable_share 를 호출할 수 없다');

reset role;

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array['create_trip', 'update_trip_dates', 'reorder_day_items', 'enable_share',
                                 'disable_share', 'get_shared_trip', 'record_search_usage',
                                 'store_search_cache', 'get_cached_search'])
      and has_function_privilege('authenticated', p.oid, 'execute')),
  9,
  'authenticated 는 RPC 9종 전부 실행 가능'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array['create_trip', 'update_trip_dates', 'reorder_day_items', 'enable_share',
                                 'disable_share', 'get_shared_trip', 'record_search_usage',
                                 'store_search_cache', 'get_cached_search'])
      and has_function_privilege('anon', p.oid, 'execute')),
  1,
  'anon 이 실행 가능한 RPC 는 정확히 1종'
);
select ok(
  has_function_privilege('anon', 'public.get_shared_trip(bytea)', 'execute'),
  '그 1종은 get_shared_trip (공유 뷰 전제 — 05 권한 모델)'
);

-- ── 8. updated_at 자동 갱신 트리거 (4) ────────────────────────────────────────

insert into public.trips (id, owner_id, name, start_date, end_date, created_at, updated_at)
values ('11000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000a1', 'touch',
        '2026-10-01', '2026-10-02', '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');

select is(
  (select updated_at from public.trips where id = '11000000-0000-0000-0000-0000000000ff'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'INSERT 는 지정한 updated_at 을 유지한다'
);
select lives_ok(
  $$update public.trips set name = 'touched' where id = '11000000-0000-0000-0000-0000000000ff'$$,
  'trips UPDATE 가 실행된다'
);
select ok(
  (select updated_at from public.trips where id = '11000000-0000-0000-0000-0000000000ff') = now(),
  'set_updated_at 트리거가 updated_at 을 갱신한다'
);
select is(
  (select count(*)::int
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgname = 'set_updated_at'),
  7,
  'updated_at 컬럼이 있는 7테이블 전부에 트리거가 걸려 있다 (place_votes 추가, 결정 #46)'
);

select * from finish();

rollback;
