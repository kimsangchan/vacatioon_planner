// NCP Web Dynamic Map (NAVER Maps JavaScript API v3) 구현체.
//
// 스크립트 URL·파라미터는 공식 기술문서에서 2026-08-07 확인한 값이다:
//   https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html
//   <script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_CLIENT_ID"></script>
// 파라미터가 구버전 `ncpClientId`(및 govClientId·finClientId)에서 **`ncpKeyId`로 바뀌었다** —
// 구버전 이름을 쓰면 "인증이 실패하였습니다"로 지도가 뜨지 않는다. naver.test.ts 가 회귀를 막는다.
// longtap·rightclick·destroy·panTo 는 naver.maps.Map 문서(같은 사이트 naver.maps.Map.html)에서 확인.
//
// 이 파일 바깥에서는 SDK 전역을 만지지 않는다 — 컴포넌트는 MapProvider 만 소비한다 (CLAUDE.md).

import { CATEGORY_ICON_PATH } from './provider'
import type {
  LatLng,
  LongPressHandler,
  MapProvider,
  Pin,
  PinEventHandler,
  PinEventKind,
  ScreenPoint,
} from './provider'

const SDK_ORIGIN = 'https://oapi.map.naver.com/openapi/v3/maps.js'
const SCRIPT_ID = 'ncp-maps-sdk'

export function naverMapScriptUrl(clientId: string): string {
  return `${SDK_ORIGIN}?ncpKeyId=${encodeURIComponent(clientId)}`
}

// ── SDK 최소 타입 (공식 d.ts 를 의존성으로 추가하지 않는다) ──────────────────

export interface NaverCoord {
  lat(): number
  lng(): number
}

export interface NaverPointerEvent {
  coord?: NaverCoord
}

export interface NaverPoint {
  x: number
  y: number
}

export interface NaverProjection {
  /**
   * 좌표 → **현재 줌의 월드 픽셀**. 화면 기준이 아니다 — 지도를 옮겨도 값이 그대로다.
   * (실측으로 확인: 끌어도 1058.999/441.96 고정) 화면 좌표는 뷰포트 북서 모서리를 빼서 얻는다.
   */
  fromCoordToOffset(coord: unknown): NaverPoint
}

export interface NaverBounds {
  getNE(): NaverCoord
  getSW(): NaverCoord
}

export interface NaverMap {
  panTo(coord: unknown): void
  getProjection(): NaverProjection | null
  getBounds(): NaverBounds | null
  destroy(): void
}

export interface NaverMarker {
  setMap(map: unknown): void
}

export interface NaverMapsNamespace {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => NaverMap
  Marker: new (options: Record<string, unknown>) => NaverMarker
  LatLng: new (lat: number, lng: number) => unknown
  Point: new (x: number, y: number) => unknown
  Event: {
    addListener(target: unknown, type: string, handler: (payload: NaverPointerEvent) => void): unknown
    removeListener(listener: unknown): void
  }
}

export type NaverSdkLoader = () => Promise<NaverMapsNamespace>

export interface NaverMapProviderOptions {
  clientId: string
  loadSdk?: NaverSdkLoader
}

// 스크립트는 한 번만 붙인다 — 페이지 전환마다 다시 붙이면 SDK 가 전역을 덮어쓴다
let sdkPromise: Promise<NaverMapsNamespace> | null = null

// ── 인증 실패 대응 ────────────────────────────────────────────────────────────
// SDK 는 Map 생성 "후" 비동기로 인증을 검사하고, 실패하면 전역 navermap_authFailure 를
// 호출한 뒤 naver.maps 내부를 비운다 — mount 성공 이후에도 setPins 가 null 을 만질 수
// 있다는 뜻이다. 앱이 죽는 대신(막다른 에러 금지, L-06) 구독자에게 알리고 강등한다.
type AuthFailureCb = () => void
let authFailureCbs: AuthFailureCb[] = []
let authFailed = false

export function onNaverAuthFailure(cb: AuthFailureCb): void {
  if (authFailed) {
    cb()
    return
  }
  authFailureCbs.push(cb)
}

export function installAuthFailureHook(target: object = window): void {
  const w = target as { navermap_authFailure?: () => void }
  if (w.navermap_authFailure) return
  w.navermap_authFailure = () => {
    authFailed = true
    sdkPromise = null
    const cbs = authFailureCbs
    authFailureCbs = []
    for (const cb of cbs) cb()
  }
}

