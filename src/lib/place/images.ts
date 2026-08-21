// 장소 사진 고르기 (결정 #63).
//
// 이미지 검색은 **웹 전체**를 뒤지므로 그 가게 사진이라는 보장이 없다. 실측에서
// "수영구 춘식이네" 는 건강즙 상품 사진을, "남구 보그호프" 는 대구 뉴스 사진을 물어 왔다.
// 그래서 두 겹으로 좁힌다: ① 검색어를 `{시} {동} {이름}` 로 (image-query.ts)
// ② 받은 결과에서 **제목에 이름이 든 것만** 남긴다.
//
// 못 찾으면 빈 배열이다. 엉뚱한 가게 사진을 보여 주는 순간 "여기가 뭔지 알려 준다"는
// 이 기능의 존재 이유가 뒤집힌다 — 없는 편이 낫다.

export interface PlaceImage {
  /** 네이버가 주는 썸네일 (search.pstatic.net 경유) */
  thumbnail: string
  /** 원본이 있는 곳 — 출처를 밝히려면 이 주소가 필요하다 */
  link: string
}

export interface ImageSearchItem {
  title: string
  link: string
  thumbnail: string
}

export const MAX_PLACE_IMAGES = 10

/**
 * 지도 플레이스에 걸린 사진의 호스트. 실측 178장 중 47장이 여기서 왔고, 이게 **그 가게 사진**이다
 * (나머지는 뉴스·블로그라 가게가 아니라 접시나 기사 사진일 때가 많다).
 * 플레이스 사진만 따로 부르는 공개 API 는 없지만, 온 것 중에서 먼저 보여줄 수는 있다.
 */
const PLACE_PHOTO_HOSTS = ['ldb-phinf.pstatic.net', 'ldb-phinf.pstatic.net.', 'phinf.pstatic.net']

const isPlacePhoto = (link: string) => PLACE_PHOTO_HOSTS.some((host) => link.includes(host))

const squash = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, '')
/** "부산역 (고속철도)" → "부산역" — 괄호 부연은 제목에 안 나온다 */
const coreName = (name: string) => squash(name.split('(')[0] ?? name)

export function pickPlaceImages(
  items: ImageSearchItem[],
  name: string,
  limit = MAX_PLACE_IMAGES,
): PlaceImage[] {
  const needle = coreName(name)
  if (needle === '') return []

  const picked: PlaceImage[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!squash(item.title ?? '').includes(needle)) continue
    const thumbnail = item.thumbnail ?? ''
    if (thumbnail === '' || seen.has(thumbnail)) continue
    seen.add(thumbnail)
    picked.push({ thumbnail, link: item.link ?? '' })
    if (picked.length >= limit) break
  }
  // 순서만 바꾼다 — 받은 순서는 안정적으로 유지하면서 플레이스 사진만 앞으로 당긴다
  return [...picked.filter((i) => isPlacePhoto(i.link)), ...picked.filter((i) => !isPlacePhoto(i.link))]
}
