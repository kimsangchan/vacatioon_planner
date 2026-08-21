-- 보관함 후보도 공유한다 (결정 #60, 사용자 신고: "보관함 내용 여전히 안 보인다").
--
-- 0016 이 공유 대상을 **일정에 넣은 곳만**으로 좁혔다. 새는 것을 막는 방향은 옳았지만
-- 이번엔 너무 좁았다 — 동행자가 하트를 줄 수 있는 대상이 "이미 정해진 곳" 뿐이 되어,
-- "어디 갈지 같이 정하자"(#46)가 "정해진 곳 평가해 줘"로 바뀐다. 교체 후보 정렬(#53)의
-- 2차 키인 하트도 후보에 안 쌓인다.
--
-- 그래서 **여행의 살아 있는 장소를 전부** 내보낸다. 대신 장소에 붙은 개인적인 것
-- (메모·예상 금액·사진 경로)은 0016 이 이미 뺀 그대로 계속 뺀다 — 넓히는 것은 목록이지 내용이 아니다.

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
             'provider_link', null,
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
