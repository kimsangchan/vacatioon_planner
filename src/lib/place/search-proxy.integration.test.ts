// E-03 프록시 상태 4종 (docs/design/06 FR-003 엣지·SC-008·계약 테스트) — 로컬 Supabase 대상.
// 업스트림은 전부 목킹한다: 무료 쿼터 보호를 위해 테스트에서 네이버 실호출은 금지 (tasks.md T5).

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  anonClient,
  clearApiUsage,
  seedApiUsage,
  signInWithOtpCode,
  uniqueTestEmail,
} from '@/test-support/supabase-local'
import {
  DAILY_SEARCH_QUOTA,
  handlePlaceSearch,
  normalizeSearchQuery,
  searchQueryHash,
  SEARCH_USAGE_COUNTER,
  type NaverLocalItem,
} from './search-proxy'

const CREDENTIALS = { clientId: 'test-key-id', clientSecret: 'test-key-secret' }

// 실측 형식 = WGS84 × 10^7 정수 (decision-log #20)
const ITEMS: NaverLocalItem[] = [
  {
    title: '<b>성산</b>일출봉',
    link: 'https://map.naver.com/p/1',
    category: '여행,명소',
    description: '',
    telephone: '',
    address: '제주특별자치도 서귀포시 성산읍',
    roadAddress: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
    mapx: '1269425000',
    mapy: '334580000',
  },
  {
    title: '성산 <b>카페</b>',
    link: '',
    category: '음식점>카페',
    description: '',
    telephone: '',
    address: '제주특별자치도 서귀포시 성산읍',
    roadAddress: '제주특별자치도 서귀포시 성산읍 일출로 100',
    mapx: '1269400000',
    mapy: '334500000',
  },
]

function upstreamOk(items: NaverLocalItem[] = ITEMS): Response {
  return Response.json({ lastBuildDate: '', total: items.length, start: 1, display: 5, items })
}

function searchRequest(q: string): Request {
  return new Request(`http://localhost:3000/api/place-search?q=${encodeURIComponent(q)}`)
}

// 캐시는 5분 살아 있으므로 테스트마다 새 검색어를 쓴다 (연속 실행 시 서로 간섭 금지)
function freshQuery(label: string): string {
  return `${label} ${crypto.randomUUID().slice(0, 8)}`
}

