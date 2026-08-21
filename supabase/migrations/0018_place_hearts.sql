-- 별표를 **하트**로 바꾼다 (결정 #59, 사용자 제안).
--
-- 별 1~5 는 끝내 "3과 4의 차이를 아무도 설명하지 못한다"(#46)를 풀지 못했다. 3단계로 시작해
-- (#46) 5단계로 넓혔지만(#52·0013) 같은 문제가 남았다. 묻는 것을 하나로 줄인다: **가고 싶은가**.
--
-- 그리고 **누가 눌렀는지**를 알 수 있게 한다. 표를 두 사람 이상이 주면 합계만으로는
-- 누구 의견인지 모른다(사용자 지적). 계정은 여전히 만들지 않는다(#46) — 이름을 한 번 적어 둘 뿐이다.
--
-- `stars` 는 **지우지 않는다**: 하트는 1 로 쓰고, 기존 1~5 표는 그대로 하트로 읽힌다.
-- 컬럼을 떨구면 되돌릴 수 없고, 남겨 두면 나중에 세기(강도)를 되살릴 여지도 남는다.

alter table public.place_votes
  add column voter_name text not null default ''
    check (char_length(voter_name) <= 20);

comment on column public.place_votes.voter_name is
  'Display name typed by the voter on the share page. Empty means anonymous.';
comment on column public.place_votes.stars is
  'Legacy 1..5 strength. Hearts write 1; any row means "wants to go" (decision #59).';

-- ── 공유 화면의 하트 토글 ─────────────────────────────────────────────────────
-- 기존 `vote_shared_place` 는 **남겨 둔다**: 마이그레이션을 배포보다 먼저 넣는 순서라
-- 아직 옛 화면이 떠 있는 동안에도 표가 깨지지 않아야 한다.
create or replace function public.heart_shared_place(
  token bytea,
  place_id uuid,
  voter_key text,
  voter_name text,
  hearted boolean
)
returns void
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
     and t.share_token = heart_shared_place.token;

  -- 해제·오타를 구분하지 않는 단일 예외 (get_shared_trip 과 같은 문구)
  if not found then
    raise exception 'share/invalid-token';
  end if;

  if not exists (
    select 1
      from public.places p
     where p.id = heart_shared_place.place_id
       and p.trip_id = v_trip_id
       and p.deleted_at is null
  ) then
    raise exception 'share/unknown-place';
  end if;

  if not heart_shared_place.hearted then
    delete from public.place_votes v
     where v.place_id = heart_shared_place.place_id
       and v.voter_key = heart_shared_place.voter_key;
    return;
  end if;

  -- 충돌 대상을 **제약 이름**으로 가리킨다 (0010 과 같은 이유 — 인자 이름과 컬럼이 부딪힌다)
  insert into public.place_votes (place_id, voter_key, voter_name, stars)
  values (
    heart_shared_place.place_id,
    heart_shared_place.voter_key,
    left(coalesce(heart_shared_place.voter_name, ''), 20),
    1
  )
  on conflict on constraint place_votes_pkey
  do update set voter_name = excluded.voter_name, stars = 1;
end;
$$;

revoke execute on function public.heart_shared_place(bytea, uuid, text, text, boolean) from public;
grant execute on function public.heart_shared_place(bytea, uuid, text, text, boolean)
  to anon, authenticated;

-- ── 공유 화면이 읽는 하트 ─────────────────────────────────────────────────────
-- 이름을 함께 낸다. 안 적은 사람은 빼고 보내고, 화면이 "외 N명" 으로 마무리한다.
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
             'hearts', g.hearts,
             'mine', g.mine,
             'names', g.names
           ))
      from (
        select v.place_id,
               count(*)::int as hearts,
               bool_or(v.voter_key = get_shared_votes.voter_key) as mine,
               coalesce(
                 jsonb_agg(to_jsonb(v.voter_name) order by v.created_at, v.voter_key)
                   filter (where v.voter_name <> ''),
                 '[]'::jsonb
               ) as names
          from public.place_votes v
          join public.places p on p.id = v.place_id
         where p.trip_id = v_trip_id and p.deleted_at is null
         group by v.place_id
      ) g
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_shared_votes(bytea, text) from public;
grant execute on function public.get_shared_votes(bytea, text) to anon, authenticated;
