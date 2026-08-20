'use client'

// 일차의 이동시간을 받아 둔다 (결정 #45). React Query 를 쓰지 않는 이유: 이 훅은 리스트 안쪽
// 깊은 곳(TimelinePane)에서 쓰이는데, 거기에 Provider 를 요구하면 그 컴포넌트를 단독으로
// 렌더하던 테스트가 전부 Provider 를 끌고 와야 한다. 여기서 필요한 건 "좌표가 바뀌면 다시 묻기"뿐이다.
//
// 좌표 목록이 키다 — 순서를 바꾸면 키가 바뀌고 답도 새로 받는다 (#15 — 순서가 곧 이동 순서).

import { useEffect, useState } from 'react'
import type { RoutePoint, RouteSection } from './directions-proxy'

export interface DayRoute {
  sections: RouteSection[]
  /** 지도에 그릴 실제 길 좌표 (결정 #49) */
  path: RoutePoint[]
  total: {
    durationSeconds: number
    distanceMeters: number
    tollFare: number | null
    fuelPrice: number | null
  }
}

export function useDayRoute(points: RoutePoint[]): DayRoute | null {
  // 받아 둔 답이 '어느 좌표 목록의 답인지'를 함께 들고 있는다 — 순서를 바꾼 직후
  // 옛 시간이 잠깐 비치지 않고, effect 안에서 상태를 직접 비울 일도 없어진다
  const [answer, setAnswer] = useState<{ key: string; route: DayRoute } | null>(null)
  // 좌표를 문자열로 굳혀 의존성으로 쓴다 — 배열은 렌더마다 새 참조라 그대로 두면 무한히 다시 묻는다
  const key = points.map((point) => `${point.lat},${point.lng}`).join('|')

  useEffect(() => {
    const coords =
      key === ''
        ? []
        : key.split('|').map((pair) => {
            const [lat, lng] = pair.split(',').map(Number)
            return { lat, lng }
          })
    if (coords.length < 2) return

    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/directions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ points: coords }),
          signal: controller.signal,
        })
        // 502·401 은 화면에서 조용히 넘어간다 — 이동시간은 곁들이는 정보이지 여정의 전제가 아니다
        if (!response.ok) return
        setAnswer({ key, route: (await response.json()) as DayRoute })
      } catch {
        // 취소·네트워크 실패도 마찬가지다
      }
    })()

    return () => controller.abort()
  }, [key])

  return answer && answer.key === key ? answer.route : null
}
