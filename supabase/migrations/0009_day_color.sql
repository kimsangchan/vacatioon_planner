-- 결정 #41 — 일차마다 색을 고른다.
--
-- 지도 핀에서 "몇 일차인가"를 색으로, "무엇을 하는 곳인가"를 모양(숫자/아이콘)으로 나눈다.
-- 두 정보를 색 하나에 겹쳐 싣지 않는다 — 카테고리 3색과 일차 색이 같은 채널을 쓰면 둘 다 못 읽는다.
--
-- hex 가 아니라 **토큰**을 저장하는 이유: 실제 색값은 라이트/다크에서 달라야 하고
-- (globals.css 의 --pin-* 가 이미 그렇게 한다), DB 가 테마를 떠안을 이유가 없다.
-- 팔레트를 CHECK 로 가두는 이유: 자유 색은 흰 숫자가 안 보이는 조합(노랑 등)을 허용한다.
-- 값 추가가 고통스러운 PG enum 대신 CHECK 를 쓴다 (supabase/CLAUDE.md 관례).
--
-- null 은 "아직 안 골랐다"이고, 그때 쓸 기본색은 앱이 position 으로 정한다 —
-- 여행을 만들자마자 일차들이 서로 구분돼 보여야 하므로 DB 기본값을 하나로 박지 않는다.

alter table public.days
  add column color text check (
    color is null
    or color in ('rose', 'amber', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'slate')
  );
