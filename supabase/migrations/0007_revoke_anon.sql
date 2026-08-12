-- 권한을 명시적으로 회수한다 — 지금까지는 로컬 기본값에 기대고 있었다.
--
-- 발견 경위: 원격(클라우드) 프로젝트에 마이그레이션을 반영한 뒤 대조해 보니
-- `has_table_privilege('anon','public.trips','select')` 이 로컬은 false, **원격은 true** 였다.
-- 클라우드 프로젝트는 생성 시 public 스키마에 anon·authenticated 기본 권한을 걸어 두는데,
-- 0002_rls.sql 에는 revoke 가 한 줄도 없어 그 기본값이 그대로 남았다.
--
-- 지금 당장 유출은 없다 — RLS 가 켜져 있고, 운영 테이블(search_cache·api_usage)은 정책이
-- 아예 없어 전면 deny 다. 그러나 ① 05 §권한 모델의 "운영 테이블 전면 deny"·결정 #11 의 의도와
-- 어긋나고 ② pgTAP 이 단언하는 "permission denied" 가 원격에서는 성립하지 않아 **테스트가
-- 운영을 설명하지 못한다** ③ 누군가 정책을 하나 잘못 열면 그 순간 grant 가 살아난다.
--
-- 그래서 "RLS 가 막아 주니까" 대신 "애초에 권한이 없다"로 되돌린다 (다층 방어).

-- ① 운영 테이블: 유일한 접근 경로는 SECURITY DEFINER RPC 다 (결정 #11).
--    definer 함수는 소유자 권한으로 돌므로 여기서 회수해도 프록시는 그대로 동작한다.
revoke all on public.search_cache from anon, authenticated;
revoke all on public.api_usage from anon, authenticated;

-- ② 사용자 데이터: anon 은 어떤 표면으로도 직접 읽지 않는다.
--    비로그인 공유 뷰(P2)는 get_shared_trip(SECURITY DEFINER)만 쓴다 — 테이블 권한이 필요 없다.
revoke all on public.trips from anon;
revoke all on public.days from anon;
revoke all on public.places from anon;
revoke all on public.stops from anon;
revoke all on public.legs from anon;
revoke all on public.photos from anon;

-- ③ 앞으로 추가될 테이블도 같은 규칙을 따르게 한다 — 이 마이그레이션을 또 쓰지 않도록.
alter default privileges in schema public revoke all on tables from anon;
