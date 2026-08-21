// 장소 사진을 찾는 검색어 (결정 #63).
//
// 어떤 말로 찾느냐가 결과의 거의 전부다. 실제 저장된 장소로 재 보고 정한 규칙이다:
// **시(市) + 이름**. 구(區)를 붙이면 블로그·리뷰가 그렇게 안 써서 엉뚱한 상품·뉴스 사진이 나오고,
// "맛집" 같은 말을 더하면 검색 서비스의 **다른 가게 목록**이 올라온다.
// (지도 링크는 반대로 구가 낫다 — 거기서는 같은 이름을 가려내는 게 목적이다. `map-link.ts`)

const CITY_SUFFIX = /(특별자치시|특별자치도|광역시|특별시|자치시|자치도|시|도)$/

/** "부산광역시 남구 …" → "부산", "제주특별자치도 …" → "제주" */
export function cityOf(address: string): string {
  const first = address.trim().split(/\s+/)[0] ?? ''
  if (first === '') return ''
  const short = first.replace(CITY_SUFFIX, '')
  // "세종" 처럼 접미사를 떼면 한 글자가 되는 곳은 원문을 쓴다
  return short.length >= 2 ? short : first
}

export function imageQueryOf(name: string, address: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const city = cityOf(address)
  if (city === '' || trimmed.includes(city)) return trimmed
  return `${city} ${trimmed}`
}
