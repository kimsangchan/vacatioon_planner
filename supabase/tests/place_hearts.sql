begin;

select plan(12);

-- 하트 (결정 #59) — 묻는 것은 하나다: 가고 싶은가. 그리고 **누가** 눌렀는지 안다.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000f6', 'authenticated', 'authenticated',
        'hearts@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date, share_enabled, share_token)
values ('1a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f6',
        '하트 여행', '2027-02-01', '2027-02-02', true,
        decode('aabbccddeeff00112233445566778899', 'hex'));

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values
  ('3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000f6', 'restaurant', '하트 식당', 33.4996, 126.5312, 'manual'),
  ('3a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000f6', 'spot', '하트 스팟', 33.4581, 126.9425, 'manual');

select has_column('public', 'place_votes', 'voter_name', 'place_votes 에 이름 칸이 있다');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

-- ── 누르기 ────────────────────────────────────────────────────────────────────
select lives_ok(
  $$select public.heart_shared_place(
      decode('aabbccddeeff00112233445566778899', 'hex'),
      '3a000000-0000-0000-0000-000000000001'::uuid, 'voter-minsu-0001', '민수', true)$$,
  '공유 링크로 들어온 사람이 하트를 누른다 — 계정은 없다'
);
reset role;
select is(
  (select stars::int from public.place_votes
    where place_id = '3a000000-0000-0000-0000-000000000001' and voter_key = 'voter-minsu-0001'),
  1,
  '하트는 stars 1 로 남는다 — 기존 1~5 표도 그대로 하트로 읽힌다'
);
select is(
  (select voter_name from public.place_votes
    where place_id = '3a000000-0000-0000-0000-000000000001' and voter_key = 'voter-minsu-0001'),
  '민수',
  '누가 눌렀는지 이름으로 남는다'
);

set local role anon;

-- 같은 사람이 다시 눌러 이름만 고친다
select lives_ok(
  $$select public.heart_shared_place(
      decode('aabbccddeeff00112233445566778899', 'hex'),
      '3a000000-0000-0000-0000-000000000001'::uuid, 'voter-minsu-0001', '김민수', true)$$,
  '이름을 고쳐 다시 눌러도 표는 하나다'
);
reset role;
select is(
  (select count(*)::int from public.place_votes
    where place_id = '3a000000-0000-0000-0000-000000000001'),
  1,
  '같은 사람의 표는 겹치지 않는다'
);
set local role anon;

-- 이름을 안 적은 사람도 누를 수 있다
select lives_ok(
  $$select public.heart_shared_place(
      decode('aabbccddeeff00112233445566778899', 'hex'),
      '3a000000-0000-0000-0000-000000000001'::uuid, 'voter-anon-0002', '', true)$$,
  '이름을 안 적어도 하트는 눌린다 — 이름을 강요하지 않는다'
);

-- ── 읽기 ──────────────────────────────────────────────────────────────────────
select is(
  public.get_shared_votes(decode('aabbccddeeff00112233445566778899', 'hex'), 'voter-minsu-0001')
    ->0->>'hearts',
  '2',
  '하트 수를 센다'
);
select is(
  public.get_shared_votes(decode('aabbccddeeff00112233445566778899', 'hex'), 'voter-minsu-0001')
    ->0->'names',
  '["김민수"]'::jsonb,
  '이름을 적은 사람만 이름으로 나온다 — 안 적은 사람은 수에만 든다'
);
select is(
  public.get_shared_votes(decode('aabbccddeeff00112233445566778899', 'hex'), 'voter-minsu-0001')
    ->0->>'mine',
  'true',
  '내가 눌렀는지 알려 준다'
);

-- ── 끄기 ──────────────────────────────────────────────────────────────────────
select lives_ok(
  $$select public.heart_shared_place(
      decode('aabbccddeeff00112233445566778899', 'hex'),
      '3a000000-0000-0000-0000-000000000001'::uuid, 'voter-minsu-0001', '김민수', false)$$,
  '다시 누르면 취소다 — 지우는 함수를 따로 두지 않는다'
);
reset role;
select is(
  (select count(*)::int from public.place_votes
    where place_id = '3a000000-0000-0000-0000-000000000001' and voter_key = 'voter-minsu-0001'),
  0,
  '취소하면 표가 사라진다'
);

select * from finish();
rollback;
