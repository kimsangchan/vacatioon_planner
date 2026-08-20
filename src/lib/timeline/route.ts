// 일차 안에서 "이동시간을 물어볼 구간"을 고른다 (결정 #45).
//
// 목록 순서가 곧 이동 순서다 (#15 — 순서의 진실은 통합 position). 그래서 순서를 바꾸면
// 구간도 바뀌고, 답도 다시 받아야 한다.
//
// 사이에 사용자가 적어 둔 이동(Leg)이 있으면 그 구간은 묻지 않는다 — 예매한 기차가 있는데
// 자동차 추정치를 끼워 넣으면 화면이 두 말을 한다. 기록이 추정보다 세다(#39 의 예상 vs 실제와 같은 원칙).

import type { DayItem } from './merge'

export interface RouteSegment {
  fromStopId: string
  toStopId: string
}

export function routeSegments(items: DayItem[]): RouteSegment[] {
  const segments: RouteSegment[] = []
  // 미확정 방문은 아예 없는 셈 치고 앞뒤를 잇는다 (#47) — 갈지 모르는 곳의 시간을 끼우면
  // 하루가 실제보다 길어 보인다. 사이의 이동(Leg)은 그대로 남으므로 구간을 끊는 규칙도 산다
  const planned = items.filter((item) => item.kind !== 'stop' || item.confirmed !== false)

  for (let i = 0; i < planned.length - 1; i += 1) {
    const from = planned[i]
    const to = planned[i + 1]
    if (from.kind !== 'stop' || to.kind !== 'stop') continue
    segments.push({ fromStopId: from.id, toStopId: to.id })
  }

  return segments
}
