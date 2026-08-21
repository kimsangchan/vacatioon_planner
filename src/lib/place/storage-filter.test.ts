import { describe, expect, it } from 'vitest'
import type { PlaceRow } from '@/lib/trips/bundle'
import { filterStoragePlaces, storageCategoryCounts } from './storage-filter'

function place(
  id: string,
  name: string,
  category: PlaceRow['category'],
  address: string,
  roadAddress = '',
): PlaceRow {
  return {
    id,
    trip_id: 'trip-1',
    category,
    name,
    address,
    road_address: roadAddress,
    lat: 33.5,
    lng: 126.5,
    provider: 'naver',
    provider_link: null,
    category_label: '',
    phone: '',
    opening_hours: '',
    memo: '',
    estimated_cost: null,
    photos: [],
  }
}

const places = [
  place('p1', '흑돼지집', 'restaurant', '제주시 노형동'),
  place('p2', '바다식당', 'restaurant', '서귀포시 성산읍'),
  place('p3', 'JeJu 제주호텔', 'lodging', '제주시 연동'),
  place('p4', '성산일출봉', 'spot', '서귀포시', '제주특별자치도 서귀포시 성산읍'),
]

describe('storage filter', () => {
  it('카테고리별 개수와 전체 개수를 센다', () => {
    expect(storageCategoryCounts(places)).toEqual({
      all: 4,
      restaurant: 2,
      lodging: 1,
      spot: 1,
    })
  })

  it('고른 카테고리만 남긴다', () => {
    expect(filterStoragePlaces(places, { category: 'restaurant', query: '' }).map((p) => p.id))
      .toEqual(['p1', 'p2'])
  })

  it('검색어의 앞뒤 공백과 대소문자를 무시하고 이름 또는 주소에서 찾는다', () => {
    expect(filterStoragePlaces(places, { category: 'all', query: '  호텔  ' }).map((p) => p.id))
      .toEqual(['p3'])
    expect(filterStoragePlaces(places, { category: 'all', query: 'JEJU' }).map((p) => p.id))
      .toEqual(['p3'])
    expect(filterStoragePlaces(places, { category: 'all', query: '성산읍' }).map((p) => p.id))
      .toEqual(['p2', 'p4'])
  })

  it('카테고리와 검색어를 함께 만족하는 장소만 남긴다', () => {
    expect(filterStoragePlaces(places, { category: 'restaurant', query: '서귀포' }).map((p) => p.id))
      .toEqual(['p2'])
  })
})
