'use client'

// FR-005 — MapProvider 만 소비한다. 지도 SDK 를 직접 import 하지 않는 이유는 CLAUDE.md(#2).
// 지도 키가 없으면 캔버스가 FakeMapProvider 로 떨어지고, 그 사실을 배너로 알린다.

import { useEffect, useRef, useState } from 'react'
import type { CreatedMapProvider } from '@/lib/map/create'
import { DEFAULT_CENTER, DEFAULT_ZOOM, type LatLng, type PinEventKind } from '@/lib/map/provider'
import { toPins, type DayRow, type PlaceRow } from '@/lib/trips/bundle'

export interface MapPaneProps {
  created: CreatedMapProvider
  places: PlaceRow[]
  /** 핀 색·번호가 어느 일차인지에 달려 있다 (결정 #41) */
  days: DayRow[]
  highlightedId: string | null
  onPinEvent: (id: string, ev: PinEventKind) => void
  /** FR-016 — 모바일 길게 누르기 / 데스크톱 우클릭 */
  onLongPress?: (latLng: LatLng) => void
  /** '지도에서 찍기' 모드일 때만 의미가 있다 — 평소엔 구독자가 없어 아무 일도 안 한다 */
  onMapTap?: (latLng: LatLng) => void
}

export function MapPane({
  created,
  places,
  days,
  highlightedId,
  onPinEvent,
  onLongPress,
  onMapTap,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // 핸들러가 매 렌더 새로 와도 지도를 다시 만들지 않는다 — 구독은 mount 때 한 번만
  const pinHandlerRef = useRef(onPinEvent)
  useEffect(() => {
    pinHandlerRef.current = onPinEvent
  }, [onPinEvent])

  const longPressHandlerRef = useRef(onLongPress)
  useEffect(() => {
    longPressHandlerRef.current = onLongPress
  }, [onLongPress])

  const mapTapHandlerRef = useRef(onMapTap)
  useEffect(() => {
    mapTapHandlerRef.current = onMapTap
  }, [onMapTap])

  // 초기 중심은 첫 렌더의 첫 장소로 고정한다 — 핀이 늘 때마다 지도가 튀면 안 된다
  const [initialCenter] = useState(() => {
    const first = places[0]
    return first ? { lat: Number(first.lat), lng: Number(first.lng) } : DEFAULT_CENTER
  })

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const { provider } = created
    let alive = true
    provider.onPinEvent((id, ev) => pinHandlerRef.current(id, ev))
    provider.onLongPress((latLng) => longPressHandlerRef.current?.(latLng))
    provider.onMapTap((latLng) => mapTapHandlerRef.current?.(latLng))

    provider
      .mount(element, initialCenter, DEFAULT_ZOOM)
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true))

    // 인증 실패는 mount 성공 "이후" 비동기로 온다 (naver SDK 규약 — lib/map/naver.ts)
    created.subscribeAuthFailure?.(() => alive && setFailed(true))

    return () => {
      alive = false
      provider.destroy()
    }
  }, [created, initialCenter])

  useEffect(() => {
    if (!ready || failed) return
    created.provider.setPins(toPins(places, highlightedId, days))
  }, [created, ready, failed, places, highlightedId, days])

  return (
    // 부모(relative)를 절대 채움으로 덮는다 — h-full 은 flex 아이템 안에서 퍼센트 기준이
    // 확정되지 않아 지도 컨테이너가 0px 이 되고 지도가 백지로 뜬다 (실측, 결정 #42)
    <div className="absolute inset-0 bg-black/5 dark:bg-white/5">
      <div ref={containerRef} className="h-full w-full" data-testid="map-container" />

      {created.kind === 'fake' && (
        <p
          role="status"
          className="absolute inset-x-3 top-3 rounded-xl bg-background/90 px-3 py-2 text-sm text-black/70 shadow-sm dark:text-white/70"
        >
          지도 키를 넣으면 실지도가 보여요. 지금도 담고 고르는 건 그대로 할 수 있어요.
        </p>
      )}

      {failed && created.kind !== 'fake' && (
        <p
          role="alert"
          className="absolute inset-x-3 top-3 rounded-xl bg-background/90 px-3 py-2 text-sm shadow-sm"
        >
          지도를 불러오지 못했어요. NCP 콘솔의 Web 서비스 URL이 지금 주소(포트 포함)와 같은지 확인해 주세요. 담고 고르는 건 그대로 할 수 있어요.
        </p>
      )}
    </div>
  )
}
