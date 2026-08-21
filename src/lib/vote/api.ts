// 별표 협의 (결정 #46) — "나 여기 가고 싶다"를 표로 남긴다.
//
// **계정을 요구하지 않는다.** 주인은 로그인 상태라 RLS 경유로 바로 쓰고, 공유 링크로 들어온
// 사람은 `vote_shared_place` RPC 를 거친다 — anon 은 테이블 권한이 아예 없다(0010).
//
// voter_key 는 브라우저가 만든 난수다. 신원이 아니라 **중복 방지**용이라 개인정보가 아니고,
// 브라우저를 지우면 새 사람이 된다. 링크를 아는 사람끼리 쓰는 도구엔 그 정도면 된다.

import type { SupabaseClient } from '@supabase/supabase-js'

const VOTER_KEY_STORAGE = 'trip-canvas:voter-key'

/**
 * 1~5 만 저장한다. 0 은 "별표 취소"라는 뜻으로 쓰인다 (RPC 계약과 같다).
 * 결정 #46 은 3단계였는데 사용자가 써 보고 5점을 원했다 (0013) — 쓰는 사람의 판단이 세다.
 */
export type Stars = 1 | 2 | 3 | 4 | 5

export interface VoteRow {
  place_id: string
  voter_key: string
  /** 공유 화면에서 한 번 적어 둔 이름. 빈 문자열이면 이름 없이 수에만 든다 (0018) */
  voter_name?: string
  /** 옛 1~5 세기. 하트는 1 로 쓰고, 표가 있으면 곧 하트다 (결정 #59) */
  stars: number
}

/** 하트 집계 (결정 #59) — 묻는 것은 하나라 셀 것도 하나다: 몇 명이 가고 싶어하나 */
export interface HeartTally {
  hearts: number
  mine: boolean
  names: string[]
}

const VOTER_NAME_STORAGE = 'trip-canvas:voter-name'
/** DB CHECK 와 같은 경계 (0018) */
export const VOTER_NAME_MAX = 20

/** 이 브라우저가 적어 둔 이름. 안 적었으면 빈 문자열 — 이름을 강요하지 않는다 (#46 계정 기각과 같은 결) */
export function voterName(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  return storage.getItem(VOTER_NAME_STORAGE) ?? ''
}

export function saveVoterName(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  name: string,
): string {
  const trimmed = name.trim().slice(0, VOTER_NAME_MAX)
  storage.setItem(VOTER_NAME_STORAGE, trimmed)
  return trimmed
}

export function tallyHearts(votes: VoteRow[], me: string): HeartTally {
  let hearts = 0
  let mine = false
  const names: string[] = []
  for (const vote of votes) {
    hearts += 1
    if (vote.voter_key === me) mine = true
    const name = (vote.voter_name ?? '').trim()
    if (name !== '') names.push(name)
  }
  return { hearts, mine, names }
}

/** 공유 링크로 들어온 사람의 하트 — 토큰·소속 검증은 서버(RPC)가 한다 */
export async function saveSharedHeart(
  supabase: SupabaseClient,
  input: { token: string; placeId: string; voterKey: string; voterName: string; hearted: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('heart_shared_place', {
    // PostgREST 는 bytea 를 백슬래시-x 접두 hex 로 받는다
    token: '\\x' + input.token,
    place_id: input.placeId,
    voter_key: input.voterKey,
    voter_name: input.voterName,
    hearted: input.hearted,
  })
  if (error) throw error
}

/** 주인이 자기 여행에 하트를 준다 (RLS 경유) */
export async function saveMyHeart(
  supabase: SupabaseClient,
  input: { placeId: string; voterKey: string; voterName: string; hearted: boolean },
): Promise<void> {
  if (!input.hearted) {
    const { error } = await supabase
      .from('place_votes')
      .delete()
      .eq('place_id', input.placeId)
      .eq('voter_key', input.voterKey)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('place_votes').upsert(
    {
      place_id: input.placeId,
      voter_key: input.voterKey,
      voter_name: input.voterName.slice(0, VOTER_NAME_MAX),
      stars: 1,
    },
    { onConflict: 'place_id,voter_key' },
  )
  if (error) throw error
}

/** 이 브라우저의 표 주인. 없으면 만들어 남긴다 — 서버가 발급하지 않는다 */
export function voterKey(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  const saved = storage.getItem(VOTER_KEY_STORAGE)
  if (saved && saved.length >= 8) return saved

  // 8~64자 제약(0010)을 넉넉히 만족하는 길이. crypto 가 없는 환경은 없다고 봐도 된다
  const fresh = crypto.randomUUID().replaceAll('-', '')
  storage.setItem(VOTER_KEY_STORAGE, fresh)
  return fresh
}

/** 표를 모아 장소별 합계와 "내가 준 별"을 낸다 — 화면이 두 숫자를 함께 쓴다 */
export function tallyVotes(
  votes: VoteRow[],
  me: string,
): { total: number; voters: number; mine: number } {
  let total = 0
  let voters = 0
  let mine = 0
  for (const vote of votes) {
    total += vote.stars
    voters += 1
    if (vote.voter_key === me) mine = vote.stars
  }
  return { total, voters, mine }
}

/**
 * 주인이 자기 여행에 별을 준다 (RLS 경유).
 * 0 은 취소다 — 지우기 위해 함수를 하나 더 두지 않는다 (RPC 와 같은 규칙).
 */
export async function saveMyVote(
  supabase: SupabaseClient,
  input: { placeId: string; voterKey: string; stars: 0 | Stars },
): Promise<void> {
  if (input.stars === 0) {
    const { error } = await supabase
      .from('place_votes')
      .delete()
      .eq('place_id', input.placeId)
      .eq('voter_key', input.voterKey)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('place_votes')
    .upsert(
      { place_id: input.placeId, voter_key: input.voterKey, stars: input.stars },
      { onConflict: 'place_id,voter_key' },
    )
  if (error) throw error
}

/** 공유 링크로 들어온 사람의 표 — 토큰·소속 검증은 서버(RPC)가 한다 */
export async function saveSharedVote(
  supabase: SupabaseClient,
  input: { token: string; placeId: string; voterKey: string; stars: 0 | Stars },
): Promise<void> {
  const { error } = await supabase.rpc('vote_shared_place', {
    // PostgREST 는 bytea 를 백슬래시-x 접두 hex 로 받는다 — 템플릿 리터럴에 그대로 쓰면 잘못된 이스케이프다
    token: '\\x' + input.token,
    place_id: input.placeId,
    voter_key: input.voterKey,
    stars: input.stars,
  })
  if (error) throw error
}
