/** @vitest-environment node */
// 별표 협의 (결정 #46). 표는 신원이 아니라 중복 방지로 묶인다.

import { describe, expect, it, vi } from 'vitest'
import { saveMyVote, tallyVotes, voterKey } from './api'

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    all: map,
  }
}

describe('voterKey — 이 브라우저의 표 주인', () => {
  it('처음이면 만들어 남긴다 — 서버가 발급하지 않는다', () => {
    const storage = memoryStorage()

    const key = voterKey(storage)

    expect(key.length).toBeGreaterThanOrEqual(8)
    expect(voterKey(storage)).toBe(key)
  })

  it('너무 짧은 값이 남아 있으면 새로 만든다 — DB 가 8자 미만을 거절한다 (0010)', () => {
    const storage = memoryStorage({ 'trip-canvas:voter-key': 'abc' })

    expect(voterKey(storage).length).toBeGreaterThanOrEqual(8)
  })
})

describe('tallyVotes — 합계와 내가 준 별', () => {
  const votes = [
    { place_id: 'p1', voter_key: 'me', stars: 3 },
    { place_id: 'p1', voter_key: 'you', stars: 1 },
  ]

  it('합계와 사람 수를 함께 낸다 — 3점 하나와 1점 셋은 다른 뜻이다', () => {
    expect(tallyVotes(votes, 'me')).toEqual({ total: 4, voters: 2, mine: 3 })
  })

  it('내 표가 없으면 0 이다 — 안 누른 것과 1점은 다르다', () => {
    expect(tallyVotes(votes, 'nobody').mine).toBe(0)
  })

  it('표가 없으면 전부 0 이다', () => {
    expect(tallyVotes([], 'me')).toEqual({ total: 0, voters: 0, mine: 0 })
  })
})

describe('saveMyVote — 주인의 표', () => {
  it('0 은 지우기다 — 취소하려고 함수를 하나 더 두지 않는다', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const del = vi.fn().mockReturnValue({ eq: eq1 })
    const supabase = { from: vi.fn().mockReturnValue({ delete: del }) }

    await saveMyVote(supabase as never, { placeId: 'p1', voterKey: 'me', stars: 0 })

    expect(del).toHaveBeenCalled()
  })

  it('1~3 은 덮어쓴다 — 같은 사람이 다시 눌러도 표는 하나다', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) }

    await saveMyVote(supabase as never, { placeId: 'p1', voterKey: 'me', stars: 2 })

    expect(upsert).toHaveBeenCalledWith(
      { place_id: 'p1', voter_key: 'me', stars: 2 },
      { onConflict: 'place_id,voter_key' },
    )
  })
})
