/** @vitest-environment jsdom */
// T6-3 — 보관함 분류와 리스트↔핀 상호 하이라이트 (FR-005).
// 지도는 FakeMapProvider 로 — 실지도 육안 확인은 T0-2 후.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FakeMapProvider } from '@/lib/map/fake'
import type { PlaceRow, TripBundle } from '@/lib/trips/bundle'
import { CanvasBoard } from './CanvasBoard'

function place(id: string, name: string, category: PlaceRow['category'], lat: number): PlaceRow {
  return {
    id,
    trip_id: 'trip-1',
    category,
    name,
    address: '제주특별자치도',
    road_address: '제주특별자치도',
    lat,
    lng: 126.5,
    provider: 'naver',
    provider_link: null,
    memo: '',
    photos: [],
  }
}

const bundle: TripBundle = {
  id: 'trip-1',
  name: '제주 3일',
  start_date: '2026-08-01',
  end_date: '2026-08-02',
  timezone: 'Asia/Seoul',
  places: [
    place('p1', '흑돼지집', 'restaurant', 33.5),
    place('p2', '호텔제주', 'lodging', 33.51),
    place('p3', '성산일출봉', 'spot', 33.46),
  ],
  days: [
    {
      id: 'd1',
      trip_id: 'trip-1',
      date: '2026-08-01',
      position: 0,
      stops: [{ id: 's1', day_id: 'd1', place_id: 'p2', position: 0, start_time: null, note: '' }],
      legs: [],
    },
  ],
}

let provider: FakeMapProvider
let scrollIntoView: (arg?: boolean | ScrollIntoViewOptions) => void

beforeEach(() => {
  provider = new FakeMapProvider()
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
})

afterEach(cleanup)

async function renderBoard() {
  render(
    <CanvasBoard
      bundle={bundle}
      onSave={vi.fn()}
      createProvider={() => ({ provider, kind: 'fake' as const })}
    />,
  )
  // mount 가 Promise 라 한 번 흘려보낸다
  await act(async () => {})
}

function item(placeId: string): HTMLElement {
  return screen.getByTestId(`place-item-${placeId}`)
}

describe('CanvasBoard — 보관함 (FR-005)', () => {
  it('Stop 이 없는 Place 만 보관함에 놓고, 배치된 곳은 따로 묶는다', async () => {
    await renderBoard()

    const storage = screen.getByRole('region', { name: /보관함/ })
    expect(storage.textContent).toContain('흑돼지집')
    expect(storage.textContent).toContain('성산일출봉')
    expect(storage.textContent).not.toContain('호텔제주')

    expect(screen.getByRole('region', { name: /일정에 담긴 곳/ }).textContent).toContain('호텔제주')
  })

  it('지도 키가 없으면 Fake 지도임을 알려준다', async () => {
    await renderBoard()

    expect(screen.getByRole('status').textContent).toContain('지도 키를 넣으면 실지도가 보여요')
  })

  it('살아있는 Place 전부를 카테고리 3색 핀으로 올린다', async () => {
    await renderBoard()

    expect(provider.pins.map((p) => [p.id, p.category])).toEqual([
      ['p1', 'restaurant'],
      ['p2', 'lodging'],
      ['p3', 'spot'],
    ])
  })
})

describe('CanvasBoard — 리스트↔핀 상호 하이라이트 (FR-005)', () => {
  it('리스트 항목에 호버하면 그 핀만 강조된다', async () => {
    await renderBoard()

    fireEvent.mouseEnter(item('p3'))
    expect(provider.highlightedIds).toEqual(['p3'])

    fireEvent.mouseLeave(item('p3'))
    expect(provider.highlightedIds).toEqual([])
  })

  it('핀에 호버하면 리스트 항목이 강조된다 (반대 방향)', async () => {
    await renderBoard()

    await act(async () => provider.emitPinEvent('p1', 'hover'))
    expect(item('p1').dataset.highlighted).toBe('true')
    expect(item('p3').dataset.highlighted).toBe('false')

    await act(async () => provider.emitPinEvent('p1', 'leave'))
    expect(item('p1').dataset.highlighted).toBe('false')
  })

  it('핀을 누르면 해당 리스트 항목으로 스크롤하고 강조를 남긴다', async () => {
    await renderBoard()

    await act(async () => provider.emitPinEvent('p3', 'tap'))

    expect(item('p3').dataset.highlighted).toBe('true')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('리스트 항목을 누르면 지도를 그 좌표로 옮긴다', async () => {
    await renderBoard()

    fireEvent.click(item('p3'))

    expect(provider.pannedTo.at(-1)).toEqual({ lat: 33.46, lng: 126.5 })
  })
})
