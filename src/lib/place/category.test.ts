import { describe, expect, it } from 'vitest'
import { categoryHint } from './category'

describe('categoryHint — 네이버 category 문자열 → 카테고리 제안 (SPEC §알고리즘 3)', () => {
  it('음식점·카페·디저트 계열은 restaurant', () => {
    expect(categoryHint('음식점>한식')).toBe('restaurant')
    expect(categoryHint('카페,디저트>커피전문점')).toBe('restaurant')
  })

  it('API HUB 실측 형식 — 요리명이 최상위 토큰인 경우도 restaurant (T0-4·T5 스모크 실측)', () => {
    expect(categoryHint('한식>해물,생선요리')).toBe('restaurant')
    expect(categoryHint('한식>칼국수,만두')).toBe('restaurant')
    expect(categoryHint('일식>초밥,롤')).toBe('restaurant')
    expect(categoryHint('중식>중식당')).toBe('restaurant')
    expect(categoryHint('양식>이탈리아음식')).toBe('restaurant')
    expect(categoryHint('분식>떡볶이')).toBe('restaurant')
    expect(categoryHint('술집>포장마차')).toBe('restaurant')
  })

  it('실측 스팟 카테고리는 spot 유지', () => {
    expect(categoryHint('지명>봉우리,고지')).toBe('spot')
    expect(categoryHint('여행,명소>기념물')).toBe('spot')
  })

  it('숙박 계열은 lodging', () => {
    expect(categoryHint('숙박>호텔')).toBe('lodging')
    expect(categoryHint('숙박>펜션')).toBe('lodging')
  })

  it('그 외·빈 문자열은 spot (힌트일 뿐 — 최종 확정은 사용자)', () => {
    expect(categoryHint('여행,명소>관광지')).toBe('spot')
    expect(categoryHint('')).toBe('spot')
    expect(categoryHint(undefined)).toBe('spot')
  })
})
