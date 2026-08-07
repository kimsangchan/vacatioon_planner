import { describe, expect, it } from 'vitest'
import proj4 from 'proj4'
import { CoordsOutOfRangeError, TM128_PROJ, toWgs84 } from './naver-coords'

describe('toWgs84 — 형식 판별 (SPEC §알고리즘 1)', () => {
  it('|mapx| ≤ 180 이면 이미 WGS84 도 단위로 해석한다 (NCP API HUB 문서 형식)', () => {
    const r = toWgs84(126.978, 37.5665)
    expect(r.lng).toBeCloseTo(126.978, 6)
    expect(r.lat).toBeCloseTo(37.5665, 6)
    const s = toWgs84('126.9780000', '37.5665000')
    expect(s.lng).toBeCloseTo(126.978, 6)
  })

  it('도 단위 형식도 한국 범위 검증을 통과해야 한다', () => {
    // 도쿄 (도 단위) — lng 139.69는 범위 밖
    expect(() => toWgs84(139.6917, 35.6895)).toThrow(CoordsOutOfRangeError)
  })

  it('|mapx| ≥ 1e8 이면 WGS84×10⁷ 형식으로 해석한다', () => {
    // 서울시청: lng 126.9780, lat 37.5665
    const r = toWgs84(1269780000, 375665000)
    expect(r.lng).toBeCloseTo(126.978, 6)
    expect(r.lat).toBeCloseTo(37.5665, 6)
  })

  it('API가 문자열로 줘도 동일하게 동작한다', () => {
    const r = toWgs84('1269780000', '375665000')
    expect(r.lng).toBeCloseTo(126.978, 6)
    expect(r.lat).toBeCloseTo(37.5665, 6)
  })

  it('작은 값은 KATECH(TM128) 형식으로 해석한다', () => {
    // 라운드트립: WGS84 → TM128(역투영) → toWgs84 → 원점 복원
    // 절대 좌표쌍의 진위는 T0-4 실측으로 확정하고, 여기선 정의 문자열·배선 일관성을 검증한다
    const cities = [
      { name: '서울시청', lng: 126.978, lat: 37.5665 },
      { name: '부산역', lng: 129.0403, lat: 35.115 },
      { name: '제주공항', lng: 126.4927, lat: 33.5104 },
    ]
    for (const c of cities) {
      const [mapx, mapy] = proj4('EPSG:4326', TM128_PROJ, [c.lng, c.lat])
      expect(Math.abs(mapx)).toBeLessThan(1e8) // KATECH 분기로 가는지 전제 확인
      const r = toWgs84(mapx, mapy)
      expect(r.lng).toBeCloseTo(c.lng, 5)
      expect(r.lat).toBeCloseTo(c.lat, 5)
    }
  })
})

describe('toWgs84 — 결과 범위 검증 (PRD 엣지: 변환 실패 시 저장 차단)', () => {
  it('한국 범위(lat 33~39, lng 124~132) 밖이면 CoordsOutOfRangeError', () => {
    // 도쿄 (WGS84e7 형식) — lng 139.69는 범위 밖
    expect(() => toWgs84(1396917000, 356895000)).toThrow(CoordsOutOfRangeError)
  })

  it('숫자가 아니면 CoordsOutOfRangeError', () => {
    expect(() => toWgs84('abc', '375665000')).toThrow(CoordsOutOfRangeError)
  })
})
