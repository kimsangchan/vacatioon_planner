-- "이게 뭔지 알려면 결국 지도앱에서 검색해야 한다" 를 줄인다 (결정 #62, 사용자 지적).
--
-- 운영 실측: 저장된 25곳에 전화 0 · 영업시간 0 · 사진 0 이라 공유 화면에 뜰 것이 이름과 주소뿐이었다.
-- 그런데 네이버 지역검색은 **업종을 항상 준다** — "한식>국수", "카페,디저트>와플" — 우리가
-- `categoryHint`(식당/숙박/스팟)만 뽑고 원문을 버리고 있었다. 버릴 이유가 없어 담는다.
--
-- 그리고 `provider_link` 를 공유에 되살린다. 0016 이 막았지만 이건 **업체가 스스로 공개한 주소**다
-- (실측: 인스타·카카오채널·홈페이지). 동행자가 "여기 뭐야"에 답을 얻는 가장 빠른 문이고,
-- 개인적인 것(메모·예상 금액·사진 경로)을 막는 것과는 성격이 다르다.

alter table public.places
  add column category_label text not null default ''
    check (char_length(category_label) <= 100);

comment on column public.places.category_label is
  'Raw provider category text, e.g. "한식>국수". Empty for manually added places.';

create or replace function public.get_shared_trip(token bytea)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_bundle jsonb;
begin
  select * into v_trip
    from public.trips t
   where t.share_enabled
     and t.share_token is not null
     and t.deleted_at is null
     and t.share_token = get_shared_trip.token;

  if not found then
    -- 예외와 같은 트랜잭션에서 카운터를 올리면 함께 롤백된다. 실패 계측은
    -- 요청 경계(로그/엣지 rate limit)에서 맡기고, DB 함수는 동일한 오류만 낸다.
    raise exception 'share/invalid-token';
  end if;

  with pj as (
    select p.id,
           p.name,
           jsonb_build_object(
             'id', p.id,
             'category', p.category,
             'name', p.name,
             'address', p.address,
             'road_address', p.road_address,
             'lat', p.lat,
             'lng', p.lng,
             'provider', p.provider,
             'provider_link', p.provider_link,
             'category_label', p.category_label,
             'phone', p.phone,
             'opening_hours', p.opening_hours,
             -- 공유 화면이 쓰지 않는 개인 메모·예상 금액·사진 경로는 내보내지 않는다.
             'memo', '',
             'estimated_cost', null,
             'photos', '[]'::jsonb
           ) as obj
      from public.places p
     -- 일정에 넣었는지로 거르지 않는다: 보관함 후보야말로 같이 정할 대상이다 (#60)
     where p.trip_id = v_trip.id
       and p.deleted_at is null
  ),
  dj as (
    select d.position,
           jsonb_build_object(
             'id', d.id,
             'date', d.date,
             'position', d.position,
             'color', d.color,
             'stops', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', s.id,
                        'place_id', s.place_id,
                        'position', s.position,
                        'start_time', s.start_time,
                        'cost_amount', null,
                        'confirmed', s.confirmed,
                        'note', '',
                        'place', pj.obj
                      ) order by s.position, s.id)
                 from public.stops s
                 left join pj on pj.id = s.place_id
                where s.day_id = d.id
             ), '[]'::jsonb),
             -- 예약번호·비용·메모·캡처는 뺀 채 "언제 무엇을 타고 어디서 어디로"만 싣는다
             'legs', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', l.id,
                        'mode', l.mode,
                        'depart_at', l.depart_at,
                        'arrive_at', l.arrive_at,
                        'arrive_day_offset', l.arrive_day_offset,
                        'from_label', l.from_label,
                        'to_label', l.to_label,
                        'position', l.position
                      ) order by l.position, l.id)
                 from public.legs l where l.day_id = d.id
             ), '[]'::jsonb)
           ) as obj
      from public.days d
     where d.trip_id = v_trip.id
  )
  select jsonb_build_object(
           'id', v_trip.id,
           'name', v_trip.name,
           'start_date', v_trip.start_date,
           'end_date', v_trip.end_date,
           'timezone', v_trip.timezone,
           'created_at', v_trip.created_at,
           'updated_at', v_trip.updated_at,
           'days', coalesce((select jsonb_agg(dj.obj order by dj.position) from dj), '[]'::jsonb),
           'places', coalesce((select jsonb_agg(pj.obj order by pj.name, pj.id) from pj), '[]'::jsonb)
         )
    into v_bundle;

  return v_bundle;
end;
$$;

revoke execute on function public.get_shared_trip(bytea) from public;
grant execute on function public.get_shared_trip(bytea) to anon, authenticated;
