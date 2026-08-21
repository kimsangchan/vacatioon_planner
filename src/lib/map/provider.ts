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
  /** 지도 핀에 붙여 보여 줄 장소 이름 */
  label: string
  latLng: LatLng
  category: PlaceCategory
  selected: boolean
  /**
   * 배치된 곳이면 **그 날 몇 번째 방문인지**(1부터), 보관함이면 null (결정 #49).
   * 색이 이미 '몇 일차'를 나르므로(#41) 숫자까지 일차를 말하면 같은 정보를 두 번 말하는 것이고,
   * 그동안 정작 **순서**를 읽을 방법이 없었다 — 한 일차의 핀이 전부 같은 숫자였다.
   */
  orderNumber: number | null
  /** 핀 배경. 배치된 곳은 일차 색, 보관함은 카테고리 색. CSS 변수 참조다 */
  color: string
}

/** 지도 컨테이너 기준 픽셀 좌표 */
export interface ScreenPoint {
  x: number
  y: number
}

export type PinEventHandler = (id: string, ev: PinEventKind) => void
export type LongPressHandler = (latLng: LatLng) => void

export interface MapProvider {
  mount(el: HTMLElement, center: LatLng, zoom: number): Promise<void>
  setPins(pins: Pin[]): void
  panTo(latLng: LatLng): void
  onPinEvent(cb: PinEventHandler): void
  onLongPress(cb: LongPressHandler): void
  /** 지도 빈자리를 그냥 눌렀을 때. 롱프레스가 숨은 동작이라 '찍기 모드'의 입구가 된다 (FR-016) */
  onMapTap(cb: LongPressHandler): void
  /**
   * 좌표 → 지도 컨테이너 왼쪽 위 기준 픽셀. 지도가 아직 안 떴으면 null.
   * 핀에 붙어 따라다니는 표면(장소 카드)이 이걸 쓴다 — 화면 모서리 고정은 지도 위 카드가 아니다.
   */
  project(latLng: LatLng): ScreenPoint | null
  /**
   * 지금 보고 있는 화면의 한가운데. 지도가 아직 안 떴으면 null.
   * 검색 결과를 "이 부근" 순으로 세우는 데 쓴다 — 네이버 지역검색은 좌표로 걸러 주지 않는다
   */
  viewCenter(): LatLng | null
  /** 지도가 움직여(이동·확대축소) 투영이 달라질 때. 구독 해제 함수를 돌려준다 */
  onViewportChange(cb: () => void): () => void
  /**
   * 그 날 실제로 달리는 길을 선으로 그린다 (결정 #49). 빈 배열이면 지운다.
   * 핀만으로는 어디서 어디로 가는지 안 읽힌다 — 숫자를 세어 눈으로 이어야 한다.
   * 직선으로 잇지 않는 이유: 제주에서 직선은 바다를 가로지른다.
   */
  setRoutePath(points: LatLng[], color: string): void
  destroy(): void
}

// 카테고리 3색은 globals.css 의 --pin-* 하나에서만 나온다 (SPEC §UI 규칙 — 배지·핀 일관)
export const CATEGORY_COLOR_VAR: Record<PlaceCategory, string> = {
  restaurant: 'var(--pin-restaurant)',
  lodging: 'var(--pin-lodging)',
  spot: 'var(--pin-spot)',
}

// 카테고리 아이콘 (결정 #41) — 24x24 뷰박스의 선 아이콘. 색은 여기서 정하지 않는다:
// 핀에서는 흰 선으로, 리스트에서는 현재 글자색으로 쓰인다. 지도 SDK 는 HTML 문자열을 받으므로
// React 컴포넌트가 아니라 path 데이터로 둔다 — 지도와 화면이 같은 모양을 쓰게 하는 유일한 방법이다
export const CATEGORY_ICON_PATH: Record<PlaceCategory, string> = {
  // 포크와 나이프
  restaurant: 'M6 3v7a2 2 0 0 0 4 0V3M8 10v11M17 3c-1.4 0-2.2 1.9-2.2 4.2 0 1.9.8 2.8 2.2 2.8s2.2-.9 2.2-2.8C19.2 4.9 18.4 3 17 3zM17 10v11',
  // 침대
  lodging: 'M3 19v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 16h18M3 19v2M21 19v2M7 10V7h6v3',
  // 별
  spot: 'M12 3.5l2.6 5.4 5.9.9-4.2 4.1 1 5.9-5.3-2.8-5.3 2.8 1-5.9L3.5 9.8l5.9-.9z',
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
