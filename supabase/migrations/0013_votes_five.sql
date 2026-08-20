-- 결정 #46 정정 (2026-08-20, 사용자 요청) — 별점을 1~3 에서 **1~5** 로 넓힌다.
--
-- #46 은 "5단계는 3과 4의 차이를 아무도 설명하지 못한다"는 이유로 3단계를 골랐다.
-- 사용자가 써 보고 5점을 원했다 — 쓰는 사람의 판단이 설계자의 우려보다 세다.
-- 데이터는 그대로 산다: 기존 1~3 은 새 범위 안에 있어 되돌릴 것이 없다.

alter table public.place_votes drop constraint place_votes_stars_check;
alter table public.place_votes add constraint place_votes_stars_check check (stars between 1 and 5);
