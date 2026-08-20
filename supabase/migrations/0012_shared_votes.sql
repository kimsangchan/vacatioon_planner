-- 결정 #46 — 공유 링크로 들어온 사람이 **지금까지 모인 표**를 본다.
--
-- `get_shared_trip`(0003)을 재정의하지 않고 함수를 따로 둔 이유:
-- 그 함수는 100줄짜리 투영이고 여행 전체 계약이 걸려 있다. 표 하나 붙이자고 통째로 다시 쓰면
-- 되돌릴 수 없는 실수의 표면만 넓어진다. 갱신 주기도 다르다 — 본문은 주인이, 표는 보는 사람들이 쓴다.
--
-- **voter_key 를 내보내지 않는다.** 남의 키가 나가면 그 키로 남의 표를 덮어쓸 수 있다.
-- 그래서 "내 표"는 호출자가 자기 키를 들고 와서 **서버가 대조해** 알려 준다.
-- 장소별로 접어서 돌려주는 이유: 화면이 쓰는 단위가 표 하나가 아니라 장소 하나다.

create or replace function public.get_shared_votes(token bytea, voter_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  select t.id into v_trip_id
    from public.trips t
   where t.share_enabled
     and t.share_token is not null
     and t.deleted_at is null
     and t.share_token = get_shared_votes.token;

  if not found then
    raise exception 'share/invalid-token';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'place_id', g.place_id,
             'total', g.total,
             'voters', g.voters,
             'mine', g.mine
           ))
      from (
        select v.place_id,
               sum(v.stars)::int as total,
               count(*)::int as voters,
               coalesce(max(v.stars) filter (where v.voter_key = get_shared_votes.voter_key), 0)::int as mine
          from public.place_votes v
          join public.places p on p.id = v.place_id
         where p.trip_id = v_trip_id and p.deleted_at is null
         group by v.place_id
      ) g
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_shared_votes(bytea, text) to anon, authenticated;