export function resetNaverAuthStateForTests(): void {
  authFailed = false
  authFailureCbs = []
  sdkPromise = null
}

export function loadNaverSdk(clientId: string): Promise<NaverMapsNamespace> {
  if (sdkPromise) return sdkPromise
  installAuthFailureHook()

  sdkPromise = new Promise<NaverMapsNamespace>((resolve, reject) => {
    const ready = () => {
      const maps = (window as unknown as { naver?: { maps?: NaverMapsNamespace } }).naver?.maps
      if (maps) resolve(maps)
      else reject(new Error('지도 SDK 를 불러왔지만 naver.maps 가 없어요'))
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', ready, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = naverMapScriptUrl(clientId)
    script.async = true
    script.addEventListener('load', ready, { once: true })
    script.addEventListener('error', () => reject(new Error('지도 SDK 를 불러오지 못했어요')), {
      once: true,
    })
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    sdkPromise = null // 다음 시도에서 다시 붙일 수 있게 되돌린다
    throw error
  })

  return sdkPromise
}

// ── 구현체 ───────────────────────────────────────────────────────────────────

export class NaverMapProvider implements MapProvider {
  private readonly clientId: string
  private readonly loadSdk: NaverSdkLoader
  private maps: NaverMapsNamespace | null = null
  private map: NaverMap | null = null
  private markers: NaverMarker[] = []
  private listeners: unknown[] = []
  private pinHandlers: PinEventHandler[] = []
  private longPressHandlers: LongPressHandler[] = []
  private mapTapHandlers: LongPressHandler[] = []
  private viewportHandlers: Array<() => void> = []

  constructor(options: NaverMapProviderOptions) {
    this.clientId = options.clientId
    this.loadSdk = options.loadSdk ?? (() => loadNaverSdk(this.clientId))
  }

  async mount(el: HTMLElement, center: LatLng, zoom: number): Promise<void> {
    const maps = await this.loadSdk()
    this.maps = maps
    this.map = new maps.Map(el, { center: new maps.LatLng(center.lat, center.lng), zoom })

    // FR-016: 모바일은 길게 누르기, 데스크톱은 우클릭 — 같은 콜백으로 모은다
    for (const type of ['longtap', 'rightclick']) {
      this.listeners.push(
        maps.Event.addListener(this.map, type, (event: NaverPointerEvent) => {
          const coord = event?.coord
          if (!coord) return
          const latLng = { lat: coord.lat(), lng: coord.lng() }
          for (const handler of this.longPressHandlers) handler(latLng)
        }),
      )
    }

    // 그냥 누르기는 평소엔 아무 일도 하지 않는다 — '찍기 모드'를 켠 화면만 이걸 받는다
    this.listeners.push(
      maps.Event.addListener(this.map, 'click', (event: NaverPointerEvent) => {
        const coord = event?.coord
        if (!coord) return
        const latLng = { lat: coord.lat(), lng: coord.lng() }
        for (const handler of this.mapTapHandlers) handler(latLng)
      }),
    )

    // 핀에 붙어 있는 표면이 지도를 따라가려면 이동 중에도 다시 투영해야 한다.
    // 'idle' 만 듣지 않는 이유: 그건 멈춘 뒤에 온다 — 끄는 동안 카드가 뒤처져 따로 논다.
    for (const type of ['drag', 'bounds_changed', 'zoom_changed', 'center_changed', 'idle']) {
      this.listeners.push(
        maps.Event.addListener(this.map, type, () => {
          for (const handler of this.viewportHandlers) handler()
        }),
      )
    }
  }

  setPins(pins: Pin[]): void {
    const maps = this.maps
    if (!maps || !this.map) return

    // 인증 실패 후 SDK 가 네임스페이스를 비우면 여기가 첫 null 접촉점이다 —
    // 던지는 대신 조용히 물러난다 (UI 는 onNaverAuthFailure 구독으로 이미 안내 중)
    try {
      for (const marker of this.markers) marker.setMap(null)
      this.markers = []

      for (const pin of pins) {
        const marker = new maps.Marker({
          position: new maps.LatLng(pin.latLng.lat, pin.latLng.lng),
          map: this.map,
          // 앵커는 원의 중심 — 크기가 바뀌면 같이 움직여야 핀이 좌표에서 떨어지지 않는다
          icon: {
            content: pinContent(pin),
            anchor: new maps.Point(pinSize(pin.selected) / 2, pinSize(pin.selected) / 2),
          },
          zIndex: pin.selected ? 100 : 1,
        })
        this.markers.push(marker)
        this.bindPinEvents(maps, marker, pin.id)
      }
    } catch {
      this.markers = []
    }
  }

  project(latLng: LatLng): ScreenPoint | null {
    if (!this.maps || !this.map) return null
    try {
      // 인증 실패로 네임스페이스가 비면 여기도 null 을 만진다 — 던지지 않고 물러난다
      const projection = this.map.getProjection()
      const bounds = this.map.getBounds()
      if (!projection || !bounds) return null

      // 월드 픽셀에서 뷰포트 북서 모서리(위=NE.lat, 왼쪽=SW.lng)를 빼면 컨테이너 기준이 된다
      const origin = projection.fromCoordToOffset(
        new this.maps.LatLng(bounds.getNE().lat(), bounds.getSW().lng()),
      )
      const point = projection.fromCoordToOffset(new this.maps.LatLng(latLng.lat, latLng.lng))
      const x = point.x - origin.x
      const y = point.y - origin.y
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return { x, y }
    } catch {
      return null
    }
  }

  onViewportChange(cb: () => void): () => void {
    this.viewportHandlers.push(cb)
    return () => {
      this.viewportHandlers = this.viewportHandlers.filter((handler) => handler !== cb)
    }
  }

  panTo(latLng: LatLng): void {
    if (!this.maps || !this.map) return
    try {
      this.map.panTo(new this.maps.LatLng(latLng.lat, latLng.lng))
    } catch {
      // 인증 실패 상태 — 이동 불가는 배너가 설명한다
    }
  }

  onPinEvent(cb: PinEventHandler): void {
    this.pinHandlers.push(cb)
  }

  onLongPress(cb: LongPressHandler): void {
    this.longPressHandlers.push(cb)
  }

  onMapTap(cb: LongPressHandler): void {
    this.mapTapHandlers.push(cb)
  }

  destroy(): void {
    try {
      for (const listener of this.listeners) this.maps?.Event.removeListener(listener)
      for (const marker of this.markers) marker.setMap(null)
    } catch {
      // 인증 실패로 SDK 내부가 비어도 정리는 계속한다
    }
    this.listeners = []
    this.markers = []
    this.pinHandlers = []
    this.longPressHandlers = []
    this.mapTapHandlers = []
    this.viewportHandlers = []
    this.map?.destroy()
    this.map = null
    this.maps = null
  }

  private bindPinEvents(maps: NaverMapsNamespace, marker: NaverMarker, id: string): void {
    const relay = (ev: PinEventKind) => () => {
      for (const handler of this.pinHandlers) handler(id, ev)
    }

    this.listeners.push(
      maps.Event.addListener(marker, 'mouseover', relay('hover')),
      maps.Event.addListener(marker, 'mouseout', relay('leave')),
      maps.Event.addListener(marker, 'click', relay('tap')),
    )
  }
}

// 핀은 카테고리 3색만으로 구분한다 — 색은 globals.css 의 --pin-* 이 유일한 출처다
// 핀의 두 채널 (결정 #41): 색 = 몇 일차인가, 안에 든 글리프 = 무엇인가.
// 배치된 곳은 일차 번호를, 보관함은 카테고리 아이콘을 낸다 — 둘 다 넣으면 이 크기에서 둘 다 안 읽힌다.
export function pinSize(selected: boolean): number {
  return selected ? 26 : 20
}

function pinContent(pin: Pin): string {
  const size = pinSize(pin.selected)
  const ring = pin.selected ? '3px solid var(--background)' : '2px solid var(--background)'
  const glyph =
    pin.dayNumber !== null
      ? `<span style="color:#fff;font-size:${pin.selected ? 13 : 11}px;` +
        `font-weight:700;line-height:1;font-variant-numeric:tabular-nums">${pin.dayNumber}</span>`
      : `<svg viewBox="0 0 24 24" width="${pin.selected ? 15 : 12}" ` +
        `height="${pin.selected ? 15 : 12}" fill="none" stroke="#fff" stroke-width="2.4" ` +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
        `<path d="${CATEGORY_ICON_PATH[pin.category]}"/></svg>`

  return (
    `<div style="width:${size}px;height:${size}px;border-radius:9999px;` +
    `background:${pin.color};border:${ring};display:flex;align-items:center;` +
    `justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35);` +
    `transition:width 120ms,height 120ms">${glyph}</div>`
  )
}
