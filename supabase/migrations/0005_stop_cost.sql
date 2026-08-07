-- 결정 #24 — 지출 기록을 방문(Stop)까지 넓힌다.
--
-- 가격을 Place 가 아니라 Stop 에 붙이는 이유: 같은 장소를 하루 두 번 가면 지출도 두 번이고,
-- 정산은 "그 방문"에 귀속된다(결정 #21 이 같은 장소 2회 배치를 허용한 것과 짝을 이룬다).
-- 어휘·제약은 legs.cost_amount(결정 #17)와 한 글자도 다르지 않게 맞춘다 — 원 단위 정수, 음수 금지,
-- 미입력(null)과 0원은 다른 값이다.

alter table public.stops
  add column cost_amount integer check (cost_amount is null or cost_amount >= 0);
