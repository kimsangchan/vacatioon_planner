// T6-3 — E-06 Trip Bundle 의 조회 문자열과 보관함 분류 규칙.
// 보관함(Unassigned) = 어느 Day 의 Stop 으로도 쓰이지 않은 Place (05 E-06).

import { describe, expect, it } from 'vitest'
import {
  assignedPlaces,
  toPins,
  TRIP_BUNDLE_SELECT,
  unassignedPlaces,
  type PlaceRow,
  type TripBundle,
} from './bundle'

function place(id: string, category: PlaceRow['category']): PlaceRow {
  return {
    id,
    trip_id: 'trip-1',
    category,
    name: `장소 ${id}`,
    address: '제주특별자치도',
    road_address: '제주특별자치도',
    lat: 33.5,
    lng: 126.5,
    provider: 'naver',
    provider_link: null,
    category_label: '',
    images: [],
    phone: '',
    opening_hours: 'Mon-Fri 09:00-18:00\nSat 10:00-15:00',
    memo: '',
    estimated_cost: null,
    photos: [],
  }
}

const bundle: TripBundle = {
  id: 'trip-1',
  name: '제주 3일',
  start_date: '2026-08-01',
  end_date: '2026-08-02',
  timezone: 'Asia/Seoul',
  places: [place('p1', 'restaurant'), place('p2', 'lodging'), place('p3', 'spot')],
  days: [
    {
      id: 'd1',
      trip_id: 'trip-1',
      color: null,
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
          confirmed: true,
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

describe('TRIP_BUNDLE_SELECT — E-06 단일 쿼리', () => {
  it('days·stops·legs·places·photos 임베드를 모두 포함한다', () => {
    expect(TRIP_BUNDLE_SELECT).toContain('days(')
    expect(TRIP_BUNDLE_SELECT).toContain('stops(')
    expect(TRIP_BUNDLE_SELECT).toContain('legs(')
    expect(TRIP_BUNDLE_SELECT).toContain('places(')
    expect(TRIP_BUNDLE_SELECT).toContain('photos(')
  })
})

describe('보관함 분류 (FR-005)', () => {
  it('Stop 이 없는 Place 만 보관함에 남긴다', () => {
    expect(unassignedPlaces(bundle).map((p) => p.id)).toEqual(['p1', 'p3'])
  })

  it('keeps authored multiline opening hours on places returned by bundle helpers', () => {
    expect(unassignedPlaces(bundle)[0].opening_hours).toBe(
      'Mon-Fri 09:00-18:00\nSat 10:00-15:00',
    )
  })

  it('배치된 Place 는 따로 모은다', () => {
    expect(assignedPlaces(bundle).map((p) => p.id)).toEqual(['p2'])
  })

  it('Day 가 하나도 없어도 전부 보관함이다', () => {
    expect(unassignedPlaces({ ...bundle, days: [] }).map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('toPins — 핀의 입력 (FR-005 · 결정 #41)', () => {
  it('Place 를 카테고리·좌표가 붙은 핀으로 바꾸고, 강조 대상만 selected 로 만든다', () => {
    const pins = toPins(bundle.places, 'p3', bundle.days)

    expect(pins.map((pin) => pin.id)).toEqual(['p1', 'p2', 'p3'])
    expect(pins.map((pin) => pin.label)).toEqual(bundle.places.map((place) => place.name))
    expect(pins.map((pin) => pin.selected)).toEqual([false, false, true])
    expect(pins[0].latLng).toEqual({ lat: 33.5, lng: 126.5 })
    expect(pins[0].category).toBe('restaurant')
  })

  // 색 = 몇 일차 (#41) · 숫자 = 그 날 몇 번째 방문 (#49). 두 채널이 다른 말을 해야 둘 다 읽힌다
  it('일차에 배치된 곳은 그 날 방문 순서와 일차 색을 단다', () => {
    const pins = toPins(bundle.places, null, bundle.days)
    const placed = pins.find((pin) => pin.id === 'p2')

    expect(placed?.orderNumber).toBe(1)
    expect(placed?.color).toBe('var(--day-rose)')
  })

  it('한 일차의 방문들이 서로 다른 숫자를 단다 — 예전엔 전부 같은 일차 번호였다 (#49)', () => {
    const day = {
      ...bundle.days[0],
      stops: [
        { ...bundle.days[0].stops[0], id: 's1', place_id: 'p1', position: 0 },
        { ...bundle.days[0].stops[0], id: 's2', place_id: 'p2', position: 1 },
        { ...bundle.days[0].stops[0], id: 's3', place_id: 'p3', position: 2 },
      ],
    }
    const pins = toPins(bundle.places, null, [day])

    expect(pins.map((pin) => pin.orderNumber)).toEqual([1, 2, 3])
    // 색은 셋 다 같은 일차 색이다 — 순서는 숫자가, 일차는 색이 나른다
    expect(new Set(pins.map((pin) => pin.color)).size).toBe(1)
  })

  it('둘째 일차의 순서는 다시 1부터다 — 일차마다 새로 센다', () => {
    const second = { ...bundle.days[0], id: 'd2', position: 1, stops: [
      { ...bundle.days[0].stops[0], id: 's9', place_id: 'p3', position: 0 },
    ] }
    const pins = toPins(bundle.places, null, [bundle.days[0], second])

    expect(pins.find((pin) => pin.id === 'p3')?.orderNumber).toBe(1)
  })

  it('보관함(미배치)은 숫자 없이 카테고리 색을 쓴다 — 아이콘으로 보인다', () => {
    const pins = toPins(bundle.places, null, bundle.days)
    const stored = pins.find((pin) => pin.id === 'p1')

    expect(stored?.orderNumber).toBeNull()
    expect(stored?.color).toBe('var(--pin-restaurant)')
  })

  it('일차가 색을 골랐으면 그 색을 쓴다', () => {
    const days = [{ ...bundle.days[0], color: 'sky' }, bundle.days[1]]
    const pins = toPins(bundle.places, null, days)

    expect(pins.find((pin) => pin.id === 'p2')?.color).toBe('var(--day-sky)')
  })

  // 숫자가 순서를 나르게 되면서(#49) "어느 일차인가"는 **색**이 단독으로 말한다 —
  // 그래서 이 규칙은 색으로 단언한다
  it('같은 장소가 여러 일차에 있으면 가장 이른 일차의 색을 단다 — 핀은 하나뿐이다', () => {
    const days = [
      bundle.days[1] && { ...bundle.days[1], position: 1, stops: bundle.days[0].stops },
      { ...bundle.days[0], position: 0, stops: [] },
    ].filter(Boolean) as typeof bundle.days
    const pins = toPins(bundle.places, null, [...days].reverse())

    expect(pins.find((pin) => pin.id === 'p2')?.color).toBe('var(--day-amber)')
  })

  it('lat·lng 가 문자열(numeric)로 와도 숫자로 바꾼다', () => {
    const numericAsText = { ...place('p9', 'spot'), lat: '33.458100' as unknown as number }
    expect(toPins([numericAsText], null, [])[0].latLng.lat).toBe(33.4581)
  })
})
