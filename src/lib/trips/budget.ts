// 여행 경비 집계 (결정 #39). 화면에 두 줄로 나가는 두 숫자를 여기서만 만든다.
//
// 확정 = 실제로 적힌 지출(Stop·Leg 의 cost_amount). "이미 쓴 돈"이다.
// 예상 포함 = 확정 + 금액을 아직 안 적은 방문을 그 장소의 예상 단가로 채운 값.
// 둘을 한 숫자로 합치지 않는 이유: 합치는 순간 화면에서 확정분을 되찾을 수 없고,
// 그걸 구분하는 것이 이 기능의 존재 이유다.
//
// 규칙 셋:
//   ① 실제가 적혀 있으면 예상은 쓰지 않는다 — 0원도 "적은 것"이다(미입력 null 과 다르다).
//   ② Leg(이동)에는 예상이 없다. 예매가는 추정하는 값이 아니다.
//   ③ 보관함(미배치)은 총액에 안 들어간다 — 갈지 안 갈지 모르는 후보다(storageEstimate 로 따로).
//
// 원 단위 정수만 더한다 — 나눗셈·환산이 없으니 부동소수점이 낄 자리가 없다 (#17).

import type { DayRow, PlaceRow } from './bundle'

export interface TripBudget {
  /** 실제로 적힌 지출의 합 */
  confirmed: number
  /** 확정 + 미입력 방문을 장소 예상 단가로 채운 합 */
  withEstimate: number
  /** 둘 다 0이고 근거도 없으면 화면에 줄을 내지 않는다 */
  hasAny: boolean
}

export function tripBudget(days: DayRow[], places: PlaceRow[]): TripBudget {
  const estimateOf = new Map(places.map((place) => [place.id, place.estimated_cost]))
  let confirmed = 0
  let estimated = 0
  let hasAny = false

  for (const day of days) {
    for (const stop of day.stops) {
      if (stop.cost_amount !== null) {
        confirmed += stop.cost_amount
        hasAny = true
        continue
      }
      // 지운 장소를 가리키는 방문은 근거가 없다 — 예상도 없다
      const estimate = estimateOf.get(stop.place_id) ?? null
      if (estimate !== null) {
        estimated += estimate
        hasAny = true
      }
    }
    for (const leg of day.legs) {
      if (leg.cost_amount === null) continue
      confirmed += leg.cost_amount
      hasAny = true
    }
  }

  return { confirmed, withEstimate: confirmed + estimated, hasAny }
}

export interface StorageEstimate {
  /** 예상 단가를 적어 둔 후보 수 */
  count: number
  total: number
  hasAny: boolean
}

export function storageEstimate(unassigned: PlaceRow[]): StorageEstimate {
  let count = 0
  let total = 0

  for (const place of unassigned) {
    if (place.estimated_cost === null) continue
    count += 1
    total += place.estimated_cost
  }

  return { count, total, hasAny: count > 0 }
}
