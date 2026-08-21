// E-03 프록시의 순수 부분 — 검색어 정규화·캐시 키·응답 매핑 (SPEC §알고리즘 4).
// 업스트림 호출·DB 는 integration 쪽에서 다룬다 (search-proxy.integration.test.ts).

import { describe, expect, it } from 'vitest'
import {
  normalizeSearchQuery,
  searchQueryHash,
  toNormalizedPlaces,
  type NaverLocalItem,
} from './search-proxy'

// T0-4 실측 형식: WGS84 × 10^7 정수 (decision-log #20)
function item(overrides: Partial<NaverLocalItem> = {}): NaverLocalItem {
  return {
    title: '목포 맛집',
    link: 'https://map.naver.com/p/1',
    category: '음식점>한식',
    description: '',
    telephone: '',
    address: '전라남도 목포시',
    roadAddress: '전라남도 목포시 해안로',
    mapx: '1263658809',
    mapy: '348019423',
    ...overrides,
  }
}

describe('normalizeSearchQuery', () => {
  it('trims, lowercases and collapses runs of whitespace', () => {
    expect(normalizeSearchQuery('  제주   Cafe\t한라 ')).toBe('제주 cafe 한라')
  })

  it('treats null (파라미터 없음) as an empty query', () => {
    expect(normalizeSearchQuery(null)).toBe('')
    expect(normalizeSearchQuery('   ')).toBe('')
  })
})

describe('searchQueryHash', () => {
  it('produces a 64자 SHA-256 hex — query_hash CHECK(length ≥ 32) 를 만족한다', async () => {
    const hash = await searchQueryHash('성산일출봉')

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash.length).toBeGreaterThanOrEqual(32)
  })

  it('is stable for the same query and differs for another', async () => {
    const [a, b, c] = await Promise.all([
      searchQueryHash('성산일출봉'),
      searchQueryHash('성산일출봉'),
      searchQueryHash('우도'),
    ])

    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('toNormalizedPlaces', () => {
  it('maps an upstream item onto the E-03 response schema', () => {
    const { places, skipped } = toNormalizedPlaces([item()])

    expect(skipped).toBe(0)
    expect(places).toEqual([
      {
        name: '목포 맛집',
        address: '전라남도 목포시',
        roadAddress: '전라남도 목포시 해안로',
        lat: 34.8019423,
        lng: 126.3658809,
        categoryHint: 'restaurant',
        categoryLabel: '음식점>한식',
        providerLink: 'https://map.naver.com/p/1',
        phone: '',
        provider: 'naver',
      },
    ])
  })

  it('strips the <b> highlight tags and decodes entities in title (CLAUDE.md 함정)', () => {
    const { places } = toNormalizedPlaces([
      item({ title: '<b>성산</b>일출봉 &amp; <b>카페</b>' }),
    ])

    expect(places[0].name).toBe('성산일출봉 & 카페')
  })

  it('derives the category hint from the naver category string', () => {
    const { places } = toNormalizedPlaces([
      item({ category: '숙박>호텔' }),
      item({ category: '여행,명소' }),
    ])

    expect(places.map((place) => place.categoryHint)).toEqual(['lodging', 'spot'])
  })

  it('nulls out an empty provider link', () => {
    const { places } = toNormalizedPlaces([item({ link: '' })])

    expect(places[0].providerLink).toBeNull()
  })

  it('caps the result at 5 items (OpenAPI maxItems)', () => {
    const six = Array.from({ length: 6 }, (_, index) => item({ title: `장소 ${index}` }))

    expect(toNormalizedPlaces(six).places).toHaveLength(5)
  })

  it('drops items whose coordinates fall outside Korea and only counts them', () => {
    const { places, skipped } = toNormalizedPlaces([
      item({ title: '좌표 깨진 곳', mapx: '0', mapy: '0' }),
      item({ title: '멀쩡한 곳' }),
    ])

    expect(skipped).toBe(1)
    expect(places.map((place) => place.name)).toEqual(['멀쩡한 곳'])
  })
})
