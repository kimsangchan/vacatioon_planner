// E-15 이동시간 프록시 (결정 #45). 일차의 방문들을 목록 순서대로 이어 구간별 시간·거리를 받는다.
//
// NCP Directions 15 를 쓴다 — 한 번 호출로 구간이 다 온다. 일차마다 한 번이면 충분하다.
// 지도·검색과 같은 네이버(NCP) 계정·키를 쓴다: 콘솔이 하나로 줄고 유류비까지 따라온다.
// Directions 5 가 아니라 15 인 이유는 경유지 상한이다 — 5 는 경유지 5개(총 7곳)에서 400 이 난다.
//
// 시크릿(`NCP_MAP_CLIENT_SECRET`)은 서버 전용이라 이 파일 경계 밖으로 나가지 않으며, 주소창이
// 아니라 헤더로만 실린다. 클라이언트 ID 는 지도 JS 가 브라우저에서 쓰는 값이라 공개여도 된다.
//
// 로그인하지 않은 요청은 업스트림을 부르기 전에 막는다 — 남의 요청으로 쿼터를 태울 이유가 없다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { problemResponse, requestInstance } from '@/lib/http/problem'

const DIRECTIONS_URL = 'https://maps.apigw.ntruss.com/map-direction-15/v1/driving'
// 실시간 최적 — 응답의 경로 배열 이름도 이 값과 같다
const OPTION = 'traoptimal'
const UPSTREAM_TIMEOUT_MS = 8000

/** 업스트림 경유지 상한(15)에 출발·도착을 더한 값. 하루에 이보다 많이 다니지는 않는다 */
export const MAX_POINTS = 17

export interface RoutePoint {
  lat: number
  lng: number
}

export interface RouteSection {
  durationSeconds: number
  distanceMeters: number
}

export interface DirectionsAnswer {
  sections: RouteSection[]
  /** 실제로 달리는 길의 좌표 — 지도에 선으로 그린다 (결정 #49). 직선으로 이으면 바다를 가로지른다 */
  path: RoutePoint[]
  total: {
    durationSeconds: number
    distanceMeters: number
    tollFare: number | null
    fuelPrice: number | null
  }
}

export interface DirectionsCredentials {
  clientId: string
  clientSecret: string
}

// 시크릿은 서버 전용 — 클라이언트 번들에 넣지 마라 (SPEC §스택·환경변수)
export function directionsCredentials(): DirectionsCredentials {
  const clientId = process.env.NEXT_PUBLIC_NCP_MAP_CLIENT_ID
  const clientSecret = process.env.NCP_MAP_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'NEXT_PUBLIC_NCP_MAP_CLIENT_ID·NCP_MAP_CLIENT_SECRET 이 필요해요 — .env 를 확인해 주세요',
    )
  }
  return { clientId, clientSecret }
}

interface Deps {
  supabase: SupabaseClient
  credentials?: DirectionsCredentials
  fetchUpstream?: typeof fetch
}

interface Leg {
  distance?: number
  duration?: number
}

interface Summary extends Leg {
  goal?: Leg
  waypoints?: Leg[]
  tollFare?: number
  fuelPrice?: number
}

function isPoint(value: unknown): value is RoutePoint {
  const point = value as RoutePoint | null
  return (
    point != null &&
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  )
}

// 업스트림은 "경도,위도" 순이다. 뒤집으면 엉뚱한 곳의 길을 받는다
const toPair = (point: RoutePoint) => `${point.lng},${point.lat}`

// 구간 시간은 밀리초로 온다 (총합도 마찬가지)
const toSeconds = (ms: number) => Math.round(ms / 1000)

