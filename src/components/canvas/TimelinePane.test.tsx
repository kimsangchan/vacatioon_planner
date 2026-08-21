/** @vitest-environment jsdom */
// T7-2 (docs/design/06 변환표 FR-008·FR-008 병합) — Day 타임라인.
// 순서의 진실은 통합 position 하나뿐이고(결정 #15), 시각은 라벨이다. 지출 합계는 Stop+Leg 합(결정 #24).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { DayRow, LegRow, PhotoRow, PlaceRow, StopRow } from '@/lib/trips/bundle'
import { TimelinePane } from './TimelinePane'

afterEach(cleanup)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'

function photo(id: string): PhotoRow {
  return {
    id,
    storage_path: `photos/${id}/${id}.webp`,
    thumb_path: `photos/${id}/${id}-thumb.webp`,
    is_cover: true,
  }
}

const TICKET = photo('33333333-3333-4333-8333-333333333333')

const place = (id: string, name: string): PlaceRow => ({
  id,
  trip_id: 'trip-1',
  category: 'restaurant',
  name,
  address: '제주특별자치도',
  road_address: '제주특별자치도',
  lat: 33.5,
  lng: 126.5,
  provider: 'naver',
  provider_link: null,
  category_label: '',
  phone: '',
  opening_hours: '',
  memo: '',
  estimated_cost: null,
  photos: [],
})

const PLACES = [place('p1', '흑돼지집'), place('p2', '호텔제주')]

const stop = (o: Partial<StopRow> & { id: string; place_id: string; position: number }): StopRow => ({
  day_id: 'd1',
  start_time: null,
  cost_amount: null,
  confirmed: true,
  note: '',
  ...o,
})

const leg = (o: Partial<LegRow> & { id: string; position: number }): LegRow => ({
  day_id: 'd1',
  mode: 'bus',
  depart_at: '14:00',
  arrive_at: '15:30',
  arrive_day_offset: 0,
  from_label: '제주공항',
  to_label: '서귀포',
  booking_ref: '',
  cost_amount: null,
  memo: '',
  photos: [],
  ...o,
})

function day(o: Partial<DayRow> = {}): DayRow {
  return {
    id: 'd1',
    trip_id: 'trip-1',
    date: '2026-08-01',
    position: 0,
    color: null,
    stops: [
      stop({ id: 's1', place_id: 'p1', position: 0, start_time: '09:30', cost_amount: 12000 }),
      stop({ id: 's2', place_id: 'p2', position: 2, start_time: '11:00' }),
    ],
    legs: [leg({ id: 'l1', position: 1, cost_amount: 35800 })],
    ...o,
  }
}

function renderPane(props: Partial<Parameters<typeof TimelinePane>[0]> = {}) {
  const handlers = {
    onReorder: vi.fn().mockResolvedValue(undefined),
    onUnassignStop: vi.fn().mockResolvedValue(undefined),
    onUpdateStop: vi.fn().mockResolvedValue(undefined),
    onSaveLeg: vi.fn().mockResolvedValue(undefined),
    onAddLegPhoto: vi.fn().mockResolvedValue(undefined),
    onRemovePhoto: vi.fn().mockResolvedValue(undefined),
    onRemoveLeg: vi.fn().mockResolvedValue(undefined),
  }
  render(
    <TimelinePane day={day()} days={[day()]} label="1일차" places={PLACES} {...handlers} {...props} />,
  )
  return handlers
}

