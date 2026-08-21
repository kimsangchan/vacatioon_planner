-- 공개 검색 API의 형식에 묶이지 않고 사용자가 직접 적는 영업시간이다.
-- 여러 줄을 그대로 보존하되 카드에 붙는 짧은 정보라는 경계를 DB에서도 지킨다.
alter table public.places
  add column opening_hours text not null default '',
  add constraint places_opening_hours_length_check
    check (char_length(opening_hours) <= 2000);

comment on column public.places.opening_hours is
  'User-authored multiline business hours, up to 2000 characters';
