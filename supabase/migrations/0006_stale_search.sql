-- T5-3 — 업스트림 장애 시 "오래된 결과라도" 내주는 경로 (결정 #23이 남긴 설계 공백).
--
-- 왜 새 파일인가: 0003 은 적용 완료된 마이그레이션이라 고치지 않는다. 함수 추가는 새 번호로 한다.
--
-- 왜 새 함수인가: get_cached_search 의 5분 창은 "정상 경로에서 같은 검색을 두 번 사지 않는다"는
-- 규칙이라 그대로 두어야 한다(계약 불변). 502 폴백은 목적이 정반대다 — 신선도가 아니라 존재 여부를
-- 묻는다. 같은 함수에 플래그를 다는 대신 의도가 다른 함수를 따로 둔다.
--
-- 왜 상한(7일)이 있는가: search_cache 에는 파기 주기가 없어 행이 영구히 남는다. 상한이 없으면
-- 언젠가 몇 달 전 결과를 "검색 결과"라고 내주게 된다. 장소의 이름·주소·좌표는 주 단위로는 잘 안
-- 바뀌므로 7일까지는 폐업 위험을 감수하고 내주는 편이 빈손보다 낫다고 본다.

create or replace function public.get_stale_search(qhash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
begin
  -- get_cached_search 와 달리 5분 창을 보지 않는다. 상한만 본다.
  select c.response into v_response
    from public.search_cache c
   where c.query_hash = get_stale_search.qhash
     and c.fetched_at > now() - interval '7 days';

  return v_response;
end;
$$;

-- Supabase 기본 default privileges 가 신규 함수에 anon 실행권을 준다 — 명시적으로 회수한다
-- (운영 테이블 RPC 는 authenticated 한정: 카운터 조작·자기 DoS 방지, 05 §권한 모델).
revoke execute on function public.get_stale_search(text) from public, anon;
grant execute on function public.get_stale_search(text) to authenticated;
