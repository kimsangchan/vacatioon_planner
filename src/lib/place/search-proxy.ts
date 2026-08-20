// E-03 장소 검색 프록시의 본체 (SPEC §알고리즘 4 — 절차에 구현자 재량 없음).
// Route Handler(src/app/api/place-search/route.ts)는 이 함수에 요청과 의존성만 넘긴다.
// 의존성을 주입받는 이유: 로그인 세션·업스트림 목킹으로 절차 전체를 테스트하기 위해서다.
//
//   인증(401) → q 정규화·2자 미만(400) → 캐시 히트면 즉시 반환
//   → record_search_usage 가 12,500 초과면 429 → 업스트림 호출 → 태그 제거·좌표 변환·카테고리 힌트
//   → store_search_cache → NormalizedPlace[] ≤5건. 업스트림 실패면 502 + 직전 캐시 cached[]

import type { SupabaseClient } from '@supabase/supabase-js'
import { toWgs84 } from '@/lib/geo/naver-coords'
import { problemResponse, requestInstance } from '@/lib/http/problem'
import { categoryHint, type PlaceCategory } from './category'

// base URL·display 는 T0-4 실호출로 확정된 값 (decision-log #20)
export const NAVER_LOCAL_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local'
export const SEARCH_DISPLAY = 5
// 무료 제공량(일 25,000)의 50% — 과금 방어선 (decision-log #19). 바꾸면 05·07 도 함께 (CLAUDE.md)
export const DAILY_SEARCH_QUOTA = 12_500
export const SEARCH_USAGE_COUNTER = 'naver_search'
export const MIN_QUERY_LENGTH = 2
const UPSTREAM_TIMEOUT_MS = 5_000

export interface NaverLocalItem {
  title: string
  link: string
  category: string
  description: string
  telephone: string
  address: string
  roadAddress: string
  mapx: string
  mapy: string
}

// 05 §OpenAPI 스케치의 응답 스키마 그대로
export interface NormalizedPlace {
  name: string
  address: string
  roadAddress: string
  /** 네이버가 주는 값. 영업시간은 어느 공개 API 도 주지 않아 담지 않는다 (01-recon) */
  phone: string
  lat: number
  lng: number
  categoryHint: PlaceCategory
  providerLink: string | null
  provider: 'naver'
}

export interface NaverSearchCredentials {
  clientId: string
  clientSecret: string
}

export interface PlaceSearchDeps {
  supabase: SupabaseClient
  fetchUpstream?: typeof fetch
  credentials?: NaverSearchCredentials
}

// ── 순수 부분 ────────────────────────────────────────────────────────────────

// 캐시 키의 기준 — 공백·대소문자 차이로 같은 검색을 두 번 사지 않는다
export function normalizeSearchQuery(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// query_hash CHECK(char_length >= 32) 를 만족하는 SHA-256 hex (0001_schema.sql)
export async function searchQueryHash(query: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
}

// 네이버 title 에는 검색어 강조용 <b> 태그와 엔티티가 섞여 온다 (CLAUDE.md 함정)
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .trim()
}

export interface NormalizedPlaces {
  places: NormalizedPlace[]
  skipped: number // 좌표 변환 실패로 제외한 건수 — 로그 계측용
}

export function toNormalizedPlaces(items: NaverLocalItem[]): NormalizedPlaces {
  const places: NormalizedPlace[] = []
  let skipped = 0

  for (const item of items) {
    let coords
    try {
      coords = toWgs84(item.mapx, item.mapy)
    } catch {
      // CoordsOutOfRangeError — 지도에 잘못 찍히느니 결과에서 빼고 건수만 센다
      skipped += 1
      continue
    }

    places.push({
      name: stripHtml(item.title ?? ''),
      address: item.address ?? '',
      roadAddress: item.roadAddress ?? '',
      phone: item.telephone ?? '',
      lat: coords.lat,
      lng: coords.lng,
      categoryHint: categoryHint(item.category),
      providerLink: item.link ? item.link : null,
      provider: 'naver',
    })
  }

  return { places: places.slice(0, SEARCH_DISPLAY), skipped }
}

// 서버 전용 키 — NEXT_PUBLIC_ 접두사 금지 (SPEC §스택·환경변수)
export function naverSearchCredentials(): NaverSearchCredentials {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error(
      'NAVER_SEARCH_CLIENT_ID·NAVER_SEARCH_CLIENT_SECRET 가 필요해요 — .env.local 을 확인해 주세요 (tasks.md T0)',
    )
  }

  return { clientId, clientSecret }
}

// ── 절차 ─────────────────────────────────────────────────────────────────────

