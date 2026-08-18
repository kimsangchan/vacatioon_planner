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
    expect(pins.map((pin) => pin.selected)).toEqual([false, false, true])
    expect(pins[0].latLng).toEqual({ lat: 33.5, lng: 126.5 })
    expect(pins[0].category).toBe('restaurant')
  })

  // 색은 "몇 일차인가"만 나른다. 모양(숫자/아이콘)이 "무엇을 하는 곳인가"를 맡는다 (결정 #41)
  it('일차에 배치된 곳은 그 일차 번호와 일차 색을 단다', () => {
    const pins = toPins(bundle.places, null, bundle.days)
    const placed = pins.find((pin) => pin.id === 'p2')

    expect(placed?.dayNumber).toBe(1)
    expect(placed?.color).toBe('var(--day-rose)')
  })

  it('보관함(미배치)은 숫자 없이 카테고리 색을 쓴다 — 아이콘으로 보인다', () => {
    const pins = toPins(bundle.places, null, bundle.days)
    const stored = pins.find((pin) => pin.id === 'p1')

    expect(stored?.dayNumber).toBeNull()
    expect(stored?.color).toBe('var(--pin-restaurant)')
  })

  it('일차가 색을 골랐으면 그 색을 쓴다', () => {
    const days = [{ ...bundle.days[0], color: 'sky' }, bundle.days[1]]
    const pins = toPins(bundle.places, null, days)

    expect(pins.find((pin) => pin.id === 'p2')?.color).toBe('var(--day-sky)')
  })

  it('같은 장소가 여러 일차에 있으면 가장 이른 일차를 단다 — 핀은 하나뿐이다', () => {
    const days = [
      bundle.days[1] && { ...bundle.days[1], position: 1, stops: bundle.days[0].stops },
      { ...bundle.days[0], position: 0, stops: [] },
    ].filter(Boolean) as typeof bundle.days
    const pins = toPins(bundle.places, null, [...days].reverse())

    expect(pins.find((pin) => pin.id === 'p2')?.dayNumber).toBe(2)
  })

  it('lat·lng 가 문자열(numeric)로 와도 숫자로 바꾼다', () => {
    const numericAsText = { ...place('p9', 'spot'), lat: '33.458100' as unknown as number }
    expect(toPins([numericAsText], null, [])[0].latLng.lat).toBe(33.4581)
  })
})
