'use client'

// FR-003·FR-005 캔버스 본체. 데이터(TripBundle)를 받아 보관함·지도·검색을 한 화면에 묶는다.
// 레이아웃: 데스크톱 = 좌 리스트(360px) + 우 지도 / 모바일 = 지도 위 + 끌어올리는 하단 시트
// (docs/design/03 §UI 방향). 라이브러리 없이 CSS 만으로 — 장식 모션은 넣지 않는다.

import { useMemo, useRef, useState } from 'react'
import { createMapProvider, type CreatedMapProvider } from '@/lib/map/create'
import type { PinEventKind } from '@/lib/map/provider'
import { assignedPlaces, unassignedPlaces, type PlaceRow, type TripBundle } from '@/lib/trips/bundle'
import { ListPane } from './ListPane'
import { MapPane } from './MapPane'
import { PlaceSearchBox, type PlaceDraft } from './PlaceSearchBox'

export interface CanvasBoardProps {
  bundle: TripBundle
  onSave: (draft: PlaceDraft) => Promise<void>
  /** 테스트·스토리에서 FakeMapProvider 를 끼우는 자리 */
  createProvider?: () => CreatedMapProvider
}

export function CanvasBoard({ bundle, onSave, createProvider }: CanvasBoardProps) {
  const [created] = useState<CreatedMapProvider>(() => (createProvider ?? createMapProvider)())
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const nonceRef = useRef(0)

  const unassigned = useMemo(() => unassignedPlaces(bundle), [bundle])
  const assigned = useMemo(() => assignedPlaces(bundle), [bundle])

  function revealInList(id: string) {
    setHighlightedId(id)
    setScrollTarget({ id, nonce: ++nonceRef.current })
  }

  function handlePinEvent(id: string, ev: PinEventKind) {
    if (ev === 'leave') {
      setHighlightedId((current) => (current === id ? null : current))
      return
    }
    if (ev === 'tap') {
      revealInList(id)
      setSheetOpen(true)
      return
    }
    setHighlightedId(id)
  }

  function handleSelect(id: string) {
    const place = bundle.places.find((candidate: PlaceRow) => candidate.id === id)
    setHighlightedId(id)
    if (place) created.provider.panTo({ lat: Number(place.lat), lng: Number(place.lng) })
  }

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <div className="h-[48vh] w-full shrink-0 md:order-2 md:h-auto md:flex-1">
        <MapPane
          created={created}
          places={bundle.places}
          highlightedId={highlightedId}
          onPinEvent={handlePinEvent}
        />
      </div>

      <aside
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl border-t border-black/10 bg-background transition-[height] duration-200 md:static md:order-1 md:z-0 md:h-auto md:w-[360px] md:shrink-0 md:rounded-none md:border-t-0 md:border-r dark:border-white/15 ${
          sheetOpen ? 'h-[82%]' : 'h-[46%]'
        }`}
      >
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          aria-expanded={sheetOpen}
          className="flex min-h-8 w-full items-center justify-center py-2 md:hidden"
        >
          <span className="sr-only">{sheetOpen ? '리스트 내리기' : '리스트 올리기'}</span>
          <span aria-hidden className="block h-1 w-10 rounded-full bg-black/25 dark:bg-white/30" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6 md:pt-5">
          <PlaceSearchBox onSave={onSave} onShowExisting={revealInList} />
          <ListPane
            unassigned={unassigned}
            assigned={assigned}
            highlightedId={highlightedId}
            scrollTarget={scrollTarget}
            onHover={setHighlightedId}
            onSelect={handleSelect}
          />
        </div>
      </aside>
    </section>
  )
}
