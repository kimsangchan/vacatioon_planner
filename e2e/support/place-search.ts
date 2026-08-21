// 검색 프록시는 브라우저 라우트에서 가로채 고정 결과를 돌려준다.
// 이유 두 가지: ① 실 네이버 쿼터를 E2E 가 태우지 않는다(SC-008 방어선은 사람 몫이 아니다)
// ② 프록시 절차 자체(캐시·쿼터·502)는 vitest integration 이 이미 덮는다
// (src/lib/place/search-proxy.integration.test.ts). 여기서 볼 것은 "결정 3지점"뿐이다.

import type { Page, Route } from 'playwright/test'
import type { NormalizedPlace } from '../../src/lib/place/search-proxy'

export const PLACE_SEARCH_PATH = '**/api/place-search*'

// E-03 응답 스키마 그대로 5건 (display=5 상한). 카테고리 힌트는 3종을 모두 담는다 —
// 여정 1이 식당·숙박·스팟을 하나씩 저장하기 때문
export const PLACE_SEARCH_FIXTURE: NormalizedPlace[] = [
  {
    name: '흑돼지 명가',
    address: '제주특별자치도 제주시 연동',
    roadAddress: '제주특별자치도 제주시 노형로 2',
    lat: 33.489,
    lng: 126.4983,
    categoryHint: 'restaurant',
    categoryLabel: '검색 업종',
    providerLink: 'https://map.naver.com/p/e2e/1',
    phone: '',
    provider: 'naver',
  },
  {
    name: '성산일출봉',
    address: '제주특별자치도 서귀포시 성산읍',
    roadAddress: '제주특별자치도 서귀포시 일출로 284-12',
    lat: 33.4581,
    lng: 126.9425,
    categoryHint: 'spot',
    categoryLabel: '검색 업종',
    providerLink: 'https://map.naver.com/p/e2e/2',
    phone: '',
    provider: 'naver',
  },
  {
    name: '바다뷰 호텔',
    address: '제주특별자치도 제주시 삼도이동',
    roadAddress: '제주특별자치도 제주시 탑동로 12',
    lat: 33.5142,
    lng: 126.5219,
    categoryHint: 'lodging',
    categoryLabel: '검색 업종',
    providerLink: 'https://map.naver.com/p/e2e/3',
    phone: '',
    provider: 'naver',
  },
  {
    name: '카페 델문도',
    address: '제주특별자치도 제주시 조천읍',
    roadAddress: '제주특별자치도 제주시 조천읍 조함해안로 519-10',
    lat: 33.5432,
    lng: 126.6702,
    categoryHint: 'restaurant',
    categoryLabel: '검색 업종',
    providerLink: 'https://map.naver.com/p/e2e/4',
    phone: '',
    provider: 'naver',
  },
  {
    name: '우도 등대',
    address: '제주특별자치도 제주시 우도면',
    roadAddress: '제주특별자치도 제주시 우도면 우도해안길 1',
    lat: 33.5015,
    lng: 126.9702,
    categoryHint: 'spot',
    categoryLabel: '검색 업종',
    providerLink: 'https://map.naver.com/p/e2e/5',
    phone: '',
    provider: 'naver',
  },
]

export interface PlaceSearchStub {
  /** 실제로 프록시를 부른 횟수 — 실키 소비가 0인지 확인하는 근거 */
  calls: () => number
}

export async function stubPlaceSearch(
  page: Page,
  places: NormalizedPlace[] = PLACE_SEARCH_FIXTURE,
): Promise<PlaceSearchStub> {
  let calls = 0

  await page.route(PLACE_SEARCH_PATH, async (route: Route) => {
    calls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(places),
    })
  })

  return { calls: () => calls }
}
