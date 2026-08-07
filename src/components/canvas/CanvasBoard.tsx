'use client'

// FR-003·FR-005·FR-006·FR-016 캔버스 본체. 데이터(TripBundle)를 받아 보관함·지도·검색·미리보기를
// 한 화면에 묶는다. 레이아웃: 데스크톱 = 좌 리스트(360px) + 우 지도 / 모바일 = 지도 위 + 끌어올리는
// 하단 시트 (docs/design/03 §UI 방향). 라이브러리 없이 CSS 만으로 — 장식 모션은 넣지 않는다.
//
// 미리보기는 라우트를 늘리지 않는다 — 호버는 지도 위 카드, 탭·클릭은 리스트 아래 시트다 (SC-003 뎁스 2).

import { useEffect, useMemo, useRef, useState } from 'react'
import { createMapProvider, type CreatedMapProvider } from '@/lib/map/create'
import type { LatLng, PinEventKind } from '@/lib/map/provider'
import { prefetchThumbnails } from '@/lib/photo/prefetch'
import { photoPublicUrl } from '@/lib/photo/upload'
import type { LegDraft } from '@/lib/timeline/api'
import {
  thumbPaths,
  unassignedPlaces,
  type PhotoRow,
  type PlaceRow,
  type TripBundle,
} from '@/lib/trips/bundle'
import { ListPane } from './ListPane'
import { ManualPlaceForm } from './ManualPlaceForm'
import { MapPane } from './MapPane'
import { PlaceSearchBox, type PlaceDraft } from './PlaceSearchBox'
import { PreviewCard } from './PreviewCard'

export interface CanvasBoardProps {
  bundle: TripBundle
  onSave: (draft: PlaceDraft) => Promise<void>
  onAddPhoto?: (placeId: string, file: File) => Promise<void>
  onSetCover?: (placeId: string, photoId: string) => Promise<void>
  onSaveMemo?: (placeId: string, memo: string) => Promise<void>
  // T7-3 — 사진 첨부·삭제·되돌리기 (FR-017·FR-018)
  onAddLegPhoto?: (legId: string, file: File) => Promise<void>
  onRemovePhoto?: (photo: PhotoRow) => Promise<void>
  onRemoveLeg?: (legId: string) => Promise<void>
  onDeletePlace?: (place: PlaceRow) => Promise<void>
  // T7-1·T7-2 — 배치·순서·이동 (FR-007·FR-008)
  onAssignPlace?: (placeId: string, dayId: string) => Promise<void>
  onUnassignStop?: (stopId: string) => Promise<void>
  onUpdateStop?: (
    stopId: string,
    patch: { start_time: string | null; cost_amount: number | null },
  ) => Promise<void>
  onReorderDay?: (dayId: string, orderedIds: string[]) => Promise<void>
  onSaveLeg?: (dayId: string, draft: LegDraft, legId?: string) => Promise<void>
  /** 테스트·스토리에서 FakeMapProvider 를 끼우는 자리 */
  createProvider?: () => CreatedMapProvider
}

