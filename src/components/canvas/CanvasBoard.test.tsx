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
    estimated_cost: null,
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
      color: null,
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
    {
      id: 'd2',
      trip_id: 'trip-1',
      date: '2026-08-02',
      position: 1,
      color: null,
      stops: [],
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

describe('CanvasBoard — 모바일 하단 메뉴 (결정 #42)', () => {
  // 사용자 방향: "네이버 지도처럼 하단에 메뉴를 만들어서 분리". 지도가 기본 화면이고,
  // 보관함·일정은 하단 메뉴로 갈아탄다 — 패널이 지도를 상시로 덮지 않는다.
  const nav = (name: string) => screen.getByRole('button', { name })

  it('담아둔 곳이 있으면 지도로 시작한다 — 패널이 지도를 덮지 않는다', async () => {
    await renderBoard()

    expect(nav('지도').getAttribute('aria-current')).toBe('page')
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('false')
  })

  it('아직 담아둔 곳이 없으면 보관함으로 시작한다 — 지도에 볼 것도 담을 문도 없으면 막힌다', async () => {
    await renderBoard({ bundle: { ...bundle, places: [], days: [] } })

    expect(nav('보관함').getAttribute('aria-current')).toBe('page')
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('true')
  })

  it('하단 메뉴로 보관함·일정·지도를 갈아탄다', async () => {
    await renderBoard()

    fireEvent.click(nav('보관함'))
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('true')
    expect(nav('보관함').getAttribute('aria-current')).toBe('page')

    fireEvent.click(nav('일정'))
    expect(nav('일정').getAttribute('aria-current')).toBe('page')

    fireEvent.click(nav('지도'))
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('false')
  })

  it('핀을 눌러 카드를 띄워도 패널이 따라 열리지 않는다', async () => {
    await renderBoard({ onSaveMemo: vi.fn() })

    await act(async () => provider.emitPinEvent('p3', 'tap'))

    expect(screen.getByTestId('preview-card')).toBeTruthy()
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('false')
  })

  it('보관함에서 장소를 누르면 지도로 넘어가며 카드가 뜬다 — 카드는 지도 위에 산다', async () => {
    await renderBoard({ onSaveMemo: vi.fn() })

    fireEvent.click(nav('보관함'))
    fireEvent.click(item('p3'))

    expect(screen.getByTestId('preview-card')).toBeTruthy()
    expect(nav('지도').getAttribute('aria-current')).toBe('page')
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('CanvasBoard — 패널을 아래로 쓸어 내린다 (사용자 요청)', () => {
  const open = async () => {
    await renderBoard()
    fireEvent.click(screen.getByRole('button', { name: '보관함' }))
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('true')
    return sheetHandle()
  }

  it('손잡이를 아래로 끌면 패널이 내려가고 지도가 보인다', async () => {
    const handle = await open()

    fireEvent.pointerDown(handle, { clientY: 100 })
    fireEvent.pointerMove(handle, { clientY: 180 })
    fireEvent.pointerUp(handle, { clientY: 180 })

    expect(sheetHandle().getAttribute('aria-expanded')).toBe('false')
  })

  it('조금 흔들린 것은 끌기가 아니다 — 탭으로 읽어 그대로 토글한다', async () => {
    const handle = await open()

    fireEvent.pointerDown(handle, { clientY: 100 })
    fireEvent.pointerMove(handle, { clientY: 104 })
    fireEvent.pointerUp(handle, { clientY: 104 })
    fireEvent.click(handle)

    // 탭이므로 토글 — 열려 있었으니 닫힌다
    expect(sheetHandle().getAttribute('aria-expanded')).toBe('false')
  })

  it('끌어서 닫은 뒤 따라오는 click 은 삼킨다 — 닫자마자 다시 열리면 안 된다', async () => {
    const handle = await open()

    fireEvent.pointerDown(handle, { clientY: 100 })
    fireEvent.pointerMove(handle, { clientY: 200 })
    fireEvent.pointerUp(handle, { clientY: 200 })
    fireEvent.click(handle)

    expect(sheetHandle().getAttribute('aria-expanded')).toBe('false')
  })

  it('위로 끄는 것은 닫지 않는다 — 내리는 동작만 받는다', async () => {
    const handle = await open()

    fireEvent.pointerDown(handle, { clientY: 200 })
    fireEvent.pointerMove(handle, { clientY: 100 })
    fireEvent.pointerUp(handle, { clientY: 100 })

    expect(sheetHandle().getAttribute('aria-expanded')).toBe('true')
  })
})

describe('CanvasBoard — 일차 색 (결정 #41)', () => {
  it('일차 탭에 그 일차 색을 함께 낸다 — 지도 핀 색과 같은 색이어야 짝이 지어진다', async () => {
    await renderBoard()

    const swatch = screen.getByTestId('day-color-d1')
    // 고른 색이 없으면 순서대로 팔레트를 돈다 (position 0 → 첫 색)
    expect(swatch.style.background).toContain('--day-rose')
  })

  it('고른 색이 있으면 그 색을 낸다', async () => {
    const days = [{ ...bundle.days[0], color: 'sky' }, bundle.days[1]]
    await renderBoard({ bundle: { ...bundle, days } })

    expect(screen.getByTestId('day-color-d1').style.background).toContain('--day-sky')
  })

  it('일차를 열고 색을 고르면 그 일차에만 저장한다', async () => {
    const onSetDayColor = vi.fn().mockResolvedValue(undefined)
    await renderBoard({ onSetDayColor })

    fireEvent.click(screen.getByRole('button', { name: '1일차' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1일차 색 하늘로 바꾸기' }))
    })

    expect(onSetDayColor).toHaveBeenCalledWith('d1', 'sky')
  })

  it('보관함 항목은 카테고리를 아이콘으로 낸다', async () => {
    await renderBoard()

    expect(screen.getByTestId('place-item-p1').querySelector('svg')).toBeTruthy()
  })
})

describe('CanvasBoard — 여행 경비 요약 (결정 #39)', () => {
  // 확정(이미 쓴 돈)과 예상을 한 숫자로 합치면 화면에서 되찾을 수 없다 — 두 줄로 나눈다
  function budgetBundle(over: {
    stopCost?: number | null
    placedEstimate?: number | null
    storageEstimate?: number | null
  }) {
    const day = bundle.days[0]
    return {
      ...bundle,
      places: bundle.places.map((place) =>
        place.id === 'p2'
          ? { ...place, estimated_cost: over.placedEstimate ?? null }
          : place.id === 'p3'
            ? { ...place, estimated_cost: over.storageEstimate ?? null }
            : place,
      ),
      days: [
        { ...day, stops: [{ ...day.stops[0], cost_amount: over.stopCost ?? null }] },
        bundle.days[1],
      ],
    }
  }

  it('적어 둔 금액이 하나도 없으면 요약을 내지 않는다', async () => {
    await renderBoard({ bundle: budgetBundle({}) })

    expect(screen.queryByTestId('trip-budget')).toBeNull()
  })

  it('확정과 예상 포함을 두 줄로 나눠 보여준다', async () => {
    await renderBoard({ bundle: budgetBundle({ stopCost: 15000 }) })

    const budget = screen.getByTestId('trip-budget')
    expect(budget.textContent).toContain('확정')
    expect(budget.textContent).toContain('15,000원')
  })

  it('금액을 안 적은 방문은 그 장소 예상으로 채워 "예상 포함"에만 더한다', async () => {
    await renderBoard({ bundle: budgetBundle({ placedEstimate: 45000 }) })

    const budget = screen.getByTestId('trip-budget')
    expect(budget.textContent).toContain('예상 포함')
    expect(budget.textContent).toContain('45,000원')
  })

  it('보관함 예상은 여행 총액에 안 섞고 보관함 안에서만 센다', async () => {
    await renderBoard({ bundle: budgetBundle({ stopCost: 15000, storageEstimate: 70000 }) })

    // 총액 줄에는 보관함 몫이 들어가지 않는다
    expect(screen.getByTestId('trip-budget').textContent).not.toContain('70,000원')
    // 보관함 탭 안에는 소계가 뜬다
    expect(screen.getByTestId('storage-estimate').textContent).toContain('70,000원')
  })
})

const sheetHandle = () => screen.getByRole('button', { name: /리스트 (올리기|내리기)/ })

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
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
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

  // 사용자 보고: "스팟으로 지정하고 난 다음에 스팟 클릭하면 카드형으로 떠서 수정" 이 안 된다.
  // 보관함에서든 일차에 배치된 뒤든, 그 장소를 누르면 같은 카드가 떠야 한다.
  it('일차에 배치된 Stop 을 눌러도 그 장소 카드가 시트로 열린다', async () => {
    await renderBoard({ onSaveMemo: vi.fn() })

    fireEvent.click(screen.getByRole('button', { name: '1일차' }))
    fireEvent.click(screen.getByRole('button', { name: /호텔제주/ }))

    expectFloatingCard()
  })

  // 사용자 지적: "스팟 위에 마우스 이동을 하든 화면 확대축소를 하든 따라오게 해줘야 하는 거 아니야?
  // 화면 우측 하단에 고정인 거 같은데" — 화면 모서리에 붙박인 것은 지도 위 카드가 아니다.
  it('카드는 그 장소 핀에 붙어 뜨고, 지도를 움직이면 따라온다', async () => {
    await renderBoard({ onSaveMemo: vi.fn() })

    fireEvent.click(item('p3'))

    const at = () => screen.getByTestId('place-card-anchor').style
    const projected = provider.project({ lat: 33.46, lng: 126.5 })
    expect(projected).not.toBeNull()
    expect(at().left).toBe(`${projected?.x}px`)
    // 핀 위에 자리가 넉넉하면 핀 위에 얹는다 — 아래쪽 끝을 핀에 붙인다
    expect(at().bottom).toBe(`calc(100% - ${(projected?.y ?? 0) - 14}px)`)

    // 지도를 끌거나 확대축소하면 같은 좌표의 화면 위치가 달라진다 — 카드도 따라와야 한다
    await act(async () => {
      provider.projection = () => ({ x: 40, y: 90 })
      provider.emitViewportChange()
    })

    expect(at().left).toBe('40px')
    // 이제 핀이 위쪽에 있어 얹을 자리가 없다 — 아래로 뒤집고 위쪽 끝을 핀에 붙인다
    expect(at().top).toBe('104px')
    expect(at().bottom).toBe('')
  })

  it('카드를 닫으면 지도 구독도 거둔다 — 열고 닫을수록 쌓이면 안 된다', async () => {
    await renderBoard({ onSaveMemo: vi.fn() })

    fireEvent.click(item('p3'))
    expect(provider.viewportSubscriberCount).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '미리보기 닫기' }))
    expect(provider.viewportSubscriberCount).toBe(0)
  })

  it('보관함의 장소를 눌러도 같은 카드가 떠오른다', async () => {
    await renderBoard({ onSaveMemo: vi.fn() })

    fireEvent.click(item('p3'))

    expectFloatingCard()
  })

  it('이동 폼을 펼치면 열려 있던 미리보기 시트를 닫는다', async () => {
    await renderBoard({ onSaveLeg: vi.fn(), onSaveMemo: vi.fn() })

    // 배치된 곳의 핀 → 1일차 타임라인 + 미리보기 시트("메모 저장하기" 강조)
    await act(async () => provider.emitPinEvent('p2', 'tap'))
    expect(screen.getByRole('button', { name: '저장하기' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '이동 적기' }))

    expect(screen.getByTestId('leg-form')).toBeTruthy()
    expect(screen.queryByTestId('preview-card')).toBeNull()
  })

  it('Stop 시각·가격 편집기를 펼쳐도 미리보기 시트를 닫는다', async () => {
    await renderBoard({ onUpdateStop: vi.fn(), onSaveMemo: vi.fn() })

    await act(async () => provider.emitPinEvent('p2', 'tap'))
    expect(screen.getByRole('button', { name: '저장하기' })).toBeTruthy()

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
      expect(screen.getByRole('button', { name: '저장하기' })).toBeTruthy()

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

  // 검색 결과가 와도 시트가 46% 에 머무르면 뒤쪽 결과가 화면 밖으로 잘린다.
  // 스크롤은 되지만 잘린 티가 나지 않아 "결과가 없는 것"으로 읽힌다 (사용자 보고).
  function searchResponse(count: number) {
    return new Response(
      JSON.stringify(
        Array.from({ length: count }, (_, i) => ({
          name: `흑돼지 명가 ${i + 1}호점`,
          address: `제주특별자치도 제주시 연동 ${i + 1}`,
          roadAddress: `제주특별자치도 제주시 노형로 ${i + 1}`,
          lat: 33.49 + i / 1000,
          lng: 126.53,
          categoryHint: 'restaurant',
          providerLink: null,
          provider: 'naver',
        })),
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  // 사용자 보고: "카드 팝업 안되고 왼쪽 패널에 여전히 있는데".
  // 카드가 DOM 에 있는 것만으로는 부족하다 — 리스트 패널 바깥, 캔버스 위에 떠 있어야 한다.
  // jsdom 에는 레이아웃이 없으므로 위치 대신 "어느 부모 아래에 있는가"로 못 박는다.
  function expectFloatingCard() {
    const card = screen.getByTestId('preview-card')
    expect(card.dataset.variant).toBe('sheet')
    expect(screen.getByRole('button', { name: '저장하기' })).toBeTruthy()
    expect(document.querySelector('aside')?.contains(card)).toBe(false)
  }

  // 결정 #42 이후 패널은 사용자가 열고 닫는다 — 검색이 끝났다고 앱이 여닫지 않는다.
  // (닫은 뒤 늦게 도착한 응답이 패널을 되살리면 사용자가 내린 결정을 뒤집는 셈이다)
  it('검색 결과가 도착해도 패널을 임의로 여닫지 않는다', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(searchResponse(5)))

    try {
      await renderBoard({ onSaveMemo: vi.fn() })
      fireEvent.click(screen.getByRole('button', { name: '보관함' }))
      expect(sheetHandle().getAttribute('aria-expanded')).toBe('true')

      fireEvent.change(screen.getByLabelText('장소 검색'), { target: { value: '흑돼지' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10)
      })

      // 받은 5건이 하나도 빠지지 않고 목록에 있다
      for (let i = 1; i <= 5; i += 1) {
        expect(screen.getByRole('button', { name: new RegExp(`흑돼지 명가 ${i}호점`) })).toBeTruthy()
      }
      expect(sheetHandle().getAttribute('aria-expanded')).toBe('true')
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
