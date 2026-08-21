/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SHARED_REFRESH_MS, SharedTrip } from './SharedTrip'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ rpc }),
}))

vi.mock('@/lib/map/create', () => ({
  createMapProvider: () => ({ provider: {} }),
}))

vi.mock('@/components/canvas/MapPane', () => ({
  MapPane: () => <div data-testid="shared-map" />,
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function sharedBundle(name: string) {
  return {
    name,
    start_date: '2026-09-01',
    end_date: '2026-09-01',
    days: [],
    places: [],
  }
}

// 이동이 붙은 번들도 넘긴다 — sharedBundle() 의 빈 배열에서 추론된 never[] 에 묶이면
// 이동 픽스처를 못 준다
function installRpc(...tripResponses: unknown[]) {
  const responses = [...tripResponses]
  rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === 'get_shared_votes') return Promise.resolve({ data: [], error: null })
    if (fn === 'get_shared_trip') {
      const next = responses.shift()
      if (!next) throw new Error('Unexpected get_shared_trip request')
      return Promise.resolve(next).then((data) => ({ data, error: null }))
    }
    throw new Error(`Unexpected RPC: ${fn} ${JSON.stringify(args)}`)
  })
}

const SHARE_ID = '00112233445566778899aabbccddeeff'

beforeEach(() => {
  window.localStorage.clear()
  rpc.mockReset()
})

afterEach(() => cleanup())

describe('SharedTrip freshness', () => {
  it('fetches the current bundle for the shared token on first render', async () => {
    installRpc(sharedBundle('공유 직후 일정'))

    render(<SharedTrip token={SHARE_ID} />)

    expect(await screen.findByRole('heading', { name: '공유 직후 일정' })).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('get_shared_trip', { token: `\\x${SHARE_ID}` })
  })

  it('fetches the same token again when the viewer returns to the tab', async () => {
    installRpc(sharedBundle('처음 일정'), sharedBundle('주인이 고친 최신 일정'))
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '처음 일정' })

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(await screen.findByRole('heading', { name: '주인이 고친 최신 일정' })).toBeTruthy()
    expect(rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')).toHaveLength(2)
    expect(rpc).toHaveBeenLastCalledWith('get_shared_votes', {
      token: `\\x${SHARE_ID}`,
      voter_key: expect.any(String),
    })
  })

  it('fetches fresh data when a hidden shared tab becomes visible', async () => {
    installRpc(sharedBundle('숨기기 전 일정'), sharedBundle('다시 보니 최신 일정'))
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '숨기기 전 일정' })

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
    } finally {
      visibility.mockRestore()
    }

    expect(await screen.findByRole('heading', { name: '다시 보니 최신 일정' })).toBeTruthy()
    expect(rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')).toHaveLength(2)
  })

  it('offers an explicit refresh control and replaces the bundle without changing the token', async () => {
    installRpc(sharedBundle('새로고침 전 일정'), sharedBundle('새로고침 뒤 일정'))
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '새로고침 전 일정' })

    fireEvent.click(screen.getByRole('button', { name: '최신 정보 새로고침' }))

    expect(await screen.findByRole('heading', { name: '새로고침 뒤 일정' })).toBeTruthy()
    const sharedCalls = rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')
    expect(sharedCalls).toHaveLength(2)
    expect(sharedCalls[1]?.[1]).toEqual({ token: `\\x${SHARE_ID}` })
  })

  it('does not start a second refresh while the current request is in flight', async () => {
    const latest = deferred<ReturnType<typeof sharedBundle>>()
    installRpc(sharedBundle('처음 일정'), latest.promise)
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '처음 일정' })

    act(() => window.dispatchEvent(new Event('focus')))
    fireEvent.click(screen.getByRole('button', { name: '최신 정보 새로고침' }))
    expect(rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')).toHaveLength(2)

    await act(async () => latest.resolve(sharedBundle('가장 최신 일정')))
    expect(await screen.findByRole('heading', { name: '가장 최신 일정' })).toBeTruthy()
  })

  it('coalesces focus and visibility refreshes while one automatic request is in flight', async () => {
    const latest = deferred<ReturnType<typeof sharedBundle>>()
    installRpc(sharedBundle('중복 전 일정'), latest.promise)
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '중복 전 일정' })

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')).toHaveLength(2)

    await act(async () => latest.resolve(sharedBundle('중복 없이 최신 일정')))
    expect(await screen.findByRole('heading', { name: '중복 없이 최신 일정' })).toBeTruthy()
    visibility.mockRestore()
  })

  it('keeps the last good bundle when a background refresh has a transient error', async () => {
    let tripCall = 0
    rpc.mockImplementation((fn: string) => {
      if (fn === 'get_shared_votes') return Promise.resolve({ data: [], error: null })
      tripCall += 1
      return Promise.resolve(
        tripCall === 1
          ? { data: sharedBundle('마지막 정상 일정'), error: null }
          : { data: null, error: { message: 'temporary network error' } },
      )
    })
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '마지막 정상 일정' })

    fireEvent.click(screen.getByRole('button', { name: '최신 정보 새로고침' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '마지막 정상 일정' })).toBeTruthy())
    expect(screen.queryByText('링크가 열리지 않아요')).toBeNull()
  })

  it('clears stale content when the owner disables the share token', async () => {
    let tripCall = 0
    rpc.mockImplementation((fn: string) => {
      if (fn === 'get_shared_votes') return Promise.resolve({ data: [], error: null })
      tripCall += 1
      return Promise.resolve(
        tripCall === 1
          ? { data: sharedBundle('곧 해제할 일정'), error: null }
          : { data: null, error: { message: 'share/invalid-token' } },
      )
    })
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '곧 해제할 일정' })

    fireEvent.click(screen.getByRole('button', { name: '최신 정보 새로고침' }))

    expect(await screen.findByRole('heading', { name: '링크가 열리지 않아요' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '곧 해제할 일정' })).toBeNull()
  })
})


