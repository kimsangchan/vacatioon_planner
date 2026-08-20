begin;

select plan(3);

-- 전화번호 (사용자 요청). 영업시간은 어느 공개 API 도 주지 않아 담지 않는다

select has_column('public', 'places', 'phone',
  'places.phone 이 있다 — 네이버가 주는데 프록시에서 버리고 있었다');
select col_not_null('public', 'places', 'phone',
  'memo 와 같은 규약 — null 과 빈 문자열 두 가지 "없음"을 만들지 않는다');
select col_default_is('public', 'places', 'phone', '',
  '안 적으면 빈 문자열이다');

select * from finish();

rollback;