describe('TimelinePane — 붙어 있는 방문 사이 이동시간 (결정 #45)', () => {
  const ANSWER = {
    sections: [
      { durationSeconds: 3240, distanceMeters: 28073 },
      { durationSeconds: 2403, distanceMeters: 17969 },
    ],
    total: { durationSeconds: 5643, distanceMeters: 46042, tollFare: 0 },
  }

  function stubDirections() {
    const calls: unknown[] = []
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify(ANSWER), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    return { calls }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 부산역 → 기장 → 동래 처럼 나란히 담은 곳들
  const THREE = day({
    stops: [
      stop({ id: 's1', place_id: 'p1', position: 0 }),
      stop({ id: 's2', place_id: 'p2', position: 1 }),
      stop({ id: 's3', place_id: 'p1', position: 2 }),
    ],
    legs: [],
  })

  it('나란한 방문 사이마다 이동시간을 낸다 — 목록 순서가 곧 이동 순서다', async () => {
    stubDirections()
    await act(async () => {
      renderPane({ day: THREE })
    })

    expect(screen.getByTestId('travel-s1').textContent).toContain('차로 54분')
    expect(screen.getByTestId('travel-s1').textContent).toContain('28.1km')
    expect(screen.getByTestId('travel-s2').textContent).toContain('차로 40분')
  })

  it('사이에 적어 둔 이동이 있으면 그 구간엔 추정치를 내지 않는다', async () => {
    stubDirections()
    await act(async () => {
      renderPane()
    })

    // 기본 픽스처는 s1 - leg - s2 다
    expect(screen.queryByTestId('travel-s1')).toBeNull()
  })

  it('미확정 방문은 경로 요청의 좌표와 구간에서 제외한다', async () => {
    const { calls } = stubDirections()
    const ROUTE_PLACES = [
      { ...place('p1', '부산역'), lat: 35.1151, lng: 129.0403 },
      { ...place('p2', '고민 중'), lat: 35.18, lng: 129.08 },
      { ...place('p3', '기장'), lat: 35.2445, lng: 129.2223 },
    ]
    const withUnconfirmed = day({
      stops: [
        stop({ id: 's1', place_id: 'p1', position: 0, confirmed: true }),
        stop({ id: 's2', place_id: 'p2', position: 1, confirmed: false }),
        stop({ id: 's3', place_id: 'p3', position: 2, confirmed: true }),
      ],
      legs: [],
    })

    await act(async () => {
      renderPane({ day: withUnconfirmed, places: ROUTE_PLACES })
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      points: [
        { lat: ROUTE_PLACES[0].lat, lng: ROUTE_PLACES[0].lng },
        { lat: ROUTE_PLACES[2].lat, lng: ROUTE_PLACES[2].lng },
      ],
    })
    expect(screen.getByTestId('travel-s1').textContent).toContain('차로 54분')
  })

  it('순서를 바꾸면 바뀐 좌표로 다시 묻는다', async () => {
    // 기본 픽스처는 두 장소의 좌표가 같아 순서를 바꿔도 키가 그대로다 — 여기서는 갈라 둔다
    const SPREAD = [
      { ...place('p1', '부산역'), lat: 35.1151, lng: 129.0403 },
      { ...place('p2', '기장'), lat: 35.2445, lng: 129.2223 },
    ]
    const { calls } = stubDirections()
    const { rerender } = render(<TimelinePane day={THREE} label="1일차" places={SPREAD} />)
    await act(async () => {})

    const reordered = day({
      stops: [
        stop({ id: 's3', place_id: 'p2', position: 0 }),
        stop({ id: 's1', place_id: 'p1', position: 1 }),
        stop({ id: 's2', place_id: 'p2', position: 2 }),
      ],
      legs: [],
    })
    await act(async () => {
      rerender(<TimelinePane day={reordered} label="1일차" places={SPREAD} />)
    })

    expect(calls.length).toBe(2)
    expect(calls[0]).not.toEqual(calls[1])
  })
})

describe('TimelinePane — 예상 금액 표시 (결정 #39)', () => {
  // 실제와 예상이 같은 자리에 같은 모양으로 뜨면 "이미 쓴 돈"을 알 수 없다 — 말로 구분한다
  it('금액을 안 적은 방문은 그 장소의 예상 단가를 예상이라고 밝혀 보여준다', () => {
    renderPane({
      places: [place('p1', '흑돼지집'), { ...place('p2', '호텔제주'), estimated_cost: 45000 }],
    })

    expect(screen.getByText('예상 45,000원')).toBeTruthy()
  })

  it('실제 지출이 적혀 있으면 예상을 쓰지 않는다 — 실제가 이긴다', () => {
    renderPane({
      places: [{ ...place('p1', '흑돼지집'), estimated_cost: 99000 }, place('p2', '호텔제주')],
    })

    expect(screen.getByText('12,000원')).toBeTruthy()
    expect(screen.queryByText('예상 99,000원')).toBeNull()
  })

  it('예상도 실제도 없으면 아무 금액도 내지 않는다', () => {
    renderPane()

    expect(screen.queryByText(/예상/)).toBeNull()
  })
})

const row = (id: string) => screen.getByTestId(`day-item-${id}`)

function openStopActions(id: string, name: string) {
  fireEvent.click(within(row(id)).getByRole('button', { name: `${name} 작업 열기` }))
}

function openLegActions(id = 'l1') {
  fireEvent.click(within(row(id)).getByRole('button', { name: '이동 작업 열기' }))
}

describe('TimelinePane — TDS list-row 규격', () => {
  it('방문과 이동을 44px 슬롯의 타이틀·보조문구 2줄 행으로 표시한다', () => {
    renderPane()

    expect(row('s1').getAttribute('data-ui')).toBe('list-row')
    expect(row('s1').getAttribute('data-lines')).toBe('2')
    expect(row('l1').getAttribute('data-ui')).toBe('list-row')
    expect(row('l1').getAttribute('data-lines')).toBe('2')
  })

  // 순서는 행에 그대로 둔다 — 목록 순서가 곧 이동 순서라(#15) 경로·이동시간이 여기 달려 있어
  // 가장 자주 만진다. 접어 두면 한 칸 옮기는 데 두 번 눌러야 한다 (사용자 지적)
  it('순서 바꾸기는 행에 바로 두고, 편집·되돌리기만 펼친 뒤 보여 준다', () => {
    renderPane()

    expect(within(row('s1')).getByRole('button', { name: '아래로 옮기기' })).toBeTruthy()
    expect(within(row('s1')).queryByRole('button', { name: '보관함으로 되돌리기' })).toBeNull()

    fireEvent.click(within(row('s1')).getByRole('button', { name: '흑돼지집 작업 열기' }))

    expect(within(row('s1')).getByRole('button', { name: '보관함으로 되돌리기' })).toBeTruthy()
    // 순서 버튼이 서랍에도 또 생기지는 않는다 — 같은 일을 하는 버튼이 둘이면 헷갈린다
    expect(within(row('s1')).getAllByRole('button', { name: '아래로 옮기기' })).toHaveLength(1)
  })
})

describe('TimelinePane — 통합 position 병합 (결정 #15)', () => {
  it('Stop 과 Leg 를 position 순서 하나로만 늘어놓는다', () => {
    renderPane()

    const ids = screen
      .getAllByTestId(/^day-item-/)
      .map((node) => node.dataset.testid ?? node.getAttribute('data-testid'))

    expect(ids).toEqual(['day-item-s1', 'day-item-l1', 'day-item-s2'])
  })

  it('Leg 는 출발→도착 시각과 지점을 한 줄에 담는다 (SC-004)', () => {
    renderPane()

    const text = row('l1').textContent ?? ''
    expect(text).toContain('14:00')
    expect(text).toContain('15:30')
    expect(text).toContain('제주공항')
    expect(text).toContain('서귀포')
  })

  it('익일 도착 Leg 는 +1일을 붙여 알려 준다', () => {
    renderPane({
      day: day({
        stops: [],
        legs: [
          leg({ id: 'l1', position: 0, depart_at: '23:00', arrive_at: '01:10', arrive_day_offset: 1 }),
        ],
      }),
    })

    expect(row('l1').textContent).toContain('+1일')
  })

  it('position 과 시각이 역전된 항목에만 경고 배지를 붙인다', () => {
    renderPane()

    expect(row('s2').dataset.timeWarning).toBe('true')
    expect(within(row('s2')).getByText('시각 순서 확인')).toBeTruthy()
    expect(row('s1').dataset.timeWarning).toBe('false')
    expect(row('l1').dataset.timeWarning).toBe('false')
  })
})

describe('TimelinePane — Day 지출 합계 (FR-008 / 결정 #24)', () => {
  it('Stop 과 Leg 가격을 합쳐 타임라인 아래에 보여 준다', () => {
    renderPane()

    expect(screen.getByTestId('day-total').textContent).toContain('오늘 47,800원')
  })

  it('가격을 적은 항목이 없으면 합계 줄을 두지 않는다', () => {
    renderPane({
      day: day({
        stops: [stop({ id: 's1', place_id: 'p1', position: 0 })],
        legs: [],
      }),
    })

    expect(screen.queryByTestId('day-total')).toBeNull()
  })
})

describe('TimelinePane — 순서 변경 (E-07 reorder_day_items)', () => {
  it('위로 올리면 통합 순서 배열을 그대로 넘긴다', async () => {
    const { onReorder } = renderPane()
    openStopActions('s2', '호텔제주')

    await act(async () => {
      fireEvent.click(within(row('s2')).getByRole('button', { name: '위로 옮기기' }))
    })

    expect(onReorder).toHaveBeenCalledWith('d1', ['s1', 's2', 'l1'])
  })

  it('아래로 내릴 때도 Stop·Leg 를 한 배열로 다룬다', async () => {
    const { onReorder } = renderPane()
    openStopActions('s1', '흑돼지집')

    await act(async () => {
      fireEvent.click(within(row('s1')).getByRole('button', { name: '아래로 옮기기' }))
    })

    expect(onReorder).toHaveBeenCalledWith('d1', ['l1', 's1', 's2'])
  })

  it('맨 위 항목에는 위로 옮기기를 두지 않는다', () => {
    renderPane()

    expect(within(row('s1')).queryByRole('button', { name: '위로 옮기기' })).toBeNull()
    expect(within(row('s2')).queryByRole('button', { name: '아래로 옮기기' })).toBeNull()
  })
})

describe('TimelinePane — Stop 배치 해제·시각·가격 (FR-007)', () => {
  it('보관함으로 되돌리면 그 Stop 만 지운다', async () => {
    const { onUnassignStop } = renderPane()
    openStopActions('s1', '흑돼지집')

    await act(async () => {
      fireEvent.click(within(row('s1')).getByRole('button', { name: '보관함으로 되돌리기' }))
    })

    expect(onUnassignStop).toHaveBeenCalledWith('s1')
  })

  it('시각과 가격을 적어 저장한다 (원 단위 정수)', async () => {
    const { onUpdateStop } = renderPane()
    openStopActions('s2', '호텔제주')

    fireEvent.click(within(row('s2')).getByRole('button', { name: '시각·가격 적기' }))
    fireEvent.change(screen.getByLabelText('방문 시각'), { target: { value: '13:20' } })

    const price = screen.getByLabelText('가격') as HTMLInputElement
    expect(price.inputMode).toBe('numeric')
    fireEvent.change(price, { target: { value: '8000' } })
    expect(price.value).toBe('8,000')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시각·가격 저장하기' }))
    })

    expect(onUpdateStop).toHaveBeenCalledWith('s2', { start_time: '13:20', cost_amount: 8000 })
  })

  it('시각을 지우면 없는 값(null)으로 저장한다 — 시각은 선택 입력이다', async () => {
    const { onUpdateStop } = renderPane()
    openStopActions('s1', '흑돼지집')

    fireEvent.click(within(row('s1')).getByRole('button', { name: '시각·가격 적기' }))
    fireEvent.change(screen.getByLabelText('방문 시각'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('가격'), { target: { value: '' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시각·가격 저장하기' }))
    })

    expect(onUpdateStop).toHaveBeenCalledWith('s1', { start_time: null, cost_amount: null })
  })

  it('Stop 은 이름과 시각·가격을 한 줄에 둔다 (SC-004 — 높이 절제)', () => {
    renderPane()

    const text = row('s1').textContent ?? ''
    expect(text).toContain('흑돼지집')
    expect(text).toContain('09:30')
    expect(text).toContain('12,000원')
  })
})

describe('TimelinePane — 이동 담기 (FR-008)', () => {
  it('이동을 담으면 그 Day 로 넘긴다', async () => {
    const { onSaveLeg } = renderPane()

    fireEvent.click(screen.getByRole('button', { name: '이동 적기' }))
    fireEvent.change(screen.getByLabelText('출발 시각'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('도착 시각'), { target: { value: '19:10' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이동 담기' }))
    })

    expect(onSaveLeg).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ depart_at: '18:00', arrive_at: '19:10', arrive_day_offset: 0 }),
      undefined,
    )
  })

  it('담아 둔 이동은 같은 폼으로 고친다', async () => {
    const { onSaveLeg } = renderPane()
    openLegActions()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.change(screen.getByLabelText('도착 지점'), { target: { value: '중문' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이동 저장하기' }))
    })

    expect(onSaveLeg).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ to_label: '중문' }),
      'l1',
    )
  })

  // 06 부록 체크리스트 5 (L-09) — 편집 폼의 강조가 미리보기 시트의 강조와 겹치지 않게,
  // 펼치는 순간을 위(CanvasBoard)로 알린다
  it('이동 폼을 펼칠 때마다 알려 준다 (담기·고치기 모두)', () => {
    const onEditorOpen = vi.fn()
    renderPane({ onEditorOpen })
    openLegActions()

    fireEvent.click(screen.getByRole('button', { name: '이동 적기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(2)

    // 접을 때는 알리지 않는다 — 닫힌 폼 때문에 시트가 사라지면 이상하다
    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(2)
  })

  it('Stop 시각·가격 편집기를 펼칠 때도 알려 준다 — 강조는 하나다', () => {
    const onEditorOpen = vi.fn()
    renderPane({ onEditorOpen })
    openStopActions('s1', '흑돼지집')

    fireEvent.click(within(row('s1')).getByRole('button', { name: '시각·가격 적기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(within(row('s1')).getByRole('button', { name: '시각·가격 적기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(1)
  })
})

describe('TimelinePane — Leg 예매 캡처 (FR-018 / E-05 leg_id 첨부)', () => {
  const withTicket = () => day({ legs: [leg({ id: 'l1', position: 1, photos: [TICKET] })] })

  it('담아 둔 캡처를 썸네일로 두고, 누르면 원본을 연다', () => {
    renderPane({ day: withTicket() })

    const link = within(row('l1')).getByRole('link', { name: '예매 캡처 크게 보기' })
    expect(link.getAttribute('href')).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/${TICKET.storage_path}`,
    )
    expect(link.getAttribute('target')).toBe('_blank')

    const image = within(row('l1')).getByRole('img', { name: '예매 캡처' }) as HTMLImageElement
    expect(image.src).toBe(`${SUPABASE_URL}/storage/v1/object/public/${TICKET.thumb_path}`)
  })

  it('이동 고치기에서 고른 파일을 그 Leg 로 넘긴다', async () => {
    const { onAddLegPhoto } = renderPane()
    openLegActions()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    const file = new File([new Uint8Array(8)], 'ktx.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('예매 캡처 담기'), { target: { files: [file] } })
    })

    expect(onAddLegPhoto).toHaveBeenCalledWith('l1', file)
  })

  it('캡처 지우기는 되돌릴 수 없어 한 번 묻는다 (E-12 hard delete)', async () => {
    const { onRemovePhoto } = renderPane({ day: withTicket() })
    openLegActions()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.click(within(row('l1')).getByRole('button', { name: '예매 캡처 지우기' }))

    expect(onRemovePhoto).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('되돌릴 수 없어요')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '캡처 지우기' }))
    })
    expect(onRemovePhoto).toHaveBeenCalledWith(TICKET)
  })
})

describe('TimelinePane — 이동 지우기 (E-12 hard delete)', () => {
  it('확인한 뒤에만 지운다', async () => {
    const { onRemoveLeg } = renderPane()
    openLegActions()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 지우기' }))

    expect(onRemoveLeg).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('되돌릴 수 없어요')

    await act(async () => {
      fireEvent.click(within(alert).getByRole('button', { name: '지우기' }))
    })
    expect(onRemoveLeg).toHaveBeenCalledWith('l1')
  })

  it('그만두면 이동은 그대로 남는다 (T-06)', () => {
    const { onRemoveLeg } = renderPane()
    openLegActions()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 지우기' }))
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '그만두기' }))

    expect(onRemoveLeg).not.toHaveBeenCalled()
    expect(row('l1')).toBeTruthy()
  })
})

describe('TimelinePane — 확정 체크 (결정 #47)', () => {
  it('기본은 확정이다 — 일차에 넣는 행위가 이미 "가기로 했다"는 뜻이다', () => {
    renderPane()

    expect(screen.getAllByRole('checkbox')[0].getAttribute('aria-checked')).toBe('true')
  })

  it('체크를 풀면 미확정으로 저장한다 — 경로에서 빠진다', async () => {
    const handlers = renderPane()

    await act(async () => {
      fireEvent.click(screen.getAllByRole('checkbox')[0])
    })

    expect(handlers.onUpdateStop).toHaveBeenCalledWith(expect.any(String), { confirmed: false })
  })

  it('고칠 수 없는 화면에서는 체크를 내지 않는다 — 누를 수 없는 것을 보여 주지 않는다', () => {
    renderPane({ onUpdateStop: undefined })

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

describe('TimelinePane — 이동시간은 자동이다 (결정 #45, 사용자 피드백)', () => {
  it('방문이 하나뿐이면 왜 이동시간이 없는지 알려 준다 — 침묵하면 직접 넣어야 하나 싶어진다', () => {
    const one = { ...day(), stops: [day().stops[0]], legs: [] }
    render(<TimelinePane day={one} label="1일차" places={PLACES} />)

    expect(screen.getByText(/한 곳 더 담으면/)).toBeTruthy()
  })

  it('둘 이상이면 그 안내를 내지 않는다 — 할 말이 없을 때 말하지 않는다', () => {
    renderPane()

    expect(screen.queryByText(/한 곳 더 담으면/)).toBeNull()
  })

  it('이동 적기는 예매한 교통편을 적는 자리라고 밝힌다 — 이동시간을 얻는 문이 아니다', () => {
    renderPane()

    expect(screen.getByText(/예매한 기차·버스·비행기/)).toBeTruthy()
  })
})


describe('TimelinePane — 이 자리에 대신 갈 곳 (T10-22 · 결정 #53)', () => {
  // 기본 픽스처는 두 곳이 같은 좌표라 거리 순서를 만들 수 없다 — 여기서만 벌려 둔다
  const HOTEL = { ...place('p2', '호텔제주'), lat: 33.6, lng: 126.5 }
  const NEARBY = { ...place('p3', '가시아방국수'), lat: 33.503, lng: 126.5 }
  const FAR = { ...place('p4', '먼국수'), lat: 33.56, lng: 126.5 }

  function openSwap(places = [PLACES[0], HOTEL, NEARBY, FAR]) {
    const handlers = renderPane({ places })
    fireEvent.click(screen.getByRole('button', { name: '흑돼지집 작업 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '다른 곳으로 바꾸기' }))
    return handlers
  }

  it('배치된 방문의 작업에 바꾸기가 있다', () => {
    renderPane()
    fireEvent.click(screen.getByRole('button', { name: '흑돼지집 작업 열기' }))

    expect(screen.getByRole('button', { name: '다른 곳으로 바꾸기' })).toBeTruthy()
  })

  it('후보는 보관함에서 오고, 지금 그 자리의 장소는 빠진다', () => {
    openSwap()

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    const names = within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? '')

    expect(names.some((name) => name.includes('흑돼지집'))).toBe(false)
    expect(names.some((name) => name.includes('가시아방국수'))).toBe(true)
  })

  it('가까운 곳이 먼저 서고 거리를 함께 읽어 준다', () => {
    openSwap()

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    const first = within(list).getAllByRole('button')[0]

    expect(first.getAttribute('aria-label')).toContain('가시아방국수')
    expect(first.textContent).toMatch(/m|km/)
  })

  it('이미 이 날에 있는 곳은 어디 있는지 알린다 — 지우지 않는다 (#21)', () => {
    openSwap()

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    expect(within(list).getByText('이 날 2번째에 있어요')).toBeTruthy()
  })

  it('후보를 누르면 자리는 두고 장소만 바꾼다', async () => {
    const handlers = openSwap()

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    await act(async () => {
      fireEvent.click(within(list).getAllByRole('button')[0])
    })

    expect(handlers.onUpdateStop).toHaveBeenCalledWith('s1', { place_id: 'p3' })
  })

  it('바꾼 뒤 되돌리기를 누르면 원래 장소로 돌아간다', async () => {
    const handlers = openSwap()

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    await act(async () => {
      fireEvent.click(within(list).getAllByRole('button')[0])
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    })

    expect(handlers.onUpdateStop).toHaveBeenLastCalledWith('s1', { place_id: 'p1' })
  })

  it('보관함에 다른 곳이 없으면 다음 행동을 안내한다', () => {
    openSwap([PLACES[0]])

    expect(screen.getByText(/담아둔 후보가 없어요/)).toBeTruthy()
  })
})
