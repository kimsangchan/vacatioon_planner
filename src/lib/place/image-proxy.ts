// 장소 사진 가져오기 (결정 #63). 절차만 여기 두고 배선은 app/api/place-images/route.ts 가 한다.
//
//   인증(401) → placeId → 내 장소인가(RLS 로 조회, 없으면 404)
//   → 쿼터(429) → 이미지 검색 → 이름으로 거르기 → places.images 저장 → 담은 목록 반환
//
// 검색 키는 서버 전용이라 이 경계 밖으로 나가지 않는다. 공유 화면(anon)은 이 길을 타지 않는다 —
// 주인이 한 번 담아 두면 `get_shared_trip` 이 그대로 내보낸다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { problemResponse, requestInstance } from '@/lib/http/problem'
import { imageQueryOf } from './image-query'
import { pickPlaceImages, MAX_PLACE_IMAGES, type ImageSearchItem, type PlaceImage } from './images'
import { naverSearchCredentials, type NaverSearchCredentials } from './search-proxy'

export const NAVER_IMAGE_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/image'
/** 이름으로 거를 것을 감안해 넉넉히 받는다 — 20장을 받아 10장까지 남긴다 (실측) */
export const IMAGE_FETCH_SIZE = 20
/** 무료 제공량(일 25,000)의 50% — 검색과 같은 방어선 규칙 (#19) */
export const DAILY_IMAGE_QUOTA = 12_500
export const IMAGE_USAGE_COUNTER = 'naver_image'
const UPSTREAM_TIMEOUT_MS = 5_000

export interface PlaceImageDeps {
  supabase: SupabaseClient
  fetchUpstream?: typeof fetch
  credentials?: NaverSearchCredentials
}

export async function handlePlaceImages(
  request: Request,
  deps: PlaceImageDeps,
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
      detail: '로그인하고 다시 해 주세요.',
      instance,
    })
  }

  const body = (await request.json().catch(() => null)) as { placeId?: string } | null
  const placeId = body?.placeId ?? ''
  if (placeId === '') {
    return problemResponse({
      type: 'validation/place-required',
      title: '어느 장소인지 알려 주세요',
      status: 400,
      detail: '장소를 고른 뒤 다시 해 주세요.',
      instance,
    })
  }

  // RLS 가 남의 장소를 걸러 준다 — 여기서 소유권을 따로 확인하지 않는다
  const { data: place, error: placeError } = await supabase
    .from('places')
    .select('id,name,address,road_address')
    .eq('id', placeId)
    .is('deleted_at', null)
    .maybeSingle()

  if (placeError || !place) {
    return problemResponse({
      type: 'not-found',
      title: '그 장소를 찾지 못했어요',
      status: 404,
      detail: '보관함에서 다시 골라 주세요.',
      instance,
    })
  }

  let credentials: NaverSearchCredentials
  try {
    credentials = deps.credentials ?? naverSearchCredentials()
  } catch (error) {
    console.error('[place-images] 검색 키 설정 누락', (error as Error).message)
    return unavailable(instance)
  }

  const { data: used, error: usageError } = await supabase.rpc('record_search_usage', {
    kind: IMAGE_USAGE_COUNTER,
  })
  if (usageError) {
    console.error('[place-images] 사용량 기록 실패', usageError.message)
    return unavailable(instance)
  }
  if (typeof used === 'number' && used > DAILY_IMAGE_QUOTA) {
    return problemResponse({
      type: 'search/quota-exceeded',
      title: '오늘 사진 찾기를 다 썼어요',
      status: 429,
      detail: '내일 다시 할 수 있어요.',
      instance,
    })
  }

  const row = place as { id: string; name: string; address: string; road_address: string }
  const query = imageQueryOf(row.name, row.road_address || row.address)
  const items = await fetchImages(query, credentials, deps.fetchUpstream ?? fetch)
  if (!items) return unavailable(instance)

  // 이름이 든 것만 남긴다. 하나도 없으면 빈 배열을 그대로 저장한다 —
  // "찾아봤지만 없었다"와 "아직 안 찾아봤다"를 화면이 구분할 필요는 없다
  const images = pickPlaceImages(items, row.name, MAX_PLACE_IMAGES)

  const { error: saveError } = await supabase
    .from('places')
    .update({ images })
    .eq('id', row.id)

  if (saveError) {
    console.error('[place-images] 사진 저장 실패', saveError.message)
    return unavailable(instance)
  }

  return Response.json({ images } satisfies { images: PlaceImage[] })
}

async function fetchImages(
  query: string,
  credentials: NaverSearchCredentials,
  fetchUpstream: typeof fetch,
): Promise<ImageSearchItem[] | null> {
  const url = `${NAVER_IMAGE_SEARCH_URL}?query=${encodeURIComponent(query)}&display=${IMAGE_FETCH_SIZE}`
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
      console.error(`[place-images] 업스트림 ${response.status}`)
      return null
    }
    const payload: unknown = await response.json()
    const items = (payload as { items?: unknown } | null)?.items
    if (!Array.isArray(items)) {
      console.error('[place-images] 업스트림 응답에 items 배열이 없음')
      return null
    }
    return items as ImageSearchItem[]
  } catch (error) {
    console.error('[place-images] 업스트림 호출 실패', (error as Error).name)
    return null
  }
}

function unavailable(instance: string): Response {
  return problemResponse({
    type: 'upstream/unavailable',
    title: '사진을 가져오지 못했어요',
    status: 502,
    detail: '잠시 뒤에 다시 해 주세요.',
    instance,
  })
}
