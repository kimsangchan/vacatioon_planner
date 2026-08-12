-- 테이블 권한을 명시적으로 검증한다 (0007_revoke_anon.sql).
--
-- 기존 rls.sql 은 "anon 으로 select 하면 permission denied" 를 본다. 그건 로컬 기본값 덕에
-- 통과하고 있었고, 원격(클라우드)에서는 anon 에 grant 가 남아 같은 단언이 성립하지 않았다.
-- 여기서는 RLS 를 거치지 않고 **권한 자체**를 직접 묻는다 — 어느 환경에 걸어도 같은 답이 나온다.

begin;

select plan(11);

-- ── 1. 운영 테이블: 유일한 경로는 SECURITY DEFINER RPC 다 (결정 #11) ──────────

select ok(
  not has_table_privilege('anon', 'public.search_cache', 'select'),
  'anon 은 search_cache 를 읽을 수 없다'
);
select ok(
  not has_table_privilege('authenticated', 'public.search_cache', 'select'),
  'authenticated 도 search_cache 를 직접 읽지 않는다 — RPC 로만 간다'
);
select ok(
  not has_table_privilege('anon', 'public.api_usage', 'select'),
  'anon 은 api_usage 를 읽을 수 없다'
);
select ok(
  not has_table_privilege('authenticated', 'public.api_usage', 'update'),
  'authenticated 는 카운터를 직접 고칠 수 없다 — 조작 방지'
);

-- ── 2. 사용자 데이터: anon 은 어떤 표면으로도 직접 읽지 않는다 (6) ────────────

select ok(
  not has_table_privilege('anon', 'public.' || t, 'select'),
  'anon 은 ' || t || ' 를 직접 읽을 수 없다'
)
from unnest(array['trips', 'days', 'places', 'stops', 'legs', 'photos']) t;

-- ── 3. 로그인 사용자는 제 데이터를 다룬다 (RLS 가 행을 거른다) ────────────────

select ok(
  has_table_privilege('authenticated', 'public.trips', 'select')
    and has_table_privilege('authenticated', 'public.places', 'insert'),
  'authenticated 는 제 여행·장소를 다룰 수 있다 (행 범위는 RLS 가 정한다)'
);

select * from finish();
rollback;
