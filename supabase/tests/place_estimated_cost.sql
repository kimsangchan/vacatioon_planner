begin;

select plan(15);

-- ── 픽스처 (superuser) ────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'd@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date)
values ('13000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c4',
        '경비 계획 여행', '2026-10-01', '2026-10-02');

insert into public.days (id, trip_id, date, position)
values ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '2026-10-01', 0);

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values ('33000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000c4', 'restaurant', '한옥카페', 35.8150, 127.1490, 'naver');

-- ── 1. 컬럼 (4) — 결정 #39 ────────────────────────────────────────────────────

select has_column('public', 'places', 'estimated_cost',
  'places.estimated_cost 가 있다 (결정 #39 — 예상 단가는 장소의 성질이다)');
select col_type_is('public', 'places', 'estimated_cost', 'integer',
  '금액은 원 단위 정수다 — 부동소수점·문자열 금지 (결정 #17)');
select col_is_null('public', 'places', 'estimated_cost',
  '예상 금액은 선택 입력이다');
select col_hasnt_default('public', 'places', 'estimated_cost',
  '기본값을 두지 않는다 — 미입력(null)과 0원은 다른 값이다');

-- ── 2. CHECK 제약 (8) ─────────────────────────────────────────────────────────

select is(
  (select estimated_cost from public.places where id = '33000000-0000-0000-0000-000000000001'),
  null::integer,
  '적지 않은 예상 금액은 null 로 남는다'
);

select lives_ok(
  $$update public.places set estimated_cost = 0 where id = '33000000-0000-0000-0000-000000000001'$$,
  '0원도 적을 수 있다 — 무료 입장 같은 곳'
);
select is(
  (select estimated_cost from public.places where id = '33000000-0000-0000-0000-000000000001'),
  0,
  '0원은 미입력으로 뭉개지지 않는다'
);

select lives_ok(
  $$update public.places set estimated_cost = 20000 where id = '33000000-0000-0000-0000-000000000001'$$,
  '예상 금액을 적는다'
);
select is(
  (select estimated_cost from public.places where id = '33000000-0000-0000-0000-000000000001'),
  20000,
  '적은 금액이 그대로 남는다'
);

select throws_like(
  $$update public.places set estimated_cost = -1 where id = '33000000-0000-0000-0000-000000000001'$$,
  '%places_estimated_cost_check%',
  '음수 금액은 CHECK 로 거부된다'
);
select is(
  (select estimated_cost from public.places where id = '33000000-0000-0000-0000-000000000001'),
  20000,
  '거부된 갱신은 금액을 건드리지 않는다'
);

select is(
  (select count(*)::int
     from pg_constraint
    where conname in ('stops_cost_amount_check', 'legs_cost_amount_check',
                      'places_estimated_cost_check')),
  3,
  'Place·Stop·Leg 의 금액 제약이 같은 이름 규칙을 쓴다 (결정 #17·#24·#39)'
);

-- ── 3. 예상과 실제는 서로를 덮지 않는다 (3) — 결정 #39 의 핵심 ────────────────
-- 같은 장소를 하루에 두 번 배치할 수 있다(#21). 그때 실제 지출은 방문마다 따로지만(#24),
-- 예상 단가는 장소에 하나뿐이다. 이 둘이 같은 칸을 쓰면 표현할 수 없는 상태다.

insert into public.stops (id, day_id, place_id, position, cost_amount)
values ('43000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001',
        '33000000-0000-0000-0000-000000000001', 0, 18000),
       ('43000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001',
        '33000000-0000-0000-0000-000000000001', 1, 9000);

select is(
  (select count(distinct cost_amount)::int from public.stops
    where place_id = '33000000-0000-0000-0000-000000000001'),
  2,
  '같은 장소 두 번 방문의 실제 지출은 서로 다르게 남는다 (#21·#24)'
);
select is(
  (select estimated_cost from public.places where id = '33000000-0000-0000-0000-000000000001'),
  20000,
  '방문 지출을 적어도 장소의 예상 단가는 흔들리지 않는다'
);
select is(
  (select count(*)::int from public.stops
    where place_id = '33000000-0000-0000-0000-000000000001' and cost_amount = 20000),
  0,
  '예상 단가가 방문 지출로 새어 들어가지 않는다 — 자동 채움은 없다'
);

select * from finish();

rollback;
