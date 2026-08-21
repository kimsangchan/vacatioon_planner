-- 장소 사진 (결정 #63, 사용자 요청: "최신 사진 5~10장을 보여줄 수 있으면").
--
-- 지역검색은 사진을 주지 않는다. 이미지 검색은 **웹 전체**를 뒤지므로 그 가게 사진이라는
-- 보장이 없어, 검색어를 `{시} {동} {이름}` 으로 좁히고 받은 결과에서 **제목에 이름이 든 것만**
-- 남긴다 (실측: 저장된 25곳 중 21곳이 사진을 얻고 13곳은 5장 이상. 못 찾는 4곳은 아무것도 안 낸다).
--
-- **왜 컬럼에 담는가**: 공유 화면은 anon 이라 검색 API 를 부를 수 없다(0007). 주인이 담을 때
-- 한 번 가져와 두면 공유는 그걸 그대로 내보내면 되고, 쿼터도 장소당 1회로 묶인다.
-- 원본을 우리 스토리지에 옮기지 않는 이유: 남의 사진이다. 네이버가 주는 썸네일 주소와
-- **출처 링크를 함께** 담아 화면에서 출처로 넘길 수 있게 한다.

alter table public.places
  add column images jsonb not null default '[]'::jsonb
    check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 10);

comment on column public.places.images is
  'Up to 10 {thumbnail, link} objects from provider image search, filtered by name match.';

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
             'images', p.images,
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
