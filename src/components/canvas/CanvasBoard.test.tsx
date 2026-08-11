/** @vitest-environment jsdom */
// T6-3 — 보관함 분류와 리스트↔핀 상호 하이라이트 (FR-005).
// 지도는 FakeMapProvider 로 — 실지도 육안 확인은 T0-2 후.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FakeMapProvider } from '@/lib/map/fake'
import type { PlaceRow, TripBundle } from '@/lib/trips/bundle'
import { CanvasBoard } from './CanvasBoard'
import { SEARCH_DEBOUNCE_MS } from './PlaceSearchBox'

function place(
  id: string,
  name: string,
  category: PlaceRow['category'],
  lat: number,
  photos: PlaceRow['photos'] = [],
): PlaceRow {
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
    photos,
  }
}

const COVER = {
  id: '11111111-1111-4111-8111-111111111111',
  storage_path: 'photos/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111.webp',
  thumb_path:
    'photos/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111-thumb.webp',
  is_cover: true,
}

const bundle: TripBundle = {
  id: 'trip-1',
  name: '제주 3일',
  start_date: '2026-08-01',
  end_date: '2026-08-02',
  timezone: 'Asia/Seoul',
  places: [
    place('p1', '흑돼지집', 'restaurant', 33.5, [COVER]),
    place('p2', '호텔제주', 'lodging', 33.51),
    place('p3', '성산일출봉', 'spot', 33.46),
  ],
  days: [
    {
      id: 'd1',
      trip_id: 'trip-1',
      date: '2026-08-01',
      position: 0,
      stops: [
        {
          id: 's1',
          day_id: 'd1',
          place_id: 'p2',
          position: 0,
          start_time: null,
          cost_amount: null,
          note: '',
        },
      ],
      legs: [],
    },
    { id: 'd2', trip_id: 'trip-1', date: '2026-08-02', position: 1, stops: [], legs: [] },
  ],
}

let provider: FakeMapProvider
let scrollIntoView: (arg?: boolean | ScrollIntoViewOptions) => void

beforeEach(() => {
  provider = new FakeMapProvider()
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
})

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

function board(props: Partial<Parameters<typeof CanvasBoard>[0]> = {}) {
  return (
    <CanvasBoard
      bundle={bundle}
      onSave={vi.fn()}
      createProvider={() => ({ provider, kind: 'fake' as const })}
      {...props}
    />
  )
}

async function renderBoard(props: Partial<Parameters<typeof CanvasBoard>[0]> = {}) {
  const view = render(board(props))
  // mount 가 Promise 라 한 번 흘려보낸다
  await act(async () => {})
  return view
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

    // 배치된 곳은 평면 목록이 아니라 그 일차 탭에서 본다 (T7-1)
    fireEvent.click(screen.getByRole('button', { name: '1일차' }))
    expect(screen.getByRole('region', { name: '1일차 일정' }).textContent).toContain('호텔제주')
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

describe('CanvasBoard — 미리보기 (FR-006 / SC-002)', () => {
  it('캔버스가 열리면 썸네일을 미리 받아 둔다', async () => {
    await renderBoard()

    const hrefs = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]'),
    ).map((link) => link.href)

    expect(hrefs).toHaveLength(1)
    expect(hrefs[0]).toContain('/storage/v1/object/public/')
    expect(hrefs[0]).toContain('-thumb.webp')
  })

  it('리스트 항목에 호버하면 카드가 뜬다 (데스크톱)', async () => {
    await renderBoard()

    expect(screen.queryByTestId('preview-card')).toBeNull()

    fireEvent.mouseEnter(item('p1'))
    const card = screen.getByTestId('preview-card')
    expect(card.dataset.variant).toBe('card')
    expect(card.textContent).toContain('흑돼지집')

    fireEvent.mouseLeave(item('p1'))
    expect(screen.queryByTestId('preview-card')).toBeNull()
  })

  it('핀을 누르면 바텀시트로 열고, 닫으면 사라진다 (모바일 — 뎁스 2)', async () => {
    await renderBoard()

    await act(async () => provider.emitPinEvent('p3', 'tap'))

    const sheet = screen.getByTestId('preview-card')
    expect(sheet.dataset.variant).toBe('sheet')
    expect(sheet.textContent).toContain('성산일출봉')

    fireEvent.click(screen.getByRole('button', { name: '미리보기 닫기' }))
    expect(screen.queryByTestId('preview-card')).toBeNull()
  })

  it('사진 없는 곳도 카드에서 바로 사진을 담을 수 있다 (PRD 엣지)', async () => {
    const onAddPhoto = vi.fn().mockResolvedValue(undefined)
    await renderBoard({ onAddPhoto })

    await act(async () => provider.emitPinEvent('p3', 'tap'))
    expect(screen.getByTestId('photo-placeholder')).toBeTruthy()

    const file = new File([new Uint8Array(8)], 'jeju.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('사진 담기'), { target: { files: [file] } })
    })

    expect(onAddPhoto).toHaveBeenCalledWith('p3', file)
  })

  it('시트에서 고친 메모를 그 장소에 저장한다 (FR-009)', async () => {
    const onSaveMemo = vi.fn().mockResolvedValue(undefined)
    await renderBoard({ onSaveMemo })

    await act(async () => provider.emitPinEvent('p1', 'tap'))
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '예약 필요' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메모 저장하기' }))
    })

    expect(onSaveMemo).toHaveBeenCalledWith('p1', '예약 필요')
  })
})