describe('SharedTrip — 몇 시 차 타는지 알려 준다 (결정 #58)', () => {
  // 0016 이 이동을 통째로 비웠더니 "우리 몇 시 차 타?" 가 공유에서 사라졌다 (사용자 지적).
  // 시각·수단·구간은 내보내고 예약번호·비용·메모·캡처는 계속 막는다 — 0017.
  function withLeg(overrides: Record<string, unknown> = {}) {
    return {
      ...sharedBundle('제주 여행'),
      days: [
        {
          id: 'd1',
          trip_id: 't1',
          date: '2026-09-01',
          position: 0,
          color: null,
          stops: [],
          legs: [
            {
              id: 'l1',
              day_id: 'd1',
              mode: 'train',
              depart_at: '09:00:00',
              arrive_at: '11:30:00',
              arrive_day_offset: 0,
              from_label: '용산역',
              to_label: '목포역',
              position: 0,
              ...overrides,
            },
          ],
        },
      ],
      places: [],
    }
  }

  it('무엇을 언제 타고 어디서 어디로 가는지 낸다', async () => {
    installRpc(withLeg())

    render(<SharedTrip token={SHARE_ID} />)

    expect(await screen.findByText(/09:00→11:30/)).toBeTruthy()
    expect(screen.getByText(/기차/)).toBeTruthy()
    expect(screen.getByText(/용산역/)).toBeTruthy()
    expect(screen.getByText(/목포역/)).toBeTruthy()
  })

  it('익일 도착이면 그렇게 말한다 — 밤 기차를 하루로 착각하면 안 된다', async () => {
    installRpc(withLeg({ depart_at: '23:00:00', arrive_at: '01:10:00', arrive_day_offset: 1 }))

    render(<SharedTrip token={SHARE_ID} />)

    expect(await screen.findByText(/\+1일/)).toBeTruthy()
  })

  it('출발지를 안 적었으면 빈칸이 아니라 미정이라고 쓴다', async () => {
    installRpc(withLeg({ from_label: '', to_label: '' }))

    render(<SharedTrip token={SHARE_ID} />)

    expect(await screen.findByText(/출발지 미정/)).toBeTruthy()
    expect(screen.getByText(/도착지 미정/)).toBeTruthy()
  })
})


describe('SharedTrip — 보관함 후보도 같이 정한다 (결정 #60)', () => {
  // 사용자 신고: "보관함 내용 여전히 안 보인다". 동행자가 하트를 줄 대상이
  // **이미 정해진 곳** 뿐이면 "어디 갈지 같이 정하자"(#46)가 성립하지 않는다.
  function place(id: string, name: string) {
    return {
      id,
      trip_id: 't1',
      category: 'restaurant' as const,
      name,
      address: '제주시',
      road_address: '제주시 노형로',
      lat: 33.5,
      lng: 126.5,
      provider: 'manual' as const,
      provider_link: null,
      category_label: '',
      images: [],
      phone: '',
      opening_hours: '',
      memo: '',
      estimated_cost: null,
      photos: [],
    }
  }

  function withCandidates() {
    return {
      ...sharedBundle('제주 여행'),
      days: [
        {
          id: 'd1',
          trip_id: 't1',
          date: '2026-09-01',
          position: 0,
          color: null,
          stops: [
            {
              id: 's1',
              day_id: 'd1',
              place_id: 'p1',
              position: 0,
              start_time: null,
              cost_amount: null,
              confirmed: true,
              note: '',
              place: place('p1', '넣어둔 식당'),
            },
          ],
          legs: [],
        },
      ],
      places: [place('p1', '넣어둔 식당'), place('p2', '아직 후보인 카페')],
    }
  }

  it('아직 일정에 없는 후보를 보관함으로 보여 준다', async () => {
    installRpc(withCandidates())

    render(<SharedTrip token={SHARE_ID} />)

    expect(await screen.findByText('아직 후보인 카페')).toBeTruthy()
  })

  it('후보에도 하트를 줄 수 있다 — 그래야 같이 정하는 것이다', async () => {
    installRpc(withCandidates())

    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByText('아직 후보인 카페')

    expect(screen.getByRole('button', { name: '아직 후보인 카페 가고 싶어요' })).toBeTruthy()
  })

  it('일정에 넣은 곳은 보관함에 겹쳐 나오지 않는다', async () => {
    installRpc(withCandidates())

    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByText('아직 후보인 카페')

    expect(screen.getAllByText('넣어둔 식당')).toHaveLength(1)
  })

  it('후보가 없으면 보관함 자리를 내지 않는다 — 빈 칸이 자리를 먹지 않는다', async () => {
    const bundle = withCandidates()
    installRpc({ ...bundle, places: [place('p1', '넣어둔 식당')] })

    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByText('넣어둔 식당')

    expect(screen.queryByRole('heading', { name: /보관함/ })).toBeNull()
  })
})


