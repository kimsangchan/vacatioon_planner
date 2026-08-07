import proj4 from 'proj4'

// 네이버 지역검색 mapx/mapy는 세대에 따라 3형식 — KATECH(TM128), WGS84×10⁷ 정수,
// WGS84 도 단위(NCP API HUB 문서 기준). 값 크기로 판별하고 실제 형식은 T0-4에서 실측 확정.
export const TM128_PROJ =
  '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 ' +
  '+ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43'

const KOREA_BOUNDS = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 }
const WGS84E7_THRESHOLD = 1e8

export class CoordsOutOfRangeError extends Error {
  constructor(
    public readonly mapx: number | string,
    public readonly mapy: number | string,
  ) {
    super(`좌표를 한국 범위로 변환할 수 없어요: mapx=${mapx}, mapy=${mapy}`)
    this.name = 'CoordsOutOfRangeError'
  }
}

export interface LatLng {
  lat: number
  lng: number
}

export function toWgs84(mapx: number | string, mapy: number | string): LatLng {
  const x = Number(mapx)
  const y = Number(mapy)
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new CoordsOutOfRangeError(mapx, mapy)

  let lat: number
  let lng: number
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    lng = x
    lat = y
  } else if (Math.abs(x) >= WGS84E7_THRESHOLD) {
    lng = x / 1e7
    lat = y / 1e7
  } else {
    ;[lng, lat] = proj4(TM128_PROJ, 'EPSG:4326', [x, y])
  }

  const inKorea =
    lat >= KOREA_BOUNDS.latMin &&
    lat <= KOREA_BOUNDS.latMax &&
    lng >= KOREA_BOUNDS.lngMin &&
    lng <= KOREA_BOUNDS.lngMax
  if (!inKorea) throw new CoordsOutOfRangeError(mapx, mapy)

  return { lat, lng }
}
