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

function installRpc(...tripResponses: Array<ReturnType<typeof sharedBundle> | Promise<unknown>>) {
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

  it('does not let an older slow refresh overwrite a newer response', async () => {
    const older = deferred<ReturnType<typeof sharedBundle>>()
    const newer = deferred<ReturnType<typeof sharedBundle>>()
    installRpc(sharedBundle('처음 일정'), older.promise, newer.promise)
    render(<SharedTrip token={SHARE_ID} />)
    await screen.findByRole('heading', { name: '처음 일정' })

    act(() => window.dispatchEvent(new Event('focus')))
    fireEvent.click(screen.getByRole('button', { name: '최신 정보 새로고침' }))

    await act(async () => newer.resolve(sharedBundle('가장 최신 일정')))
    expect(await screen.findByRole('heading', { name: '가장 최신 일정' })).toBeTruthy()

    await act(async () => older.resolve(sharedBundle('늦게 도착한 예전 일정')))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '가장 최신 일정' })).toBeTruthy()
    })
    expect(screen.queryByRole('heading', { name: '늦게 도착한 예전 일정' })).toBeNull()
  })
})
