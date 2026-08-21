/** @vitest-environment node */
// 별표 협의 (결정 #46). 표는 신원이 아니라 중복 방지로 묶인다.

import { describe, expect, it, vi } from 'vitest'
import { saveMyVote, saveVoterName, tallyHearts, tallyVotes, voterKey, voterName } from './api'

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


describe('하트 (결정 #59) — 묻는 것은 하나다: 가고 싶은가', () => {
  const heart = (placeId: string, key: string, name = '') => ({
    place_id: placeId,
    voter_key: key,
    voter_name: name,
    stars: 1,
  })

  it('표 수를 센다 — 옛 1~5 표도 하트 하나로 읽는다', () => {
    const tally = tallyHearts(
      [heart('p1', 'a', '민수'), { ...heart('p1', 'b'), stars: 5 }],
      'a',
    )

    expect(tally.hearts).toBe(2)
  })

  it('누가 눌렀는지 이름으로 낸다 — 안 적은 사람은 수에만 든다', () => {
    const tally = tallyHearts([heart('p1', 'a', '민수'), heart('p1', 'b'), heart('p1', 'c', '지현')], 'a')

    expect(tally.names).toEqual(['민수', '지현'])
    expect(tally.hearts).toBe(3)
  })

  it('내가 눌렀는지 알려 준다', () => {
    expect(tallyHearts([heart('p1', 'a')], 'a').mine).toBe(true)
    expect(tallyHearts([heart('p1', 'b')], 'a').mine).toBe(false)
  })

  it('아무도 안 눌렀으면 비어 있다', () => {
    expect(tallyHearts([], 'a')).toEqual({ hearts: 0, mine: false, names: [] })
  })
})

describe('voterName — 공유 화면에서 한 번 적는 이름', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial))
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    }
  }

  it('안 적었으면 빈 문자열이다 — 이름을 강요하지 않는다', () => {
    expect(voterName(fakeStorage())).toBe('')
  })

  it('적어 두면 다음에도 그 이름으로 누른다', () => {
    const storage = fakeStorage()
    saveVoterName(storage, '  민수  ')

    expect(voterName(storage)).toBe('민수')
  })

  it('20자를 넘기지 않는다 — DB CHECK 와 같은 경계다 (0018)', () => {
    const storage = fakeStorage()
    saveVoterName(storage, '가'.repeat(30))

    expect(voterName(storage)).toHaveLength(20)
  })
})
