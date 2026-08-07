begin;

select plan(22);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date)
values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'A trip', '2026-08-08', '2026-08-10'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', 'B trip', '2026-08-08', '2026-08-10');

insert into public.days (id, trip_id, date, position)
values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '2026-08-08', 0),
  ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b2', '2026-08-08', 0);

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'spot', 'A place', 34.801942, 126.365881, 'naver'),
  ('30000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', 'spot', 'B place', 34.801942, 126.365881, 'naver');

insert into public.stops (id, day_id, place_id, position)
values
  ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 0),
  ('40000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b2', 0);

insert into public.legs (id, day_id, mode, depart_at, arrive_at, from_label, to_label, position)
values
  ('50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'train', '09:00', '10:00', 'A', 'B', 1),
  ('50000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-0000000000b2', 'train', '09:00', '10:00', 'A', 'B', 1);

insert into public.photos (id, place_id, storage_path, thumb_path)
values
  ('60000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'photos/60000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1.webp', 'photos/60000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1-thumb.webp'),
  ('60000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b2', 'photos/60000000-0000-0000-0000-0000000000b2/60000000-0000-0000-0000-0000000000b2.webp', 'photos/60000000-0000-0000-0000-0000000000b2/60000000-0000-0000-0000-0000000000b2-thumb.webp');

-- ── 사용자 A(authenticated)의 세계 ────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

-- SELECT 격리: 6테이블 전부 자기 것만
select is((select count(*)::int from public.trips), 1, 'owner sees only own trips');
select is((select count(*)::int from public.days), 1, 'owner sees only own days');
select is((select count(*)::int from public.places), 1, 'owner sees only own places');
select is((select count(*)::int from public.stops), 1, 'owner sees only own stops');
select is((select count(*)::int from public.legs), 1, 'owner sees only own legs');
select is((select count(*)::int from public.photos), 1, 'owner sees only own photos');

-- 교차 INSERT: 타인 소유 리소스에 자식 행 생성 전부 거부
select throws_like(
  $$insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
    values ('30000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', 'spot', 'bad', 34.8, 126.3, 'naver')$$,
  '%row-level security policy%',
  'cannot insert place into another owner trip'
);
select throws_like(
  $$insert into public.days (id, trip_id, date, position)
    values ('20000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000b2', '2026-08-09', 1)$$,
  '%row-level security policy%',
  'cannot insert day into another owner trip'
);
select throws_like(
  $$insert into public.stops (id, day_id, place_id, position)
    values ('40000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b2', 5)$$,
  '%row-level security policy%',
  'cannot insert stop into another owner day'
);
select throws_like(
  $$insert into public.legs (id, day_id, mode, depart_at, arrive_at, position)
    values ('50000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-0000000000b2', 'bus', '11:00', '12:00', 9)$$,
  '%row-level security policy%',
  'cannot insert leg into another owner day'
);
select throws_like(
  $$insert into public.photos (id, place_id, storage_path, thumb_path)
    values ('60000000-0000-0000-0000-0000000000c3', '30000000-0000-0000-0000-0000000000b2', 'photos/60000000-0000-0000-0000-0000000000c3/60000000-0000-0000-0000-0000000000c3.webp', 'photos/60000000-0000-0000-0000-0000000000c3/60000000-0000-0000-0000-0000000000c3-thumb.webp')$$,
  '%row-level security policy%',
  'cannot attach photo to another owner place'
);

-- 교차 UPDATE/DELETE: 조용히 0행 (RLS 필터).
-- 데이터 변경 CTE는 서브쿼리에 못 들어가므로 results_eq(최상위 EXECUTE)로 검증한다.
select results_eq(
  $$with u as (update public.trips set name = 'hacked' where id = '10000000-0000-0000-0000-0000000000b2' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'cross-tenant trip update affects 0 rows'
);
select results_eq(
  $$with d as (delete from public.trips where id = '10000000-0000-0000-0000-0000000000b2' returning 1)
    select count(*)::int from d$$,
  $$values (0)$$,
  'cross-tenant trip delete affects 0 rows'
);
select results_eq(
  $$with u as (update public.places set memo = 'hacked' where id = '30000000-0000-0000-0000-0000000000b2' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'cross-tenant place update affects 0 rows'
);

-- 운영 테이블: GRANT 자체가 없어 접근 불가 (RPC 전용 — decision-log #11)
select throws_like(
  $$select count(*) from public.search_cache$$,
  '%permission denied%',
  'authenticated cannot read search_cache directly'
);
select throws_like(
  $$select count(*) from public.api_usage$$,
  '%permission denied%',
  'authenticated cannot read api_usage directly'
);

-- ── anon: 테이블 접근 0 (share-viewer는 get_shared_trip RPC만 — 05 권한 모델) ──

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_like($$select count(*) from public.trips$$, '%permission denied%', 'anon cannot read trips');
select throws_like($$select count(*) from public.days$$, '%permission denied%', 'anon cannot read days');
select throws_like($$select count(*) from public.places$$, '%permission denied%', 'anon cannot read places');
select throws_like($$select count(*) from public.stops$$, '%permission denied%', 'anon cannot read stops');
select throws_like($$select count(*) from public.legs$$, '%permission denied%', 'anon cannot read legs');
select throws_like($$select count(*) from public.photos$$, '%permission denied%', 'anon cannot read photos');

select * from finish();

rollback;