describe('SharedTrip — 가만히 둬도 최신이 된다 (결정 #61)', () => {
  // 주인이 일정을 고치면 동행자 화면이 **가만히 있어도** 따라와야 한다.
  // Supabase Realtime 은 못 쓴다: 공유 화면은 anon 이고 anon 에는 테이블 권한이 아예 없다(0007).
  // postgres_changes 는 RLS 를 그대로 타므로, 실시간을 켜려면 anon 에게 SELECT 를 열어야 한다 —
  // 그건 bearer 링크 하나로 여행 전체가 열리는 일이라 #11 을 정면으로 깬다. 그래서 **주기 조회**다.
  it('보고 있는 동안 주기적으로 다시 읽는다', async () => {
    vi.useFakeTimers()
    try {
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      installRpc(sharedBundle('처음 일정'), sharedBundle('주인이 고친 일정'))
      render(<SharedTrip token={SHARE_ID} />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')).toHaveLength(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SHARED_REFRESH_MS + 100)
      })

      expect(rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')).toHaveLength(2)
      visibility.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('탭이 숨겨져 있으면 부르지 않는다 — 안 보는 화면에 쿼터를 쓰지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      installRpc(sharedBundle('처음 일정'))
      render(<SharedTrip token={SHARE_ID} />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      const before = rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip').length

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SHARED_REFRESH_MS * 3)
      })

      expect(rpc.mock.calls.filter(([fn]) => fn === 'get_shared_trip')).toHaveLength(before)
      visibility.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })
})


describe('SharedTrip — 링크 하나로 "여기 뭐야" 에 답한다 (결정 #62)', () => {
  function placed(overrides: Record<string, unknown> = {}) {
    const p = {
      id: 'p1',
      trip_id: 't1',
      category: 'restaurant' as const,
      name: '보그호프',
      address: '부산광역시 남구 대연동 1',
      road_address: '부산광역시 남구 수영로196번길 18',
      lat: 35.13,
      lng: 129.09,
      provider: 'naver' as const,
      provider_link: 'https://www.instagram.com/voghof',
      category_label: '술집>이자카야',
      images: [],
      phone: '',
      opening_hours: '',
      memo: '',
      estimated_cost: null,
      photos: [],
      ...overrides,
    }
    return {
      ...sharedBundle('부산 여행'),
      days: [
        {
          id: 'd1',
          trip_id: 't1',
          date: '2026-09-01',
          position: 0,
          color: null,
          stops: [
            {
              id: 's1',
              day_id: 'd1',
              place_id: p.id,
              position: 0,
              start_time: null,
              cost_amount: null,
              confirmed: true,
              note: '',
              place: p,
            },
          ],
          legs: [],
        },
      ],
      places: [p],
    }
  }

  it('업종을 보여 준다 — 동행자가 술집인지 밥집인지 안다', async () => {
    installRpc(placed())

    render(<SharedTrip token={SHARE_ID} />)

    expect(await screen.findByText('술집>이자카야')).toBeTruthy()
  })

  it('네이버 지도로 한 탭에 넘어간다', async () => {
    installRpc(placed())

    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByText('보그호프')

    const link = screen.getByRole('link', { name: '보그호프 지도에서 보기' })
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toBe(
      'https://map.naver.com/p/search/남구 보그호프',
    )
  })

  it('가게가 올린 링크가 있으면 함께 준다', async () => {
    installRpc(placed())

    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByText('보그호프')

    expect(
      screen.getByRole('link', { name: '보그호프 홈페이지·SNS' }).getAttribute('href'),
    ).toBe('https://www.instagram.com/voghof')
  })

  it('가게 링크가 없으면 그 문만 빼고 지도는 남긴다', async () => {
    installRpc(placed({ provider_link: null }))

    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByText('보그호프')

    expect(screen.queryByRole('link', { name: '보그호프 홈페이지·SNS' })).toBeNull()
    expect(screen.getByRole('link', { name: '보그호프 지도에서 보기' })).toBeTruthy()
  })
})
