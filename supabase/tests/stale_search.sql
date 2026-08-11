-- T5-3 — get_stale_search: 업스트림 장애 시 "오래된 결과라도" 내주는 경로 (결정 #23이 남긴 설계 공백).
--
-- get_cached_search 는 5분을 넘기면 miss 로 취급한다. 프록시의 502 경로가 그 함수를 그대로 쓰고
-- 있어서, 502 에 cached[] 를 동봉하는 분기가 사실상 도달 불가였다(같은 요청에서 이미 miss 를 낸
-- 함수를 다시 부르므로). 이 함수는 5분 창을 무시하되 상한(7일)을 둔다 — 장소 정보는 주 단위로는
-- 잘 안 바뀌지만, 무제한으로 오래된 결과를 "검색 결과"라고 보여주면 그건 거짓말이 된다.

begin;

select plan(11);

-- ── 픽스처 (superuser) ────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'd@example.com', '', now(), now(), now());

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d4', true);

-- ── 1. 시그니처·보안 속성 (3) ─────────────────────────────────────────────────

select has_function('public', 'get_stale_search', array['text'],
  'get_stale_search(qhash) exists');
select function_returns('public', 'get_stale_search', array['text'], 'jsonb',
  'jsonb 를 돌려준다 — get_cached_search 와 같은 모양이라 프록시가 분기 없이 쓴다');
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proconfig @> array['search_path=""'] -- 저장 형식은 빈 문자열이 따옴표째 들어간다
      and p.proname = 'get_stale_search'),
  1,
  'SECURITY DEFINER + search_path 고정 — 운영 테이블 접근 경로는 RPC 뿐이다 (결정 #11)'
);

-- ── 2. 동작 (6) ───────────────────────────────────────────────────────────────

set local role authenticated;

select lives_ok(
  $$select public.store_search_cache('b1c2d3e4f5060708090a0b0c0d0e0f1011121314', '{"items": [1]}'::jsonb)$$,
  '픽스처: 캐시를 하나 기록한다'
);
select is(
  (select public.get_stale_search('b1c2d3e4f5060708090a0b0c0d0e0f1011121314')),
  '{"items": [1]}'::jsonb,
  '신선한 캐시도 그대로 반환한다 (stale 은 "5분 초과만"이 아니라 "창 무시"다)'
);
select is(
  (select public.get_stale_search('ffffffffffffffffffffffffffffffffffffffff')),
  null::jsonb,
  '없는 해시는 null'
);

-- 5분을 넘긴다 — 여기가 이 작업의 핵심이다
reset role;
update public.search_cache
   set fetched_at = now() - interval '6 minutes'
 where query_hash = 'b1c2d3e4f5060708090a0b0c0d0e0f1011121314';
set local role authenticated;

select is(
  (select public.get_cached_search('b1c2d3e4f5060708090a0b0c0d0e0f1011121314')),
  null::jsonb,
  '대조군: get_cached_search 는 5분을 넘기면 여전히 null 이다 (기존 계약 불변)'
);
select is(
  (select public.get_stale_search('b1c2d3e4f5060708090a0b0c0d0e0f1011121314')),
  '{"items": [1]}'::jsonb,
  '5분을 넘긴 캐시도 stale 로는 반환된다 — 502 에 cached[] 를 붙일 근거'
);

-- 상한을 넘긴다
reset role;
update public.search_cache
   set fetched_at = now() - interval '8 days'
 where query_hash = 'b1c2d3e4f5060708090a0b0c0d0e0f1011121314';
set local role authenticated;

select is(
  (select public.get_stale_search('b1c2d3e4f5060708090a0b0c0d0e0f1011121314')),
  null::jsonb,
  '7일을 넘긴 캐시는 stale 로도 내주지 않는다 — 상한 없는 폴백은 거짓말이 된다'
);

-- ── 3. EXECUTE 권한 (2) ───────────────────────────────────────────────────────

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_like(
  $$select public.get_stale_search('b1c2d3e4f5060708090a0b0c0d0e0f1011121314')$$,
  '%permission denied%',
  'anon 은 get_stale_search 를 호출할 수 없다 (운영 테이블 RPC 는 authenticated 한정)'
);

reset role;
select ok(
  has_function_privilege('authenticated', 'public.get_stale_search(text)', 'execute'),
  'authenticated 는 get_stale_search 를 호출할 수 있다'
);

select * from finish();
rollback;
