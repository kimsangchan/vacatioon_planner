// 지도 추상화 (SPEC §알고리즘 5 — 시그니처 고정). UI 는 이 인터페이스만 소비하고
// 지도 SDK 를 직접 import 하지 않는다 — 카카오·구글 폴백의 전제다 (decision-log #2).

import type { PlaceCategory } from '@/lib/place/category'

export interface LatLng {
  lat: number
  lng: number
}

export type PinEventKind = 'hover' | 'tap' | 'leave'

export interface Pin {
  id: string
  latLng: LatLng
  category: PlaceCategory
  selected: boolean
}

export type PinEventHandler = (id: string, ev: PinEventKind) => void
export type LongPressHandler = (latLng: LatLng) => void

export interface MapProvider {
  mount(el: HTMLElement, center: LatLng, zoom: number): Promise<void>
  setPins(pins: Pin[]): void
  panTo(latLng: LatLng): void
  onPinEvent(cb: PinEventHandler): void
  onLongPress(cb: LongPressHandler): void
  destroy(): void
}

// 카테고리 3색은 globals.css 의 --pin-* 하나에서만 나온다 (SPEC §UI 규칙 — 배지·핀 일관)
export const CATEGORY_COLOR_VAR: Record<PlaceCategory, string> = {
  restaurant: 'var(--pin-restaurant)',
  lodging: 'var(--pin-lodging)',
  spot: 'var(--pin-spot)',
}

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  restaurant: '식당',
  lodging: '숙박',
  spot: '스팟',
}

export const CATEGORY_ORDER: PlaceCategory[] = ['restaurant', 'lodging', 'spot']

// 지도 초기 중심 — 담아둔 곳이 하나도 없을 때만 쓴다 (제주 시내)
export const DEFAULT_CENTER: LatLng = { lat: 33.4996, lng: 126.5312 }
export const DEFAULT_ZOOM = 11
