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

import { CATEGORY_COLOR_VAR } from './provider'
import type {
  LatLng,
  LongPressHandler,
  MapProvider,
  Pin,
  PinEventHandler,
  PinEventKind,
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

export interface NaverMap {
  panTo(coord: unknown): void
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

export function loadNaverSdk(clientId: string): Promise<NaverMapsNamespace> {
  if (sdkPromise) return sdkPromise

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
  }

  setPins(pins: Pin[]): void {
    const maps = this.maps
    if (!maps || !this.map) return

    for (const marker of this.markers) marker.setMap(null)
    this.markers = []

    for (const pin of pins) {
      const marker = new maps.Marker({
        position: new maps.LatLng(pin.latLng.lat, pin.latLng.lng),
        map: this.map,
        icon: { content: pinContent(pin), anchor: new maps.Point(11, 11) },
        zIndex: pin.selected ? 100 : 1,
      })
      this.markers.push(marker)
      this.bindPinEvents(maps, marker, pin.id)
    }
  }

  panTo(latLng: LatLng): void {
    if (!this.maps || !this.map) return
    this.map.panTo(new this.maps.LatLng(latLng.lat, latLng.lng))
  }

  onPinEvent(cb: PinEventHandler): void {
    this.pinHandlers.push(cb)
  }

  onLongPress(cb: LongPressHandler): void {
    this.longPressHandlers.push(cb)
  }

  destroy(): void {
    for (const listener of this.listeners) this.maps?.Event.removeListener(listener)
    for (const marker of this.markers) marker.setMap(null)
    this.listeners = []
    this.markers = []
    this.pinHandlers = []
    this.longPressHandlers = []
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
function pinContent(pin: Pin): string {
  const size = pin.selected ? 22 : 16
  const ring = pin.selected ? '3px solid var(--background)' : '2px solid var(--background)'
  return (
    `<div style="width:${size}px;height:${size}px;border-radius:9999px;` +
    `background:${CATEGORY_COLOR_VAR[pin.category]};border:${ring};` +
    `box-shadow:0 1px 4px rgba(0,0,0,.35);transition:width 120ms,height 120ms"></div>`
  )
}
