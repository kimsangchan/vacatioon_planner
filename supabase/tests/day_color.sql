begin;

select plan(12);

-- ── 픽스처 (superuser) ────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000c5', 'authenticated', 'authenticated', 'e@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date)
values ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c5',
        '색 고르는 여행', '2026-11-01', '2026-11-03');

insert into public.days (id, trip_id, date, position)
values ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '2026-11-01', 0),
       ('24000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000001', '2026-11-02', 1);

-- ── 1. 컬럼 (3) — 결정 #41 ────────────────────────────────────────────────────

select has_column('public', 'days', 'color',
  'days.color 가 있다 — 일차 색은 그 일차의 성질이다 (결정 #41)');
select col_type_is('public', 'days', 'color', 'text',
  '색은 토큰 문자열이다 — hex 를 저장하면 라이트/다크를 DB 가 떠안는다');
select col_is_null('public', 'days', 'color',
  '고르지 않아도 된다 — 안 고르면 앱이 순서대로 기본색을 준다');

-- ── 2. 팔레트 밖은 거부 (5) ───────────────────────────────────────────────────

select lives_ok(
  $$update public.days set color = 'rose' where id = '24000000-0000-0000-0000-000000000001'$$,
  '팔레트 안의 색은 저장된다'
);
select is(
  (select color from public.days where id = '24000000-0000-0000-0000-000000000001'),
  'rose',
  '고른 색이 그대로 남는다'
);

select throws_like(
  $$update public.days set color = '#ff0000' where id = '24000000-0000-0000-0000-000000000001'$$,
  '%days_color_check%',
  'hex 는 거부된다 — 팔레트 밖의 색은 대비를 보장할 수 없다'
);
select throws_like(
  $$update public.days set color = 'chartreuse' where id = '24000000-0000-0000-0000-000000000001'$$,
  '%days_color_check%',
  '팔레트에 없는 이름도 거부된다'
);
select is(
  (select color from public.days where id = '24000000-0000-0000-0000-000000000001'),
  'rose',
  '거부된 갱신은 색을 건드리지 않는다'
);

-- ── 3. 되돌리기·독립성 (4) ────────────────────────────────────────────────────

select lives_ok(
  $$update public.days set color = null where id = '24000000-0000-0000-0000-000000000001'$$,
  '색을 지워 기본값으로 되돌릴 수 있다'
);
select is(
  (select color from public.days where id = '24000000-0000-0000-0000-000000000001'),
  null::text,
  '지운 색은 null 이다 — 기본색은 앱이 정한다'
);

select lives_ok(
  $$update public.days set color = 'sky' where id = '24000000-0000-0000-0000-000000000002'$$,
  '일차마다 따로 고른다'
);
select is(
  (select count(distinct coalesce(color, '(없음)'))::int from public.days
    where trip_id = '14000000-0000-0000-0000-000000000001'),
  2,
  '한 일차의 색이 옆 일차를 덮지 않는다'
);

select * from finish();

rollback;
