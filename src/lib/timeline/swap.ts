// E-07 교체 — "이 자리에 대신 갈 곳" (결정 #53).
//
// 후보를 미리 등록하는 자리를 만들지 않는다. **보관함에 담은 것이 곧 후보군**이다 (#8 수집≠배치) —
// 자리마다 후보를 다는 준비 노동을 요구하면 여행 준비가 데이터 입력이 되고, 그러면 아무도 안 쓴다.
// "이 부근"은 좌표로 계산되는 것이지 사람이 미리 분류해 둘 일이 아니다.
//
// 교체의 실체는 `stops.place_id` 한 칸이다 — 플랜 A 는 자리를 잃고 보관함으로 돌아가므로
// "후보군 관리"라는 상태 자체가 필요 없다.

import { distanceMeters } from '@/lib/geo/distance'
import type { DayRow, PlaceRow } from '@/lib/trips/bundle'

/** 후보를 세우는 데 필요한 것은 이 둘뿐이다 — `TripBundle` 도 그대로 들어맞는다 */
export interface SwapSource {
  days: DayRow[]
  places: PlaceRow[]
}

export interface SwapCandidate {
  place: PlaceRow
  /** 지금 그 자리에서의 직선 거리(미터). 표기는 화면이 `formatDistance` 로 정한다 */
  meters: number
  /** 별 합계 (결정 #46) — 동행자 의견이 순위의 2차 기준이다 */
  stars: number
  /** 이미 배치돼 있으면 그 자리를 알린다. 지우지 않는다 — 두 번 가는 것은 #21 이 허용한다 */
  placedLabel: string | null
}

/** 배치 위치 — 핀 번호(#49)와 같은 규칙으로 센다: 일차 순 → 자리 순, 먼저 만나는 곳이 이긴다 */
function placedAt(days: DayRow[]): Map<string, { day: DayRow; order: number }> {
  const placed = new Map<string, { day: DayRow; order: number }>()
  for (const day of [...days].sort((a, b) => a.position - b.position)) {
    const stops = [...(day.stops ?? [])].sort((a, b) => a.position - b.position)
    stops.forEach((stop, index) => {
      if (!placed.has(stop.place_id)) placed.set(stop.place_id, { day, order: index + 1 })
    })
  }
  return placed
}

const starsOf = (place: PlaceRow) =>
  (place.place_votes ?? []).reduce((sum, vote) => sum + vote.stars, 0)

export function swapCandidates(source: SwapSource, stopId: string): SwapCandidate[] {
  const days = source.days ?? []
  const here = days
    .flatMap((day) => (day.stops ?? []).map((stop) => ({ day, stop })))
    .find((item) => item.stop.id === stopId)
  if (!here) return []

  const from = source.places.find((place) => place.id === here.stop.place_id)
  if (!from) return []

  const placed = placedAt(days)
  const origin = { lat: Number(from.lat), lng: Number(from.lng) }

  return source.places
    .filter((place) => place.id !== from.id)
    .map((place) => {
      const at = placed.get(place.id)
      return {
        place,
        meters: distanceMeters(origin, { lat: Number(place.lat), lng: Number(place.lng) }),
        stars: starsOf(place),
        placedLabel: at
          ? `${at.day.id === here.day.id ? '이 날' : `${at.day.position + 1}일차`} ${at.order}번째에 있어요`
          : null,
      }
    })
    .sort((a, b) => {
      // 점심 자리에 300m 카페가 800m 밥집보다 위로 오면 안 된다 — 카테고리가 첫 기준이다
      const sameA = a.place.category === from.category ? 0 : 1
      const sameB = b.place.category === from.category ? 0 : 1
      if (sameA !== sameB) return sameA - sameB
      if (a.meters !== b.meters) return a.meters - b.meters
      if (a.stars !== b.stars) return b.stars - a.stars
      // 동률에서 순서가 흔들리면 "아까 위에 있던 게 어디 갔지"가 된다
      return a.place.name.localeCompare(b.place.name, 'ko')
    })
}
