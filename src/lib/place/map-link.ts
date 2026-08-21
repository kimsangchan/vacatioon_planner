// 네이버 지도로 넘기는 링크 (결정 #62).
//
// 지역검색 API 는 **지도 상세 링크를 주지 않는다** — 응답의 `link` 는 업체 홈페이지·인스타·
// 카카오채널이고 그나마 드물다(운영 실측 25곳 중 5곳). 그래서 이름과 주소로 우리가 만든다.
// 좌표를 URL 에 싣지 않는 이유: 지도 서비스의 카메라 파라미터 형식은 공지 없이 바뀌는데,
// 검색어 경로는 오래 안정적이었다. 동네 한 토막이면 같은 이름을 가려내는 데 충분하다.

export interface MapLinkPlace {
  name: string
  road_address: string
  address: string
}

/** 주소에서 시·군·구 한 토막. "제주특별자치도 서귀포시 성산읍 …" → "서귀포시" */
export function regionOf(address: string): string {
  const parts = address.trim().split(/\s+/).filter((part) => part !== '')
  if (parts.length === 0) return ''
  // 첫 토막은 시·도(제주특별자치도·부산광역시)라 너무 넓다 — 둘째가 있으면 그걸 쓴다
  return parts[1] ?? parts[0]
}

export function naverMapSearchUrl(place: MapLinkPlace): string {
  const region = regionOf(place.road_address || place.address)
  const query = region === '' ? place.name : `${region} ${place.name}`
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`
}