describe('CanvasBoard — 보관함↔일차 배치 (FR-007)', () => {
  it('보관함 항목에서 두 번 눌러 일차에 넣는다 (모바일 친화)', async () => {
    const onAssignPlace = vi.fn().mockResolvedValue(undefined)
    await renderBoard({ onAssignPlace })

    fireEvent.click(screen.getByRole('button', { name: '흑돼지집 일정에 넣기' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '흑돼지집 2일차에 넣기' }))
    })

    expect(onAssignPlace).toHaveBeenCalledWith('p1', 'd2')
  })

  it('일차 탭에서 보관함으로 되돌린다', async () => {
    const onUnassignStop = vi.fn().mockResolvedValue(undefined)
    await renderBoard({ onUnassignStop })

    fireEvent.click(screen.getByRole('button', { name: '1일차' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '보관함으로 되돌리기' }))
    })

    expect(onUnassignStop).toHaveBeenCalledWith('s1')
  })

  it('배치된 곳의 핀을 누르면 그 일차 탭을 열어 보여 준다', async () => {
    await renderBoard()

    await act(async () => provider.emitPinEvent('p2', 'tap'))

    expect(screen.getByRole('region', { name: '1일차 일정' }).textContent).toContain('호텔제주')
    expect(scrollIntoView).toHaveBeenCalled()
  })
})

// 06 부록 체크리스트 5 (L-09) — 한 화면에 강조색 CTA 는 하나뿐이다
describe('CanvasBoard — 강조 CTA 하나 (L-09)', () => {
  it('펼친 일차 칩은 강조하지 않는다 — 고르는 자리이지 주 행동이 아니다', async () => {
    await renderBoard({ onAssignPlace: vi.fn() })

    fireEvent.click(screen.getByRole('button', { name: '흑돼지집 일정에 넣기' }))

    for (const name of ['흑돼지집 1일차에 넣기', '흑돼지집 2일차에 넣기']) {
      expect(screen.getByRole('button', { name }).className).not.toContain('bg-foreground')
    }
  })

  it('이동 폼을 펼치면 열려 있던 미리보기 시트를 닫는다', async () => {
    await renderBoard({ onSaveLeg: vi.fn(), onSaveMemo: vi.fn() })

    // 배치된 곳의 핀 → 1일차 타임라인 + 미리보기 시트("메모 저장하기" 강조)
    await act(async () => provider.emitPinEvent('p2', 'tap'))
    expect(screen.getByRole('button', { name: '메모 저장하기' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '이동 적기' }))

    expect(screen.getByTestId('leg-form')).toBeTruthy()
    expect(screen.queryByTestId('preview-card')).toBeNull()
  })

  it('Stop 시각·가격 편집기를 펼쳐도 미리보기 시트를 닫는다', async () => {
    await renderBoard({ onUpdateStop: vi.fn(), onSaveMemo: vi.fn() })

    await act(async () => provider.emitPinEvent('p2', 'tap'))
    expect(screen.getByRole('button', { name: '메모 저장하기' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '시각·가격 적기' }))

    expect(screen.getByLabelText('방문 시각')).toBeTruthy()
    expect(screen.queryByTestId('preview-card')).toBeNull()
  })

  it('검색 결과를 고르면 (카테고리 확정 칩) 미리보기 시트를 닫는다', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              name: '흑돼지 명가',
              address: '제주특별자치도 제주시 연동 1',
              roadAddress: '제주특별자치도 제주시 노형로 1',
              lat: 33.49,
              lng: 126.53,
              categoryHint: 'restaurant',
              providerLink: null,
              provider: 'naver',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    try {
      await renderBoard({ onSaveMemo: vi.fn() })

      fireEvent.click(item('p3'))
      expect(screen.getByRole('button', { name: '메모 저장하기' })).toBeTruthy()

      fireEvent.change(screen.getByLabelText('장소 검색'), { target: { value: '흑돼지' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10)
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /흑돼지 명가/ }))
      })

      expect(screen.getByRole('button', { name: '식당으로 담기' })).toBeTruthy()
      expect(screen.queryByTestId('preview-card')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it('캔버스 밖(헤더 기간 폼)에서 온 신호에도 시트를 닫는다', async () => {
    const { rerender } = await renderBoard({ editorSignal: 0, onSaveMemo: vi.fn() })

    fireEvent.click(item('p3'))
    expect(screen.getByTestId('preview-card')).toBeTruthy()

    rerender(board({ editorSignal: 1, onSaveMemo: vi.fn() }))

    expect(screen.queryByTestId('preview-card')).toBeNull()
  })
})

