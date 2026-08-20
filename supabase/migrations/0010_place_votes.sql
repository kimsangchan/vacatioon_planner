-- 결정 #46 — 어디를 갈지 **별표로 협의**한다.
--
-- 여행은 혼자 정하지 않는데, 지금 이 앱의 공유는 읽기 전용 링크뿐이라(결정 #3)
-- 동행자에게는 "나 여기 가고 싶다"를 말할 자리가 없었다. 별표가 그 자리다.
--
-- **계정을 요구하지 않는 이유**: 여행 한 번 때문에 동행자에게 가입을 시키면 아무도 안 누른다.
-- 링크를 가진 사람이면 누를 수 있게 하되, 비로그인 쓰기는 SECURITY DEFINER RPC 한 곳으로만
-- 뚫는다(0003 의 get_shared_trip 과 같은 규율) — 그래서 anon 은 이 테이블 권한이 없다.
--
-- **voter_key 를 두는 이유**: 같은 사람이 여러 번 눌러 표를 부풀리지 않게 한다.
-- 브라우저가 만든 난수를 그대로 받는다 — 신원이 아니라 중복 방지용이라 개인정보가 아니고,
-- 브라우저를 지우면 새 사람이 된다. 링크를 아는 사람끼리 쓰는 도구에는 그 정도면 된다.
--
-- **stars 1~3 인 이유**: 5단계는 "3과 4의 차이"를 아무도 설명하지 못한다.
-- 가고 싶다 / 꼭 가고 싶다 정도의 세기면 협의가 된다.
--
-- 표는 **장소(places)** 에 달린다. 일차 배치(stops)가 아니라 — 아직 어디에 넣을지 모르는
-- 보관함 후보를 두고 이야기하는 것이 이 기능의 목적이다.

create table public.place_votes (
  place_id uuid not null references public.places(id) on delete cascade,
  voter_key text not null check (length(voter_key) between 8 and 64),
  stars smallint not null check (stars between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, voter_key)
);

create index place_votes_place_idx on public.place_votes (place_id);

create trigger set_updated_at before update on public.place_votes
  for each row execute function public.set_updated_at();

alter table public.place_votes enable row level security;

grant select, insert, update, delete on public.place_votes to authenticated;
-- anon 은 어떤 표면으로도 직접 닿지 않는다 (0007 의 규칙). 공유 링크 투표는 RPC 경유다
revoke all on public.place_votes from anon;

-- 주인은 자기 여행의 표를 **다** 본다 — 협의 결과를 보는 것이 목적이다
create policy place_votes_owner_select on public.place_votes
  for select to authenticated
  using (
    exists (
      select 1
      from public.places p
      join public.trips t on t.id = p.trip_id
      where p.id = place_votes.place_id and t.owner_id = auth.uid()
    )
  );

-- 주인도 자기 표를 남긴다. 주인 브라우저의 voter_key 로 들어가므로 남의 표를 덮지 않는다
create policy place_votes_owner_write on public.place_votes
  for all to authenticated
  using (
    exists (
      select 1
      from public.places p
      join public.trips t on t.id = p.trip_id
      where p.id = place_votes.place_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.places p
      join public.trips t on t.id = p.trip_id
      where p.id = place_votes.place_id and t.owner_id = auth.uid()
    )
  );

-- ── 공유 링크로 들어온 사람이 누르는 문 ──────────────────────────────────────
--
-- anon 은 테이블에 직접 닿지 않는다. 유일한 경로가 이 함수다 —
-- 토큰이 살아 있는지, 그 여행의 장소가 맞는지를 여기서 다 확인한다.
-- 확인을 클라이언트에 맡기면 링크 하나로 남의 여행에 표를 넣을 수 있다.
--
-- stars = 0 은 "별표 취소"다. 지우기 위해 다른 함수를 하나 더 두지 않는다.
create or replace function public.vote_shared_place(
  token bytea,
  place_id uuid,
  voter_key text,
  stars smallint
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
     and t.share_token = vote_shared_place.token;

  -- 해제·오타를 구분하지 않는 단일 예외 (get_shared_trip 과 같은 문구)
  if not found then
    raise exception 'share/invalid-token';
  end if;

  if not exists (
    select 1
      from public.places p
     where p.id = vote_shared_place.place_id
       and p.trip_id = v_trip_id
       and p.deleted_at is null
  ) then
    raise exception 'share/unknown-place';
  end if;

  if vote_shared_place.stars = 0 then
    delete from public.place_votes v
     where v.place_id = vote_shared_place.place_id
       and v.voter_key = vote_shared_place.voter_key;
    return;
  end if;

  -- 충돌 대상을 **제약 이름**으로 가리킨다. 컬럼 목록으로 쓰면 `place_id` 가
  -- 이 함수의 인자 이름과 부딪혀 42702(ambiguous) 로 죽는다 — 인자 이름은
  -- PostgREST 가 명명 인자로 부르는 계약이라 바꾸지 않는다
  insert into public.place_votes (place_id, voter_key, stars)
  values (vote_shared_place.place_id, vote_shared_place.voter_key, vote_shared_place.stars)
  on conflict on constraint place_votes_pkey do update set stars = excluded.stars;
end;
$$;

grant execute on function public.vote_shared_place(bytea, uuid, text, smallint) to anon, authenticated;
