// 별표 협의 (결정 #46) — "나 여기 가고 싶다"를 표로 남긴다.
//
// **계정을 요구하지 않는다.** 주인은 로그인 상태라 RLS 경유로 바로 쓰고, 공유 링크로 들어온
// 사람은 `vote_shared_place` RPC 를 거친다 — anon 은 테이블 권한이 아예 없다(0010).
//
// voter_key 는 브라우저가 만든 난수다. 신원이 아니라 **중복 방지**용이라 개인정보가 아니고,
// 브라우저를 지우면 새 사람이 된다. 링크를 아는 사람끼리 쓰는 도구엔 그 정도면 된다.

import type { SupabaseClient } from '@supabase/supabase-js'

const VOTER_KEY_STORAGE = 'trip-canvas:voter-key'

/** 1~3 만 저장한다. 0 은 "별표 취소"라는 뜻으로 쓰인다 (RPC 계약과 같다) */
export type Stars = 1 | 2 | 3

export interface VoteRow {
  place_id: string
  voter_key: string
  stars: number
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
