export type PlaceCategory = 'restaurant' | 'lodging' | 'spot'

// 네이버 category 문자열의 최상위 토큰 기준 제안 — 힌트일 뿐, 최종 확정은 항상 사용자다
// (SC-001의 결정 지점 3). API HUB 실측(T0-4·T5 스모크): 최상위 토큰이 "음식점"이 아니라
// "한식>칼국수,만두"처럼 요리명으로 온다 — 요리 분류 어휘를 포함해야 한다 (decision-log #23).
const RESTAURANT_TOKENS = [
  '음식점', '한식', '일식', '중식', '양식', '아시아음식', '분식', '뷔페',
  '패스트푸드', '치킨', '피자', '술집', '카페', '디저트', '간식',
]
const LODGING_TOKENS = ['숙박', '호텔', '모텔', '펜션', '게스트하우스', '리조트']

export function categoryHint(naverCategory: string | undefined): PlaceCategory {
  const top = (naverCategory ?? '').split('>')[0]
  if (RESTAURANT_TOKENS.some((t) => top.includes(t))) return 'restaurant'
  if (LODGING_TOKENS.some((t) => top.includes(t))) return 'lodging'
  return 'spot'
}
