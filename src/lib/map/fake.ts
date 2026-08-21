// 지도 SDK 없이 MapProvider 계약을 그대로 만족하는 구현체.
// ① vitest 에서 핀 상태·이벤트를 직접 관찰하고 ② 지도 키(NEXT_PUBLIC_NCP_MAP_CLIENT_ID)가
// 없는 개발 환경에서도 캔버스가 끝까지 동작하게 한다. DOM 을 만들지 않는다.

import type {
  LatLng,
  LongPressHandler,
  MapProvider,
  Pin,
  PinEventHandler,
  PinEventKind,
  ScreenPoint,
} from './provider'

export class FakeMapProvider implements MapProvider {
  element: HTMLElement | null = null
  center: LatLng | null = null
  zoom = 0
  pins: Pin[] = []
  pannedTo: LatLng[] = []
  mounted = false

  private pinHandlers: PinEventHandler[] = []
  private longPressHandlers: LongPressHandler[] = []
  private mapTapHandlers: LongPressHandler[] = []
  private viewportHandlers: Array<() => void> = []
  /** 테스트가 갈아끼우는 투영. 기본값은 좌표를 그대로 픽셀로 읽는 단순 사상 */
  projection: (latLng: LatLng) => ScreenPoint | null = (latLng) => ({
    x: Math.round(latLng.lng * 10),
    y: Math.round(latLng.lat * 10),
  })

  get highlightedIds(): string[] {
    return this.pins.filter((pin) => pin.selected).map((pin) => pin.id)
  }

  mount(el: HTMLElement, center: LatLng, zoom: number): Promise<void> {
    this.element = el
    this.center = center
    this.zoom = zoom
    this.mounted = true
    return Promise.resolve()
  }

  setPins(pins: Pin[]): void {
    this.pins = pins.map((pin) => ({ ...pin }))
  }

  panTo(latLng: LatLng): void {
    this.pannedTo.push(latLng)
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

  project(latLng: LatLng): ScreenPoint | null {
    return this.mounted ? this.projection(latLng) : null
  }

  viewCenter(): LatLng | null {
    return this.mounted ? this.center : null
  }

  onViewportChange(cb: () => void): () => void {
    this.viewportHandlers.push(cb)
    return () => {
      this.viewportHandlers = this.viewportHandlers.filter((handler) => handler !== cb)
    }
  }

  /** 마지막으로 그린 경로 — 테스트가 "무엇을 그렸나"를 이걸로 본다 */
  routePath: LatLng[] = []
  routeColor: string | null = null

  setRoutePath(points: LatLng[], color: string): void {
    this.routePath = points
    this.routeColor = points.length >= 2 ? color : null
  }

  destroy(): void {
    this.mounted = false
    this.element = null
    this.pins = []
    this.pinHandlers = []
    this.longPressHandlers = []
    this.mapTapHandlers = []
    this.viewportHandlers = []
  }

  // ── 테스트·개발용 조작구 (인터페이스 밖) ──────────────────────────────────
  emitPinEvent(id: string, ev: PinEventKind): void {
    for (const handler of this.pinHandlers) handler(id, ev)
  }

  emitLongPress(latLng: LatLng): void {
    for (const handler of this.longPressHandlers) handler(latLng)
  }

  emitMapTap(latLng: LatLng): void {
    for (const handler of this.mapTapHandlers) handler(latLng)
  }

  /** 지도를 옮기거나 확대축소한 셈 치고 구독자를 깨운다 */
  emitViewportChange(): void {
    for (const handler of this.viewportHandlers) handler()
  }

  get viewportSubscriberCount(): number {
    return this.viewportHandlers.length
  }
}