export async function handlePlaceSearch(
  request: Request,
  deps: PlaceSearchDeps,
): Promise<Response> {
  const { supabase } = deps
  const instance = requestInstance(request)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return problemResponse({
      type: 'auth/required',
      title: '로그인이 필요해요',
      status: 401,
      detail: '로그인하고 다시 검색해 주세요.',
      instance,
    })
  }

  const query = normalizeSearchQuery(new URL(request.url).searchParams.get('q'))
  if (query.length < MIN_QUERY_LENGTH) {
    return problemResponse({
      type: 'validation/query-too-short',
      title: '검색어가 너무 짧아요',
      status: 400,
      detail: '두 글자 이상 입력해 주세요.',
      instance,
    })
  }

  const qhash = await searchQueryHash(query)

  const hit = await readCache(supabase, qhash)
  // **배열일 때만** 내보낸다. `if (hit)` 로 두면 배열이 아닌 값이 그대로 응답이 되고,
  // 클라이언트는 200 을 받아 놓고 places.slice 에서 터진다("검색 서버에 닿지 못했어요").
  // 운영에서 200 + body null 로 실제로 겪었다 — 캐시 조회가 무엇을 돌려주든 여기서 막는다.
  if (Array.isArray(hit)) return Response.json(hit)

  // 설정 오류로 쿼터를 태우지 않도록 카운터 증가 전에 키를 확인한다
  let credentials: NaverSearchCredentials
  try {
    credentials = deps.credentials ?? naverSearchCredentials()
  } catch (error) {
    console.error('[place-search] 검색 키 설정 누락', (error as Error).message)
    return unavailable(instance)
  }

  const { data: used, error: usageError } = await supabase.rpc('record_search_usage', {
    kind: SEARCH_USAGE_COUNTER,
  })
  if (usageError) {
    console.error('[place-search] 사용량 기록 실패', usageError.message)
    return unavailable(instance)
  }
  if (typeof used === 'number' && used > DAILY_SEARCH_QUOTA) {
    return problemResponse({
      type: 'search/quota-exceeded',
      title: '오늘 검색을 다 썼어요',
      status: 429,
      detail: '내일 다시 검색할 수 있어요. 지도에서 길게 눌러 직접 등록해 보세요.',
      instance,
    })
  }

  const items = await fetchLocalSearch(query, credentials, deps.fetchUpstream ?? fetch)
  if (!items) return upstreamProblem(instance, supabase, qhash)

  const { places, skipped } = toNormalizedPlaces(items)
  if (skipped > 0) {
    // 어떤 항목이었는지는 남기지 않는다 — 건수만 (05 §규약)
    console.warn(`[place-search] 좌표 변환 실패로 ${skipped}건 제외`)
  }

  const { error: cacheError } = await supabase.rpc('store_search_cache', {
    qhash,
    response: places,
  })
  if (cacheError) console.error('[place-search] 캐시 저장 실패', cacheError.message)

  return Response.json(places)
}

// 업스트림 응답을 items 배열로. 실패(네트워크·비정상 상태·본문 파손)는 전부 null 로 수렴한다
async function fetchLocalSearch(
  query: string,
  credentials: NaverSearchCredentials,
  fetchUpstream: typeof fetch,
): Promise<NaverLocalItem[] | null> {
  const url = `${NAVER_LOCAL_SEARCH_URL}?query=${encodeURIComponent(query)}&display=${SEARCH_DISPLAY}`

  try {
    const response = await fetchUpstream(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': credentials.clientId,
        'X-NCP-APIGW-API-KEY': credentials.clientSecret,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    if (!response.ok) {
      // 본문은 로그에도 남기지 않는다 — 상태 코드로 충분하다
      console.error(`[place-search] 업스트림 ${response.status}`)
      return null
    }

    const payload: unknown = await response.json()
    const items = (payload as { items?: unknown } | null)?.items
    if (!Array.isArray(items)) {
      console.error('[place-search] 업스트림 응답에 items 배열이 없음')
      return null
    }

    return items as NaverLocalItem[]
  } catch (error) {
    console.error('[place-search] 업스트림 호출 실패', (error as Error).name)
    return null
  }
}

async function readCache(
  supabase: SupabaseClient,
  qhash: string,
): Promise<NormalizedPlace[] | null> {
  // 5분 판정은 DB(get_cached_search)가 한다
  return callCacheRpc(supabase, 'get_cached_search', qhash)
}

// 5분 창을 무시하고(상한 7일) 있는 것을 그대로 꺼낸다 — 502 폴백 전용 (T5-3·결정 #23)
async function readStaleCache(
  supabase: SupabaseClient,
  qhash: string,
): Promise<NormalizedPlace[] | null> {
  return callCacheRpc(supabase, 'get_stale_search', qhash)
}

async function callCacheRpc(
  supabase: SupabaseClient,
  fn: 'get_cached_search' | 'get_stale_search',
  qhash: string,
): Promise<NormalizedPlace[] | null> {
  const { data, error } = await supabase.rpc(fn, { qhash })
  if (error) {
    console.error(`[place-search] 캐시 조회 실패 (${fn})`, error.message)
    return null
  }
  // 배열이 아니면 캐시 미스로 본다 — jsonb 는 무엇이든 담을 수 있고,
  // 그걸 그대로 응답에 실으면 계약(NormalizedPlace[])이 깨진다
  return Array.isArray(data) ? (data as NormalizedPlace[]) : null
}

async function upstreamProblem(
  instance: string,
  supabase: SupabaseClient,
  qhash: string,
): Promise<Response> {
  // 여기 도달했다는 건 위에서 get_cached_search 가 이미 miss 를 냈다는 뜻이다 —
  // 같은 함수를 다시 부르면 영영 null 이라 cached[] 분기가 죽는다. stale 로 묻는다.
  const cached = await readStaleCache(supabase, qhash)

  return problemResponse({
    type: 'search/upstream-error',
    title: '검색 서버가 잠시 멈췄어요',
    status: 502,
    detail: cached
      ? '전에 받아둔 결과를 대신 보여드려요. 잠시 뒤에 다시 검색해 주세요.'
      : '잠시 뒤에 다시 검색하거나, 지도에서 길게 눌러 직접 등록해 보세요.',
    instance,
    ...(cached ? { extensions: { cached } } : {}),
  })
}

function unavailable(instance: string): Response {
  return problemResponse({
    type: 'search/unavailable',
    title: '검색을 처리하지 못했어요',
    status: 500,
    detail: '잠시 뒤에 다시 검색해 주세요.',
    instance,
  })
}
