-- 공유는 "몇 시 차 타?" 에 답해야 한다.
--
-- 0016 은 이동(legs)을 통째로 비웠다. 예약번호·비용·메모·캡처가 bearer 링크로 새는 걸 막은 건
-- 옳았지만, 그러면서 **시각·수단·구간까지 같이 버렸다** — SPEC 의 헤드라인이 "이동 예매 정보를
-- 타임라인으로 한눈에" 인데 동행자가 가장 알고 싶은 값이 공유에서 사라진 셈이다 (사용자 지적).
--
-- 그래서 이동을 다시 싣되 **안전한 것만** 싣는다:
--   싣는다  — mode · depart_at · arrive_at · arrive_day_offset · from_label · to_label · position
--   안 싣는다 — booking_ref(예약번호) · cost_amount · memo · photos(티켓 캡처)
-- 키 자체를 만들지 않는다: null 로 두면 "있는데 비었다"로 읽혀 나중에 누가 채운다.

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
     where p.trip_id = v_trip.id
       and p.deleted_at is null
       and exists (
         select 1
           from public.stops s
           join public.days d on d.id = s.day_id
          where s.place_id = p.id
            and d.trip_id = v_trip.id
       )
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