describe('E-03 GET /api/place-search', () => {
  let supabase: SupabaseClient

  beforeAll(async () => {
    supabase = await signInWithOtpCode(uniqueTestEmail('search'))
  }, 30_000)

  afterEach(() => {
    clearApiUsage(SEARCH_USAGE_COUNTER)
  })

  it('normalizes the upstream answer and serves the second call from cache', async () => {
    const q = freshQuery('성산일출봉')
    const fetchUpstream = vi.fn<typeof fetch>(async () => upstreamOk())

    const first = await handlePlaceSearch(searchRequest(q), {
      supabase,
      fetchUpstream,
      credentials: CREDENTIALS,
    })

    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toContain('application/json')

    const places = await first.json()
    expect(places).toEqual([
      {
        name: '성산일출봉',
        address: '제주특별자치도 서귀포시 성산읍',
        roadAddress: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
        lat: 33.458,
        lng: 126.9425,
        categoryHint: 'spot',
        providerLink: 'https://map.naver.com/p/1',
        provider: 'naver',
      },
      {
        name: '성산 카페',
        address: '제주특별자치도 서귀포시 성산읍',
        roadAddress: '제주특별자치도 서귀포시 성산읍 일출로 100',
        lat: 33.45,
        lng: 126.94,
        categoryHint: 'restaurant',
        providerLink: null,
        provider: 'naver',
      },
    ])

    // 업스트림 절차 그대로인지 (SPEC §알고리즘 4 · decision-log #20)
    expect(fetchUpstream).toHaveBeenCalledTimes(1)
    const [url, init] = fetchUpstream.mock.calls[0]
    expect(String(url)).toBe(
      `https://naverapihub.apigw.ntruss.com/search/v1/local?query=${encodeURIComponent(
        normalizeSearchQuery(q),
      )}&display=5`,
    )
    const headers = new Headers(init?.headers)
    expect(headers.get('X-NCP-APIGW-API-KEY-ID')).toBe(CREDENTIALS.clientId)
    expect(headers.get('X-NCP-APIGW-API-KEY')).toBe(CREDENTIALS.clientSecret)

    // 2회째는 캐시 히트 — 업스트림도, 쿼터도 더 쓰지 않는다
    const second = await handlePlaceSearch(searchRequest(q), {
      supabase,
      fetchUpstream,
      credentials: CREDENTIALS,
    })

    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(places)
    expect(fetchUpstream).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('refuses a query shorter than 2 characters before touching the quota', async () => {
    const fetchUpstream = vi.fn<typeof fetch>(async () => upstreamOk())

    const response = await handlePlaceSearch(searchRequest(' 제 '), {
      supabase,
      fetchUpstream,
      credentials: CREDENTIALS,
    })

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({
      type: 'validation/query-too-short',
      status: 400,
      instance: expect.stringContaining('/api/place-search'),
    })
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it('blocks the search once the daily counter passes the quota (SC-008)', async () => {
    const fetchUpstream = vi.fn<typeof fetch>(async () => upstreamOk())
    seedApiUsage(SEARCH_USAGE_COUNTER, DAILY_SEARCH_QUOTA)

    const response = await handlePlaceSearch(searchRequest(freshQuery('쿼터')), {
      supabase,
      fetchUpstream,
      credentials: CREDENTIALS,
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toBe('application/problem+json')

    const problem = await response.json()
    expect(problem).toMatchObject({ type: 'search/quota-exceeded', status: 429 })
    expect(problem.title).toBeTruthy()
    expect(problem.detail).toBeTruthy()
    expect(fetchUpstream).not.toHaveBeenCalled()
  }, 20_000)

  it('answers 502 with the last cache attached when upstream fails', async () => {
    const q = freshQuery('업스트림 장애')
    const cached = [
      {
        name: '직전 캐시 장소',
        address: '제주특별자치도',
        roadAddress: '제주특별자치도',
        lat: 33.5,
        lng: 126.5,
        categoryHint: 'spot',
        providerLink: null,
        provider: 'naver',
      },
    ]

    // 5분 지난 캐시는 get_cached_search 가 걸러내므로, 502 경로에서 캐시가 존재하는 상황
    // (= 다른 요청이 방금 캐시를 채웠고 이 요청만 업스트림에서 실패)을 그대로 만든다.
    const fetchUpstream = vi.fn<typeof fetch>(async () => {
      const qhash = await searchQueryHash(normalizeSearchQuery(q))
      await supabase.rpc('store_search_cache', { qhash, response: cached })
      return new Response('upstream boom: apigw trace 0x91', { status: 500 })
    })

    const response = await handlePlaceSearch(searchRequest(q), {
      supabase,
      fetchUpstream,
      credentials: CREDENTIALS,
    })

    expect(response.status).toBe(502)
    expect(response.headers.get('content-type')).toBe('application/problem+json')

    const problem = await response.json()
    expect(problem).toMatchObject({ type: 'search/upstream-error', status: 502 })
    expect(problem.cached).toEqual(cached)
    // 업스트림 원문·스택은 절대 새어 나가지 않는다 (05 §규약)
    expect(JSON.stringify(problem)).not.toContain('apigw trace')
    expect(JSON.stringify(problem)).not.toContain('boom')
    expect(problem.stack).toBeUndefined()
  }, 20_000)

  it('rejects an unauthenticated caller with 401 before any upstream call', async () => {
    const fetchUpstream = vi.fn<typeof fetch>(async () => upstreamOk())

    const response = await handlePlaceSearch(searchRequest(freshQuery('미인증')), {
      supabase: anonClient(),
      fetchUpstream,
      credentials: CREDENTIALS,
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({ type: 'auth/required', status: 401 })
    expect(fetchUpstream).not.toHaveBeenCalled()
  }, 20_000)
})