function toAnswer(
  summary: Summary,
  path: [number, number][] | undefined,
  expectedSections: number,
): DirectionsAnswer | null {
  // 각 경유지까지가 한 구간이고 마지막 구간이 goal 이다 — 둘을 이어야 방문 수와 구간 수가 맞는다
  const legs = [...(summary.waypoints ?? []), ...(summary.goal ? [summary.goal] : [])]
  if (legs.length !== expectedSections) return null

  return {
    // 업스트림은 [경도, 위도] 순으로 준다 — 뒤집으면 지구 반대편에 선이 그려진다
    path: (path ?? []).map(([lng, lat]) => ({ lat, lng })),
    sections: legs.map((leg) => ({
      durationSeconds: toSeconds(leg.duration ?? 0),
      distanceMeters: leg.distance ?? 0,
    })),
    total: {
      durationSeconds: toSeconds(summary.duration ?? 0),
      distanceMeters: summary.distance ?? 0,
      tollFare: summary.tollFare ?? null,
      fuelPrice: summary.fuelPrice ?? null,
    },
  }
}

export async function handleDirections(request: Request, deps: Deps): Promise<Response> {
  const instance = requestInstance(request)
  const {
    data: { user },
  } = await deps.supabase.auth.getUser()

  if (!user) {
    return problemResponse({
      type: 'auth/required',
      title: '로그인이 필요해요',
      status: 401,
      detail: '로그인하고 다시 열어 주세요.',
      instance,
    })
  }

  const payload = (await request.json().catch(() => null)) as { points?: unknown } | null
  const points = Array.isArray(payload?.points) ? payload.points.filter(isPoint) : []

  if (points.length < 2) {
    return problemResponse({
      type: 'validation/route-too-short',
      title: '이을 곳이 모자라요',
      status: 400,
      detail: '한 일차에 두 곳 이상 담아야 이동시간을 알려드릴 수 있어요.',
      instance,
    })
  }
  if (points.length > MAX_POINTS) {
    return problemResponse({
      type: 'validation/route-too-long',
      title: '한 번에 이을 수 있는 곳을 넘었어요',
      status: 400,
      detail: `한 일차에 ${MAX_POINTS}곳까지 이어 드릴 수 있어요.`,
      instance,
    })
  }

  const credentials = deps.credentials ?? directionsCredentials()
  const fetchUpstream = deps.fetchUpstream ?? fetch
  const between = points.slice(1, -1)
  // `,` 와 `|` 는 인코딩하지 않는다 — 실호출로 확인한 형식이다.
  // 경유지가 없을 때 빈 `waypoints=` 를 붙이면 400 이 난다
  const query = [
    `start=${toPair(points[0])}`,
    `goal=${toPair(points[points.length - 1])}`,
    ...(between.length > 0 ? [`waypoints=${between.map(toPair).join('|')}`] : []),
    `option=${OPTION}`,
  ].join('&')

  let answer: DirectionsAnswer | null = null
  try {
    const response = await fetchUpstream(`${DIRECTIONS_URL}?${query}`, {
      headers: {
        'x-ncp-apigw-api-key-id': credentials.clientId,
        'x-ncp-apigw-api-key': credentials.clientSecret,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    if (response.ok) {
      const body = (await response.json()) as {
        code?: number
        route?: Record<string, { summary?: Summary; path?: [number, number][] }[]>
      }
      const leg = body.code === 0 ? body.route?.[OPTION]?.[0] : undefined
      if (leg?.summary) answer = toAnswer(leg.summary, leg.path, points.length - 1)
    } else {
      // 본문은 로그에도 남기지 않는다 — 상태 코드로 충분하다
      console.error(`[directions] 업스트림 ${response.status}`)
    }
  } catch {
    console.error('[directions] 업스트림에 닿지 못함')
  }

  if (!answer) {
    return problemResponse({
      type: 'route/unavailable',
      title: '이동시간을 받아오지 못했어요',
      status: 502,
      detail: '길찾기 서버에 닿지 못했어요. 순서는 그대로 두고 잠시 뒤에 다시 열어 주세요.',
      instance,
    })
  }

  return Response.json(answer)
}
