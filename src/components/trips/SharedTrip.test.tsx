/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SharedTrip } from './SharedTrip'

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
