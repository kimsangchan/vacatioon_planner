begin;

select plan(21);

-- ── 픽스처 (superuser) ────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'v1@example.com', '', now(), now(), now()),
       ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'v2@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date, share_enabled, share_token)
values ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1',
        '별표 여행', '2026-11-01', '2026-11-02', true, '\xdeadbeefdeadbeefdeadbeefdeadbeef'::bytea),
       ('14000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2',
        '남의 여행', '2026-11-01', '2026-11-02', false, null);

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000d1', 'restaurant', '흑돼지집', 33.4996, 126.5312, 'naver'),
       ('34000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-0000000000d2', 'spot', '남의 장소', 33.2448, 126.4128, 'naver');

-- ── 1. 표 테이블 (6) — 결정 #46 ───────────────────────────────────────────────

select has_table('public', 'place_votes', 'place_votes 테이블이 있다 (결정 #46)');
select col_type_is('public', 'place_votes', 'stars', 'smallint',
  '별 세기는 정수다 — 1~3 이면 협의에 충분하다');
select col_is_pk('public', 'place_votes', array['place_id', 'voter_key'],
  '한 사람이 한 장소에 표 하나 — 여러 번 눌러 표를 부풀리지 못한다');

-- #46 은 3단계였다. 사용자가 써 보고 5점을 원해 0013 에서 넓혔다 — 쓰는 사람의 판단이 세다
-- 뒤의 개수 단언을 오염시키지 않도록 넣자마자 치운다 — 여기서 보려는 것은 범위뿐이다
select lives_ok(
  $$insert into public.place_votes (place_id, voter_key, stars)
    values ('34000000-0000-0000-0000-000000000001', 'browser-fivestar', 5);
    delete from public.place_votes where voter_key = 'browser-fivestar'$$,
  '5점까지 받는다 (0013)');

select throws_ok(
  $$insert into public.place_votes (place_id, voter_key, stars)
    values ('34000000-0000-0000-0000-000000000001', 'browser-sixstars', 6)$$,
  '23514',
  null,
  '6점은 거절한다 — 상한이 없으면 표의 뜻이 사라진다');

select throws_ok(
  $$insert into public.place_votes (place_id, voter_key, stars)
    values ('34000000-0000-0000-0000-000000000001', 'short', 2)$$,
  '23514',
  null,
  '너무 짧은 voter_key 는 거절한다 — 남의 표를 맞혀 덮을 여지를 줄인다');

select lives_ok(
  $$delete from public.places where id = '34000000-0000-0000-0000-000000000002'$$,
  '장소를 지우면 표도 함께 사라진다 (on delete cascade)');

-- ── 2. 권한 (3) — anon 은 테이블에 직접 닿지 않는다 (0007 의 규칙) ────────────

select ok(not has_table_privilege('anon', 'public.place_votes', 'select'),
  'anon 은 표를 직접 읽지 못한다 — 유일한 문은 RPC 다');
select ok(not has_table_privilege('anon', 'public.place_votes', 'insert'),
  'anon 은 표를 직접 쓰지 못한다');
select ok(has_table_privilege('authenticated', 'public.place_votes', 'select'),
  '로그인한 주인은 자기 여행의 표를 본다');

-- ── 3. RPC (7) — 공유 링크로 들어온 사람이 누르는 문 ──────────────────────────
--
-- anon 으로 부르고, 결과 확인은 role 을 되돌린 뒤에 한다 —
-- anon 은 테이블을 직접 못 읽는 것이 이 설계의 요점이라 그대로 두면 확인조차 못 한다.

set local role anon;
select lives_ok(
  $$select public.vote_shared_place(
      decode('deadbeefdeadbeefdeadbeefdeadbeef','hex'),
      '34000000-0000-0000-0000-000000000001', 'browser-11111111', 3::smallint)$$,
  '링크를 가진 사람은 계정 없이 별표를 누른다 (결정 #46)');
reset role;

select is(
  (select stars from public.place_votes
    where place_id = '34000000-0000-0000-0000-000000000001' and voter_key = 'browser-11111111'),
  3::smallint,
  '누른 세기가 그대로 남는다');

set local role anon;
select lives_ok(
  $$select public.vote_shared_place(
      decode('deadbeefdeadbeefdeadbeefdeadbeef','hex'),
      '34000000-0000-0000-0000-000000000001', 'browser-11111111', 1::smallint)$$,
  '같은 사람이 다시 누르면 표가 바뀐다 — 늘지 않는다');
reset role;

select is(
  (select count(*) from public.place_votes
    where place_id = '34000000-0000-0000-0000-000000000001'),
  1::bigint,
  '두 번 눌러도 표는 하나다');

set local role anon;
select lives_ok(
  $$select public.vote_shared_place(
      decode('deadbeefdeadbeefdeadbeefdeadbeef','hex'),
      '34000000-0000-0000-0000-000000000001', 'browser-11111111', 0::smallint)$$,
  '0 은 별표 취소다 — 지우려고 함수를 하나 더 두지 않는다');
reset role;

select is(
  (select count(*) from public.place_votes
    where place_id = '34000000-0000-0000-0000-000000000001'),
  0::bigint,
  '취소하면 표가 사라진다');

set local role anon;
select throws_like(
  $$select public.vote_shared_place(
      decode('baadf00dbaadf00dbaadf00dbaadf00d','hex'),
      '34000000-0000-0000-0000-000000000001', 'browser-22222222', 2::smallint)$$,
  '%share/invalid-token%',
  '없는 토큰으로는 못 누른다 — 해제·오타를 구분하지 않는다');
reset role;

-- ── 4. 공유 뷰가 읽는 표 (4) — 결정 #46 ──────────────────────────────────────

reset role;
insert into public.place_votes (place_id, voter_key, stars) values
 ('34000000-0000-0000-0000-000000000001', 'browser-aaaaaaaa', 3),
 ('34000000-0000-0000-0000-000000000001', 'browser-bbbbbbbb', 1);

set local role anon;

-- 하트로 바뀐 뒤(#59) 합계는 **표 수**다. 옛 1~5 표도 그대로 하트 하나로 읽힌다
select is(
  (public.get_shared_votes(decode('deadbeefdeadbeefdeadbeefdeadbeef','hex'), 'browser-aaaaaaaa')
     -> 0 ->> 'hearts')::int,
  2,
  '장소별로 접어 하트 수를 준다 — 화면이 쓰는 단위는 표 하나가 아니라 장소 하나다');

select is(
  (public.get_shared_votes(decode('deadbeefdeadbeefdeadbeefdeadbeef','hex'), 'browser-aaaaaaaa')
     -> 0 ->> 'mine')::boolean,
  true,
  '내가 눌렀는지는 서버가 대조해 알려 준다 — 남의 키를 내보내면 그 키로 남의 표를 덮을 수 있다');

select is(
  public.get_shared_votes(decode('deadbeefdeadbeefdeadbeefdeadbeef','hex'), 'browser-aaaaaaaa')
     -> 0 -> 'names',
  '[]'::jsonb,
  '이름을 안 적은 옛 표는 이름 없이 수에만 든다');

select throws_like(
  $$select public.get_shared_votes(decode('baadf00dbaadf00dbaadf00dbaadf00d','hex'), 'browser-aaaaaaaa')$$,
  '%share/invalid-token%',
  '없는 토큰으로는 표도 못 본다');

reset role;

select * from finish();

rollback;
