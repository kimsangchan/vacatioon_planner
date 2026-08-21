// T10-20 — "2일차 2번, 플랜 A 가 문을 닫았을 때" 대신 갈 곳을 세운다 (결정 #53).
//
// 후보를 미리 등록해 두지 않는다 — **보관함에 담은 것이 곧 후보군**이다 (#8 수집≠배치).
// 목록을 여는 순간 그 자리 기준으로 줄을 세운다:
//   같은 카테고리 먼저 → 가까운 순 → 별 많은 순 → 이름순(동률에서 흔들리지 않게)
// 카테고리를 맨 앞에 둔 이유: 점심 자리에 300m 카페가 800m 밥집보다 위로 오면 안 된다.

import { describe, expect, it } from 'vitest'
import type { DayRow, PlaceRow, StopRow, TripBundle } from '@/lib/trips/bundle'
import type { PlaceCategory } from '@/lib/place/category'
import { swapCandidates } from './swap'

const BASE = { lat: 33.45, lng: 126.5 }

function place(
  id: string,
  overrides: { category?: PlaceCategory; lat?: number; lng?: number; stars?: number[] } = {},
): PlaceRow {
  const { category = 'restaurant', lat = BASE.lat, lng = BASE.lng, stars = [] } = overrides
  return {
    id,
    trip_id: 'trip-1',
    category,
    name: id,
    address: `주소 ${id}`,
    road_address: `도로명 ${id}`,
    lat,
    lng,
    provider: 'naver',
    provider_link: null,
    phone: '',
    opening_hours: '',
    memo: '',
    estimated_cost: null,
    photos: [],
    place_votes: stars.map((value, index) => ({
      place_id: id,
      voter_key: `voter-${index}`,
      stars: value,
    })),
  }
}

function stop(id: string, placeId: string, position: number): StopRow {
  return {
    id,
    day_id: 'day-1',
    place_id: placeId,
    position,
    start_time: null,
    cost_amount: null,
    confirmed: true,
    note: '',
  }
}

function day(id: string, position: number, stops: StopRow[]): DayRow {
  return {
    id,
    trip_id: 'trip-1',
    date: `2026-09-${25 + position}`,
    position,
    color: null,
    stops: stops.map((item) => ({ ...item, day_id: id })),
    legs: [],
  }
}

function bundle(days: DayRow[], places: PlaceRow[]): TripBundle {
  return {
    id: 'trip-1',
    name: '제주',
    start_date: '2026-09-25',
    end_date: '2026-09-27',
    timezone: 'Asia/Seoul',
    days,
    places,
  }
}

// 약 1km 는 위도 0.009도쯤 된다 — 거리 순서를 만들 때 쓴다
const km = (n: number) => BASE.lat + n * 0.009

describe('swapCandidates — 이 자리에 대신 갈 곳', () => {
  it('지금 그 자리에 있는 곳은 후보가 아니다', () => {
    const planA = place('플랜A')
    const other = place('가까운밥집', { lat: km(1) })
    const trip = bundle([day('day-1', 0, [stop('s1', '플랜A', 0)])], [planA, other])

    const found = swapCandidates(trip, 's1')

    expect(found.map((item) => item.place.id)).toEqual(['가까운밥집'])
  })

  it('같은 카테고리를 먼저 세운다 — 점심 자리에 밥집이 먼저다', () => {
    const trip = bundle(
      [day('day-1', 0, [stop('s1', '플랜A', 0)])],
      [
        place('플랜A'),
        place('바로옆카페', { category: 'spot', lat: km(0.3) }),
        place('먼밥집', { category: 'restaurant', lat: km(2) }),
      ],
    )

    expect(swapCandidates(trip, 's1').map((item) => item.place.id)).toEqual([
      '먼밥집',
      '바로옆카페',
    ])
  })

  it('같은 카테고리 안에서는 가까운 곳이 먼저다', () => {
    const trip = bundle(
      [day('day-1', 0, [stop('s1', '플랜A', 0)])],
      [place('플랜A'), place('먼집', { lat: km(3) }), place('가까운집', { lat: km(1) })],
    )

    expect(swapCandidates(trip, 's1').map((item) => item.place.id)).toEqual([
      '가까운집',
      '먼집',
    ])
  })

  it('거리가 같으면 별을 많이 받은 곳이 먼저다', () => {
    const trip = bundle(
      [day('day-1', 0, [stop('s1', '플랜A', 0)])],
      [
        place('플랜A'),
        place('표적은집', { lat: km(1), stars: [2] }),
        place('표많은집', { lat: km(1), stars: [5, 4] }),
      ],
    )

    const found = swapCandidates(trip, 's1')
    expect(found.map((item) => item.place.id)).toEqual(['표많은집', '표적은집'])
    expect(found[0].stars).toBe(9)
  })

  it('거리를 미터로 함께 준다 — 표기는 화면이 정한다', () => {
    const trip = bundle(
      [day('day-1', 0, [stop('s1', '플랜A', 0)])],
      [place('플랜A'), place('1km집', { lat: km(1) })],
    )

    const [candidate] = swapCandidates(trip, 's1')
    expect(candidate.meters).toBeGreaterThan(900)
    expect(candidate.meters).toBeLessThan(1_100)
  })

  it('이미 다른 일차에 있는 곳은 그 자리를 알린다 — 지우지 않는다, 판단은 사용자 몫', () => {
    const trip = bundle(
      [
        day('day-1', 0, [stop('s1', '플랜A', 0)]),
        day('day-3', 2, [stop('s9', '겹치는집', 0), stop('s10', '셋째집', 1)]),
      ],
      [place('플랜A'), place('겹치는집', { lat: km(1) }), place('셋째집', { lat: km(2) })],
    )

    const found = swapCandidates(trip, 's1')
    expect(found.map((item) => item.placedLabel)).toEqual([
      '3일차 1번째에 있어요',
      '3일차 2번째에 있어요',
    ])
  })

  it('같은 일차의 다른 자리에 있으면 그렇게 말한다', () => {
    const trip = bundle(
      [day('day-1', 0, [stop('s1', '플랜A', 0), stop('s2', '같은날집', 1)])],
      [place('플랜A'), place('같은날집', { lat: km(1) })],
    )

    expect(swapCandidates(trip, 's1')[0].placedLabel).toBe('이 날 2번째에 있어요')
  })

  it('아직 어디에도 안 넣은 곳은 라벨이 없다', () => {
    const trip = bundle(
      [day('day-1', 0, [stop('s1', '플랜A', 0)])],
      [place('플랜A'), place('보관함집', { lat: km(1) })],
    )

    expect(swapCandidates(trip, 's1')[0].placedLabel).toBeNull()
  })

  it('보관함에 다른 곳이 없으면 빈 목록이다 — 화면이 다음 행동을 안내한다', () => {
    const trip = bundle([day('day-1', 0, [stop('s1', '플랜A', 0)])], [place('플랜A')])

    expect(swapCandidates(trip, 's1')).toEqual([])
  })

  it('없는 자리를 물으면 빈 목록이다', () => {
    const trip = bundle([day('day-1', 0, [stop('s1', '플랜A', 0)])], [place('플랜A')])

    expect(swapCandidates(trip, '없는-stop')).toEqual([])
  })
})
