begin;

select plan(13);

-- ── 픽스처 (superuser) ────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date)
values ('12000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3',
        '지출 기록 여행', '2026-09-01', '2026-09-02');

insert into public.days (id, trip_id, date, position)
values ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '2026-09-01', 0);

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000c3', 'restaurant', '흑돼지집', 33.4996, 126.5312, 'naver');

-- ── 1. 컬럼 (4) — 결정 #24 ────────────────────────────────────────────────────

select has_column('public', 'stops', 'cost_amount',
  'stops.cost_amount 가 있다 (결정 #24 — 지출은 방문에 귀속)');
select col_type_is('public', 'stops', 'cost_amount', 'integer',
  '금액은 원 단위 정수다 — 부동소수점·문자열 금지 (결정 #17)');
select col_is_null('public', 'stops', 'cost_amount',
  '가격은 선택 입력이다 (FR-007)');
select col_hasnt_default('public', 'stops', 'cost_amount',
  '기본값을 두지 않는다 — 미입력(null)과 0원은 다른 값이다');

-- ── 2. CHECK 제약 (8) ─────────────────────────────────────────────────────────

select lives_ok(
  $$insert into public.stops (id, day_id, place_id, position)
    values ('42000000-0000-0000-0000-000000000001',
            '22000000-0000-0000-0000-000000000001',
            '32000000-0000-0000-0000-000000000001', 0)$$,
  '가격 없이 배치할 수 있다'
);
select is(
  (select cost_amount from public.stops where id = '42000000-0000-0000-0000-000000000001'),
  null::integer,
  '적지 않은 가격은 null 로 남는다'
);

select lives_ok(
  $$update public.stops set cost_amount = 0 where id = '42000000-0000-0000-0000-000000000001'$$,
  '0원도 적을 수 있다'
);
select is(
  (select cost_amount from public.stops where id = '42000000-0000-0000-0000-000000000001'),
  0,
  '0원은 미입력으로 뭉개지지 않는다'
);

select lives_ok(
  $$update public.stops set cost_amount = 12000 where id = '42000000-0000-0000-0000-000000000001'$$,
  '방문 지출을 적는다'
);
select is(
  (select cost_amount from public.stops where id = '42000000-0000-0000-0000-000000000001'),
  12000,
  '적은 금액이 그대로 남는다'
);

select throws_like(
  $$update public.stops set cost_amount = -1 where id = '42000000-0000-0000-0000-000000000001'$$,
  '%stops_cost_amount_check%',
  '음수 금액은 CHECK 로 거부된다'
);
select is(
  (select cost_amount from public.stops where id = '42000000-0000-0000-0000-000000000001'),
  12000,
  '거부된 갱신은 금액을 건드리지 않는다'
);

-- ── 3. legs 와 같은 어휘 (1) ──────────────────────────────────────────────────

select is(
  (select count(*)::int
     from pg_constraint
    where conname in ('stops_cost_amount_check', 'legs_cost_amount_check')),
  2,
  'Stop 과 Leg 의 가격 제약이 같은 이름 규칙을 쓴다 (결정 #17·#24)'
);

select * from finish();

rollback;