export function CanvasBoard({
  bundle,
  onSave,
  onAddPhoto,
  onSetCover,
  onSaveMemo,
  onAddLegPhoto,
  onRemovePhoto,
  onRemoveLeg,
  onDeletePlace,
  onAssignPlace,
  onUnassignStop,
  onUpdateStop,
  onReorderDay,
  onSaveLeg,
  createProvider,
}: CanvasBoardProps) {
  const [created] = useState<CreatedMapProvider>(() => (createProvider ?? createMapProvider)())
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [manualLatLng, setManualLatLng] = useState<LatLng | null>(null)
  const [pickHint, setPickHint] = useState(false)
  const nonceRef = useRef(0)

  const unassigned = useMemo(() => unassignedPlaces(bundle), [bundle])

  // SC-002 의 전제 — 호버 순간에 썸네일을 받으러 가면 400ms 를 못 지킨다 (FR-006)
  const thumbUrls = useMemo(
    () => thumbPaths(bundle).map((path) => photoPublicUrl(path)),
    [bundle],
  )
  useEffect(() => prefetchThumbnails(thumbUrls), [thumbUrls])

  const byId = (id: string | null) =>
    id === null ? null : (bundle.places.find((place: PlaceRow) => place.id === id) ?? null)

  // 빼기 확인 문구의 근거 — 같은 곳을 여러 날에 담을 수 있으므로 Stop 수를 센다 (결정 #21)
  const placedCount = (placeId: string) =>
    bundle.days.reduce(
      (total, day) => total + day.stops.filter((stop) => stop.place_id === placeId).length,
      0,
    )

  const detailPlace = byId(detailId)
  // 카드와 시트는 같은 자리를 두고 다투지 않는다 — 시트가 열려 있으면 카드는 쉰다
  const hoverPlace = detailPlace ? null : byId(highlightedId)

  function revealInList(id: string) {
    setHighlightedId(id)
    setScrollTarget({ id, nonce: ++nonceRef.current })
  }

  function openDetail(id: string) {
    revealInList(id)
    setDetailId(id)
    setManualLatLng(null)
    setPickHint(false)
  }

  function handlePinEvent(id: string, ev: PinEventKind) {
    if (ev === 'leave') {
      setHighlightedId((current) => (current === id ? null : current))
      return
    }
    if (ev === 'tap') {
      openDetail(id)
      setSheetOpen(true)
      return
    }
    setHighlightedId(id)
  }

  function handleSelect(id: string) {
    const place = byId(id)
    openDetail(id)
    if (place) created.provider.panTo({ lat: Number(place.lat), lng: Number(place.lng) })
  }

  // FR-016 — 길게 누른(우클릭한) 자리로 미니 폼을 연다
  function handleLongPress(latLng: LatLng) {
    setManualLatLng(latLng)
    setDetailId(null)
    setPickHint(false)
    setSheetOpen(true)
  }

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <div className="relative h-[48vh] w-full shrink-0 md:order-2 md:h-auto md:flex-1">
        <MapPane
          created={created}
          places={bundle.places}
          highlightedId={highlightedId}
          onPinEvent={handlePinEvent}
          onLongPress={handleLongPress}
        />

        {hoverPlace && (
          <div
            className="absolute top-3 left-3 z-20 hidden w-72 md:block"
            onMouseEnter={() => setHighlightedId(hoverPlace.id)}
            onMouseLeave={() => setHighlightedId(null)}
          >
            <PreviewCard
              key={hoverPlace.id}
              variant="card"
              place={hoverPlace}
              onAddPhoto={
                onAddPhoto ? (file) => onAddPhoto(hoverPlace.id, file) : undefined
              }
            />
          </div>
        )}
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
          {manualLatLng && (
            <ManualPlaceForm
              latLng={manualLatLng}
              onSubmit={async (draft) => {
                await onSave(draft)
                setManualLatLng(null)
              }}
              onCancel={() => setManualLatLng(null)}
            />
          )}

          <PlaceSearchBox
            onSave={onSave}
            onShowExisting={revealInList}
            onPickOnMap={() => {
              setPickHint(true)
              setManualLatLng(null)
            }}
          />

          {pickHint && (
            <p role="status" className="text-sm text-black/60 dark:text-white/60">
              지도에서 그 자리를 길게 눌러 주세요. 데스크톱은 오른쪽 클릭이에요.
            </p>
          )}

          <ListPane
            unassigned={unassigned}
            days={bundle.days}
            places={bundle.places}
            highlightedId={highlightedId}
            scrollTarget={scrollTarget}
            onHover={setHighlightedId}
            onSelect={handleSelect}
            onAssignPlace={onAssignPlace}
            onUnassignStop={onUnassignStop}
            onUpdateStop={onUpdateStop}
            onReorderDay={onReorderDay}
            onSaveLeg={onSaveLeg}
            onAddLegPhoto={onAddLegPhoto}
            onRemovePhoto={onRemovePhoto}
            onRemoveLeg={onRemoveLeg}
          />
        </div>

        {detailPlace && (
          <div className="border-t border-black/10 px-4 py-3 dark:border-white/15">
            {/* 다른 곳을 고르면 새로 시작한다 — 메모 초안이 옆 장소로 새지 않게 */}
            <PreviewCard
              key={detailPlace.id}
              variant="sheet"
              place={detailPlace}
              placedCount={placedCount(detailPlace.id)}
              onClose={() => {
                setDetailId(null)
                setHighlightedId(null)
              }}
              onAddPhoto={onAddPhoto ? (file) => onAddPhoto(detailPlace.id, file) : undefined}
              onSetCover={
                onSetCover ? (photoId) => onSetCover(detailPlace.id, photoId) : undefined
              }
              onRemovePhoto={onRemovePhoto}
              onSaveMemo={onSaveMemo ? (memo) => onSaveMemo(detailPlace.id, memo) : undefined}
              onDeletePlace={
                onDeletePlace
                  ? async () => {
                      await onDeletePlace(detailPlace)
                      // 뺀 자리를 계속 열어 둘 이유가 없다 — 시트를 닫고 리스트로 돌려보낸다
                      setDetailId(null)
                      setHighlightedId(null)
                    }
                  : undefined
              }
            />
          </div>
        )}
      </aside>
    </section>
  )
}
