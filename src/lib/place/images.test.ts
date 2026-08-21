// T10-37 — 장소 사진 (결정 #63). 검색 결과를 그대로 쓰지 않고 **이름이 든 것만** 남긴다.
//
// 실측(2026-08-21, 저장된 25곳): `{시} {동} {이름}` 로 20장을 받아 이름으로 거르면
// 21/25 가 사진을 얻고 13/25 는 5장 이상을 얻는다. 못 찾는 4곳은 **아무것도 안 보여준다** —
// 엉뚱한 가게 사진을 보여 주느니 없는 편이 낫다(그게 이 기능을 만든 이유를 지킨다).

import { describe, expect, it } from 'vitest'
import { pickPlaceImages } from './images'

const item = (title: string, thumb: string, link = `https://example.com/${thumb}.jpg`) => ({
  title,
  link,
  thumbnail: `https://search.pstatic.net/${thumb}`,
})

describe('pickPlaceImages', () => {
  it('이름이 제목에 든 것만 남긴다', () => {
    const picked = pickPlaceImages(
      [item('부산 대연동 <b>보그호프</b> 오마카세', 'a'), item('부산 생선구이 맛집 3곳', 'b')],
      '보그호프',
    )

    expect(picked.map((p) => p.thumbnail)).toEqual(['https://search.pstatic.net/a'])
  })

  it('제목의 태그와 공백을 무시하고 맞춘다 — 네이버는 검색어에 <b> 를 씌운다', () => {
    const picked = pickPlaceImages([item('[부산 양정맛집] <b>울릉도 소주방</b>', 'a')], '울릉도소주방')

    expect(picked).toHaveLength(1)
  })

  it('괄호 안 부연은 떼고 맞춘다 — "부산역 (고속철도)" 같은 이름이 있다', () => {
    const picked = pickPlaceImages([item('KTX 부산역 승강장', 'a')], '부산역 (고속철도)')

    expect(picked).toHaveLength(1)
  })

  it('같은 사진이 여러 번 와도 한 번만 담는다', () => {
    const picked = pickPlaceImages([item('보그호프', 'a'), item('보그호프 재방문', 'a')], '보그호프')

    expect(picked).toHaveLength(1)
  })

  it('열 장을 넘기지 않는다 — 카드가 사진첩이 되면 안 된다', () => {
    const many = Array.from({ length: 20 }, (_, i) => item(`보그호프 ${i}`, `t${i}`))

    expect(pickPlaceImages(many, '보그호프')).toHaveLength(10)
  })

  it('맞는 게 없으면 빈 배열이다 — 엉뚱한 사진을 채우지 않는다', () => {
    const picked = pickPlaceImages([item('부산 생선구이 맛집 3곳', 'a')], '청마루생선구이')

    expect(picked).toEqual([])
  })
})


describe('pickPlaceImages — 네이버 플레이스 사진을 앞에 세운다 (사용자 지적)', () => {
  // 실측(178장): 47장이 `ldb-phinf.pstatic.net` — 지도 플레이스에 걸린 **그 가게 사진**이다.
  // 나머지는 뉴스·블로그라 가게가 아니라 음식 접시나 기사 사진일 때가 많다.
  // 플레이스 사진을 따로 부르는 공개 API 는 없지만, **온 것 중에서 먼저 보여줄 수는** 있다.
  it('플레이스 사진이 먼저 온다', () => {
    const picked = pickPlaceImages(
      [
        item('보그호프 기사', 'news', 'https://imgnews.naver.net/1.jpg'),
        item('보그호프', 'place', 'https://ldb-phinf.pstatic.net/2.jpg'),
      ],
      '보그호프',
    )

    expect(picked[0].link).toContain('ldb-phinf')
  })

  it('플레이스가 없어도 순서는 받은 그대로다', () => {
    const picked = pickPlaceImages(
      [item('보그호프 하나', 'a', 'https://blog.example/1.jpg'), item('보그호프 둘', 'b', 'https://blog.example/2.jpg')],
      '보그호프',
    )

    expect(picked.map((p) => p.link)).toEqual(['https://blog.example/1.jpg', 'https://blog.example/2.jpg'])
  })
})
