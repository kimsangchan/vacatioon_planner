// 두 WGS84 좌표 사이의 직선 거리 (하버사인). 교체 후보를 "이 부근" 순으로 세우는 데 쓴다.
//
// 외부 API 를 부르지 않는 이유: 후보 목록은 **누르는 순간** 나와야 한다 (현장 3초).
// 길찾기 거리(도로 기준)가 아니라 직선이지만, 후보를 **줄 세우는** 데는 충분하다 —
// 순위가 뒤집힐 만큼의 차이는 이 규모(같은 동네)에서 드물다.

import type { LatLng } from '@/lib/map/provider'

const EARTH_RADIUS_M = 6_371_000

const toRad = (degrees: number) => (degrees * Math.PI) / 180

/** 미터 단위 정수 — 표기(`formatDistance`)가 소수를 다시 만들지 않게 여기서 잘라 준다 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))))
}
