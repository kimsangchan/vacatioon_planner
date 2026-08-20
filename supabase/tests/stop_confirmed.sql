begin;

select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'c1@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date)
values ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d3',
        '확정 여행', '2026-12-01', '2026-12-02');

insert into public.days (id, trip_id, date, position)
values ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '2026-12-01', 0);

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values ('35000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000d3', 'spot', '성산일출봉', 33.4586, 126.9276, 'naver');

-- ── 확정 컬럼 (4) — 결정 #47 ──────────────────────────────────────────────────

select has_column('public', 'stops', 'confirmed',
  'stops.confirmed 가 있다 — 경로는 확정된 것만 잇는다 (결정 #47)');
select col_type_is('public', 'stops', 'confirmed', 'boolean',
  '확정은 참/거짓이다');
select col_not_null('public', 'stops', 'confirmed',
  '"모른다"는 상태를 두지 않는다 — 확정이거나 아니거나다');

insert into public.stops (id, day_id, place_id, position)
values ('45000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001',
        '35000000-0000-0000-0000-000000000001', 0);

select is(
  (select confirmed from public.stops where id = '45000000-0000-0000-0000-000000000001'),
  true,
  '일차에 넣으면 확정으로 시작한다 — 넣는 행위가 이미 "가기로 했다"는 뜻이다 (결정 #47)');

select * from finish();

rollback;
