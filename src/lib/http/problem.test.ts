// RFC 9457 Problem JSON 직렬화 (05 §규약 — 스택트레이스·내부 원문 노출 금지).

import { describe, expect, it } from 'vitest'
import { PROBLEM_CONTENT_TYPE, problemBody, problemResponse, requestInstance } from './problem'

const INPUT = {
  type: 'search/quota-exceeded',
  title: '오늘 검색을 다 썼어요',
  status: 429,
  detail: '내일 다시 검색할 수 있어요.',
  instance: '/api/place-search?q=성산일출봉',
}

describe('problemBody', () => {
  it('serializes exactly the five RFC 9457 members', () => {
    expect(problemBody(INPUT)).toEqual(INPUT)
    expect(Object.keys(problemBody(INPUT)).sort()).toEqual([
      'detail',
      'instance',
      'status',
      'title',
      'type',
    ])
  })

  it('carries extension members such as cached[] alongside the core members', () => {
    const body = problemBody({ ...INPUT, extensions: { cached: [{ name: '성산일출봉' }] } })

    expect(body.cached).toEqual([{ name: '성산일출봉' }])
    expect(body.status).toBe(429)
  })

  it('never lets an extension overwrite a core member (내부 값 유출 방지)', () => {
    const body = problemBody({
      ...INPUT,
      extensions: { status: 200, detail: 'at Object.<anonymous> (/app/route.ts:12:7)' },
    })

    expect(body.status).toBe(429)
    expect(body.detail).toBe(INPUT.detail)
  })
})

describe('problemResponse', () => {
  it('uses the problem media type and the declared status', async () => {
    const response = problemResponse(INPUT)

    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE)
    expect(await response.json()).toEqual(INPUT)
  })
})

describe('requestInstance', () => {
  it('points at the failing occurrence — path with query, no origin', () => {
    const request = new Request('http://localhost:3000/api/place-search?q=%EC%A0%9C%EC%A3%BC')

    expect(requestInstance(request)).toBe('/api/place-search?q=%EC%A0%9C%EC%A3%BC')
  })

  it('omits the query part when there is none', () => {
    expect(requestInstance(new Request('http://localhost:3000/api/place-search'))).toBe(
      '/api/place-search',
    )
  })
})
