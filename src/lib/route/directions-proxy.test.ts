/** @vitest-environment node */
// E-15 이동시간 프록시 (결정 #45). 시크릿은 서버 전용이라 이 경계 밖으로 나가지 않는다.
//
// 픽스처는 2026-08-20 NCP Directions 15 실호출 응답에서 뜬 모양이다 —
// 구간 시간은 `summary.waypoints[]`(각 경유지까지의 구간) + `summary.goal`(마지막 구간)이고
// 단위는 **밀리초**다. 합이 `summary.duration` 과 일치한다.

import { describe, expect, it, vi } from 'vitest'
import { handleDirections, MAX_POINTS } from './directions-proxy'

function request(body: unknown): Request {
  return new Request('http://localhost:3010/api/directions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const authed = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }
const anon = { auth: { getUser: async () => ({ data: { user: null } }) } }

const CREDENTIALS = { clientId: 'ID', clientSecret: 'SECRET' }

const TWO = { points: [{ lat: 35.1151, lng: 129.0403 }, { lat: 35.2059, lng: 129.0756 }] }

function upstream(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

// 3,240,000ms = 3240초 · 2,403,000ms = 2403초 → 합 5,643,000ms
const OK_PAYLOAD = {
  code: 0,
  message: '길찾기를 성공하였습니다.',
  route: {
    traoptimal: [
      {
        path: [
          [129.0403, 35.1151],
          [129.15, 35.2],
          [129.0756, 35.2059],
        ],
        summary: {
          start: { location: [129.0403, 35.1151] },
          goal: { location: [129.0756, 35.2059], distance: 17969, duration: 2403000 },
          waypoints: [{ location: [129.2223, 35.2445], distance: 28073, duration: 3240000 }],
          distance: 46042,
          duration: 5643000,
          tollFare: 1200,
          taxiFare: 42400,
          fuelPrice: 6100,
        },
      },
    ],
  },
}

describe('handleDirections — 인증과 입력 (결정 #45)', () => {
  it('로그인하지 않았으면 401 로 막는다 — 키를 태울 이유가 없다', async () => {
    const fetchUpstream = upstream(OK_PAYLOAD)
    const response = await handleDirections(request(TWO), {
      supabase: anon as never,
      credentials: CREDENTIALS,
      fetchUpstream,
    })

    expect(response.status).toBe(401)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it('두 곳이 안 되면 이을 구간이 없다 — 400', async () => {
    const fetchUpstream = upstream(OK_PAYLOAD)
    const response = await handleDirections(request({ points: [{ lat: 35, lng: 129 }] }), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream,
    })

    expect(response.status).toBe(400)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it('너무 많으면 거절한다 — 업스트림 상한을 넘겨 통째로 실패하지 않게', async () => {
    const many = { points: Array.from({ length: MAX_POINTS + 1 }, () => ({ lat: 35, lng: 129 })) }
    const fetchUpstream = upstream(OK_PAYLOAD)
    const response = await handleDirections(request(many), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream,
    })

    expect(response.status).toBe(400)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it('상한은 경유지 15 + 출발 + 도착이다 — Directions 15 의 실제 한계', () => {
    expect(MAX_POINTS).toBe(17)
  })
})

describe('handleDirections — 구간별 답 (결정 #45)', () => {
  const three = {
    points: [
      { lat: 35.1151, lng: 129.0403 },
      { lat: 35.2445, lng: 129.2223 },
      { lat: 35.2059, lng: 129.0756 },
    ],
  }

  it('구간마다 시간과 거리를 돌려준다 — 밀리초를 초로 바꿔서', async () => {
    const response = await handleDirections(request(three), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream: upstream(OK_PAYLOAD),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      sections: [
        { durationSeconds: 3240, distanceMeters: 28073 },
        { durationSeconds: 2403, distanceMeters: 17969 },
      ],
      total: { durationSeconds: 5643, distanceMeters: 46042, tollFare: 1200, fuelPrice: 6100 },
      // 업스트림의 [경도, 위도] 를 뒤집어 담는다 — 그대로 두면 지구 반대편에 선이 그려진다
      path: [
        { lat: 35.1151, lng: 129.0403 },
        { lat: 35.2, lng: 129.15 },
        { lat: 35.2059, lng: 129.0756 },
      ],
    })
  })

  it('마지막 구간은 goal 이다 — waypoints 뒤에 붙여야 방문 수와 구간 수가 맞는다', async () => {
    const response = await handleDirections(request(three), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream: upstream(OK_PAYLOAD),
    })
    const answer = (await response.json()) as { sections: unknown[] }

    expect(answer.sections).toHaveLength(three.points.length - 1)
  })

  it('좌표는 경도,위도 순으로 넘긴다 — 뒤집으면 엉뚱한 곳의 길을 받는다', async () => {
    const fetchUpstream = upstream(OK_PAYLOAD)
    await handleDirections(request(three), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream,
    })

    const url = String(fetchUpstream.mock.calls[0][0])
    expect(url).toContain('start=129.0403,35.1151')
    expect(url).toContain('goal=129.0756,35.2059')
    expect(url).toContain('waypoints=129.2223,35.2445')
  })

  it('경유지가 없으면 waypoints 를 아예 안 붙인다 — 빈 값은 400 을 부른다', async () => {
    const fetchUpstream = upstream(OK_PAYLOAD)
    await handleDirections(request(TWO), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream,
    })

    expect(String(fetchUpstream.mock.calls[0][0])).not.toContain('waypoints=')
  })

  it('시크릿은 헤더로만 간다 — 주소창에 실리면 로그에 남는다', async () => {
    const fetchUpstream = upstream(OK_PAYLOAD)
    await handleDirections(request(TWO), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream,
    })

    const [url, init] = fetchUpstream.mock.calls[0]
    expect(String(url)).not.toContain('SECRET')
    expect((init as RequestInit).headers).toMatchObject({
      'x-ncp-apigw-api-key-id': 'ID',
      'x-ncp-apigw-api-key': 'SECRET',
    })
  })

  it('업스트림이 길을 못 찾으면 502 로 알린다 — 화면은 추정치를 감춘다', async () => {
    const response = await handleDirections(request(TWO), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream: upstream({ code: 2, message: '경로를 찾을 수 없습니다.', route: {} }),
    })

    expect(response.status).toBe(502)
  })

  it('업스트림이 비정상 상태면 502 로 수렴한다', async () => {
    const response = await handleDirections(request(TWO), {
      supabase: authed as never,
      credentials: CREDENTIALS,
      fetchUpstream: upstream({ error: { errorCode: 400 } }, 400),
    })

    expect(response.status).toBe(502)
  })
})