// 롱프레스·우클릭은 숨은 동작이라 아무도 발견하지 못한다 — 보이는 문이 필요하다.
// 그냥 탭에 바로 걸면 지도 이동·핀 선택과 부딪히므로, 모드를 켠 뒤 한 번만 받는다.
describe('CanvasBoard — 지도에서 찍기 모드 (FR-016 발견성)', () => {
  it('평소에는 지도 탭이 아무것도 열지 않는다', async () => {
    await renderBoard()

    await act(async () => provider.emitMapTap({ lat: 33.4, lng: 126.6 }))

    expect(screen.queryByTestId('manual-place-form')).toBeNull()
  })

  it('버튼으로 모드를 켜면 다음 탭 자리에 미니 폼이 열린다', async () => {
    await renderBoard()

    fireEvent.click(screen.getByRole('button', { name: '지도에서 찍기' }))
    // Fake 지도 배너도 role="status" 라 문구로 특정한다
    expect(screen.getByText(/담고 싶은 자리를 눌러 주세요/)).toBeTruthy()

    await act(async () => provider.emitMapTap({ lat: 33.4, lng: 126.6 }))

    expect(screen.getByTestId('manual-place-form').textContent).toContain('33.4, 126.6')
  })

  it('한 번 찍으면 모드가 꺼진다 — 다음 탭은 다시 지도 조작이다', async () => {
    await renderBoard()

    fireEvent.click(screen.getByRole('button', { name: '지도에서 찍기' }))
    await act(async () => provider.emitMapTap({ lat: 33.4, lng: 126.6 }))
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))

    await act(async () => provider.emitMapTap({ lat: 33.5, lng: 126.7 }))

    expect(screen.queryByTestId('manual-place-form')).toBeNull()
  })

  it('모드를 켰다가 다시 누르면 끈다', async () => {
    await renderBoard()

    fireEvent.click(screen.getByRole('button', { name: '지도에서 찍기' }))
    fireEvent.click(screen.getByRole('button', { name: '지도에서 찍기' }))

    await act(async () => provider.emitMapTap({ lat: 33.4, lng: 126.6 }))

    expect(screen.queryByTestId('manual-place-form')).toBeNull()
  })
})

describe('CanvasBoard — 지도에서 직접 담기 (FR-016)', () => {
  it('지도를 길게 누르면 그 좌표로 미니 폼을 연다', async () => {
    await renderBoard()

    expect(screen.queryByTestId('manual-place-form')).toBeNull()

    await act(async () => provider.emitLongPress({ lat: 33.4, lng: 126.6 }))

    expect(screen.getByTestId('manual-place-form').textContent).toContain('33.4, 126.6')
  })

  it('이름을 적고 담으면 provider=manual 로 저장한다', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await renderBoard({ onSave })

    await act(async () => provider.emitLongPress({ lat: 33.4, lng: 126.6 }))
    fireEvent.change(screen.getByLabelText('장소 이름'), { target: { value: '이름 없는 전망대' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 자리에 담기' }))
    })

    expect(onSave).toHaveBeenCalledWith({
      category: 'spot',
      name: '이름 없는 전망대',
      address: '',
      road_address: '',
      lat: 33.4,
      lng: 126.6,
      provider: 'manual',
      provider_link: null,
    })
    expect(screen.queryByTestId('manual-place-form')).toBeNull()
  })
})
