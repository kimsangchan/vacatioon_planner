begin;

select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000e5', 'authenticated', 'authenticated',
        'shared-projection@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date, share_enabled, share_token)
values ('19000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e5',
        '공유 원본', '2027-01-10', '2027-01-11', true,
        decode('11223344556677889900aabbccddeeff', 'hex'));

insert into public.days (id, trip_id, date, position, color)
values ('29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001',
        '2027-01-10', 0, 'rose');

insert into public.places (
  id, trip_id, owner_id, category, name, address, road_address, lat, lng, provider,
  phone, opening_hours, estimated_cost
)
values (
  '39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e5', 'restaurant', '공유 식당', '제주시 구주소',
  '제주시 새주소', 33.499621, 126.531188, 'manual', '064-123-4567',
  E'월-금 09:00-18:00\n토 10:00-15:00', 25000
);

insert into public.stops (
  id, day_id, place_id, position, start_time, cost_amount, confirmed, note
)
values (
  '49000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001',
  '39000000-0000-0000-0000-000000000001', 3, '12:30', 21000, false, '창가 자리 요청'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'places'->0->>'opening_hours',
  E'월-금 09:00-18:00\n토 10:00-15:00',
  '공유 장소에 사용자가 입력한 영업시간을 투영한다'
);
select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'places'->0->>'phone',
  '064-123-4567',
  '공유 장소에 전화번호를 투영한다'
);
select is(
  (public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'places'->0->>'estimated_cost')::integer,
  25000,
  '공유 장소에 예상 금액을 투영한다'
);
select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'days'->0->>'color',
  'rose',
  '공유 일차에 사용자가 고른 색을 투영한다'
);
select is(
  (public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'days'->0->'stops'->0->>'position')::integer,
  3,
  '공유 방문에 순서를 투영한다'
);
select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'days'->0->'stops'->0->>'start_time',
  '12:30:00',
  '공유 방문에 시작 시각을 투영한다'
);
select is(
  (public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'days'->0->'stops'->0->>'cost_amount')::integer,
  21000,
  '공유 방문에 실제 지출을 투영한다'
);
select is(
  (public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'days'->0->'stops'->0->>'confirmed')::boolean,
  false,
  '공유 방문에 확정 여부를 투영한다'
);
select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'days'->0->'stops'->0->>'note',
  '창가 자리 요청',
  '공유 방문에 자리 메모를 투영한다'
);
select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'days'->0->'stops'->0->'place'->>'opening_hours',
  E'월-금 09:00-18:00\n토 10:00-15:00',
  '방문에 중첩된 장소도 새 영업시간 필드를 포함한다'
);

reset role;
update public.trips
   set name = '주인이 방금 고친 일정'
 where id = '19000000-0000-0000-0000-000000000001';
update public.places
   set phone = '064-999-0000'
 where id = '39000000-0000-0000-0000-000000000001';

set local role anon;
select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))->>'name',
  '주인이 방금 고친 일정',
  '같은 공유 토큰을 다시 조회하면 여행의 최신 값을 반환한다'
);
select is(
  public.get_shared_trip(decode('11223344556677889900aabbccddeeff', 'hex'))
    ->'places'->0->>'phone',
  '064-999-0000',
  '같은 공유 토큰을 다시 조회하면 장소의 최신 값을 반환한다'
);

select * from finish();

rollback;
