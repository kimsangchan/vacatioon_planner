// T10-36 — "이게 뭔지 알려면 결국 지도앱에서 검색해야 한다"(사용자 지적)를 한 탭으로 줄인다.
//
// 네이버 지역검색은 **지도 상세 링크를 주지 않는다** — `link` 는 업체 홈페이지·인스타다
// (운영 실측: 25곳 중 5곳만 있고 그나마 지도가 아니다). 그래서 이름과 주소로 우리가 만든다.

import { describe, expect, it } from 'vitest'
import { naverMapSearchUrl, regionOf } from './map-link'

describe('regionOf — 주소에서 동네 하나를 집는다', () => {
  it('시·군·구를 집는다 — 같은 이름의 가게가 전국에 있다', () => {
    expect(regionOf('제주특별자치도 서귀포시 성산읍 일출로 284-12')).toBe('서귀포시')
  })

  it('광역시도 시·군·구까지 집는다', () => {
    expect(regionOf('부산광역시 해운대구 우동 1')).toBe('해운대구')
  })

  it('주소가 한 토막이면 그대로 쓴다', () => {
    expect(regionOf('제주시')).toBe('제주시')
  })

  it('주소가 없으면 빈 문자열이다', () => {
    expect(regionOf('')).toBe('')
  })
})

describe('naverMapSearchUrl', () => {
  it('동네와 이름을 함께 넣는다 — 이름만으로는 엉뚱한 지역이 나온다', () => {
    const url = naverMapSearchUrl({
      name: '가시아방국수',
      road_address: '제주특별자치도 서귀포시 성산읍 일출로 1',
      address: '',
    })

    expect(url).toBe('https://map.naver.com/p/search/%EC%84%9C%EA%B7%80%ED%8F%AC%EC%8B%9C%20%EA%B0%80%EC%8B%9C%EC%95%84%EB%B0%A9%EA%B5%AD%EC%88%98')
  })

  it('도로명이 없으면 지번 주소를 쓴다', () => {
    const url = naverMapSearchUrl({ name: '흑돼지집', road_address: '', address: '제주특별자치도 제주시 연동 1' })

    expect(decodeURIComponent(url)).toContain('제주시 흑돼지집')
  })

  it('주소가 아예 없으면 이름만으로 연다 — 막다른 길을 만들지 않는다', () => {
    const url = naverMapSearchUrl({ name: '이름만있는곳', road_address: '', address: '' })

    expect(decodeURIComponent(url)).toBe('https://map.naver.com/p/search/이름만있는곳')
  })
})
