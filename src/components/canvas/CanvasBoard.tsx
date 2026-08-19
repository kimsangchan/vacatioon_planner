'use client'

// FR-003·FR-005·FR-006·FR-016 캔버스 본체. 데이터(TripBundle)를 받아 보관함·지도·검색·미리보기를
// 한 화면에 묶는다. 레이아웃: 데스크톱 = 좌 리스트(360px) + 우 지도 / 모바일 = 지도 위 + 끌어올리는
// 하단 시트 (docs/design/03 §UI 방향). 라이브러리 없이 CSS 만으로 — 장식 모션은 넣지 않는다.
//
// 미리보기는 라우트를 늘리지 않는다 — 호버·클릭 모두 지도 위에 뜨는 카드다 (SC-003 뎁스 2).
// 클릭 카드는 그 장소 핀에 붙어 지도를 따라 움직인다 — 화면 모서리 고정은 지도 위 카드가 아니다.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createMapProvider, type CreatedMapProvider } from '@/lib/map/create'
import type { DayColor } from '@/lib/map/day-color'
import type { LatLng, PinEventKind, ScreenPoint } from '@/lib/map/provider'
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
import { ListPane, dayLabel } from './ListPane'
import { ManualPlaceForm } from './ManualPlaceForm'
import { MapPane } from './MapPane'
import { PlaceSearchBox, type PlaceDraft } from './PlaceSearchBox'
import { PreviewCard } from './PreviewCard'

/** 모바일 하단 메뉴가 고르는 화면 */
type MobileView = 'map' | 'storage' | 'days'

const MOBILE_VIEWS: { view: MobileView; label: string; icon: string }[] = [
  { view: 'map', label: '지도', icon: '🗺' },
  { view: 'storage', label: '보관함', icon: '🔖' },
  { view: 'days', label: '일정', icon: '🗓' },
]

// 카드 폭 (w-80). 가로 가두기 계산에 쓴다
const CARD_WIDTH = 320
// 핀과 카드 사이 간격, 그리고 위아래로 남겨 둘 여백(아래는 하단 메뉴 자리다)
const CARD_GAP = 14
const CARD_TOP_INSET = 8
const CARD_BOTTOM_INSET = 64
// 핀 위에 이만큼도 없으면 아래로 뒤집는다. 카드 높이를 재지 않는 이유:
// 렌더 중에는 ref 를 읽을 수 없고(react-hooks/refs), 재고 다시 그리면 카드가 한 번 튄다.
// 대신 **쓸 수 있는 공간을 max-height 로 넘겨** 카드가 그 안에서 스스로 접히게 한다
const CARD_MIN_SPACE = 200

export interface CanvasBoardProps {
  bundle: TripBundle
  onSave: (draft: PlaceDraft) => Promise<void>
  onAddPhoto?: (placeId: string, file: File) => Promise<void>
  onSetCover?: (placeId: string, photoId: string) => Promise<void>
  onSaveMemo?: (placeId: string, memo: string) => Promise<void>
  /** 예상 금액 (결정 #39) — 실제 지출(Stop)과 다른 값이다 */
  onSaveEstimatedCost?: (placeId: string, estimatedCost: number | null) => Promise<void>
  /** 일차 색 고르기 (결정 #41) — 지도 핀 색이 여기서 정해진다 */
  onSetDayColor?: (dayId: string, color: DayColor) => Promise<void>
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
  /**
   * 캔버스 밖(헤더 기간 폼)에서 편집을 펼친 순간 — 값이 바뀌면 미리보기 시트를 닫는다.
   * 강조 CTA 는 화면당 하나다 (L-09). 시트 상태는 이 컴포넌트가 쥐고 있어 신호로 받는다
   */
  editorSignal?: number
  /** 테스트·스토리에서 FakeMapProvider 를 끼우는 자리 */
  createProvider?: () => CreatedMapProvider
}

export function CanvasBoard({
  bundle,
  onSave,
  onAddPhoto,
  onSetCover,
  onSaveMemo,
  onSaveEstimatedCost,
  onSetDayColor,
  onAddLegPhoto,
  onRemovePhoto,
  onRemoveLeg,
  onDeletePlace,
  onAssignPlace,
  onUnassignStop,
  onUpdateStop,
  onReorderDay,
  onSaveLeg,
  editorSignal,
  createProvider,
}: CanvasBoardProps) {
  const [created] = useState<CreatedMapProvider>(() => (createProvider ?? createMapProvider)())
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  // 어느 장소의 자리인지 함께 들고 있는다 — 다른 장소를 열었을 때 낡은 위치가 한 프레임 비치지 않게
  const [anchor, setAnchor] = useState<{ id: string; point: ScreenPoint } | null>(null)
  const mapBoxRef = useRef<HTMLDivElement | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null)
  // 모바일은 하단 메뉴로 화면을 갈아탄다 (결정 #42 — 네이버 지도식).
  // 기본은 지도지만, 아직 담아둔 곳이 없으면 보관함으로 시작한다:
  // 지도에 볼 것도 없는데 담는 문까지 숨기면 새 여행이 막다른 화면이 된다
  const [mobileView, setMobileView] = useState<MobileView>(() =>
    (bundle.places?.length ?? 0) === 0 ? 'storage' : 'map',
  )
  const sheetOpen = mobileView !== 'map'
  const setSheetOpen = (open: boolean) => setMobileView(open ? 'storage' : 'map')
  const [manualLatLng, setManualLatLng] = useState<LatLng | null>(null)
  const [pickHint, setPickHint] = useState(false)
  const [seenSignal, setSeenSignal] = useState(editorSignal)
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

  // 카드가 붙을 자리 — 지도 컨테이너 기준 픽셀. 지도가 아직 안 떴으면 null 이고,
  // 그때는 지도 아래쪽 가운데로 물러난다(좌표를 모른다고 카드를 감추지는 않는다)
  useEffect(() => {
    if (!detailPlace) return
    const update = () => {
      const point = created.provider.project({
        lat: Number(detailPlace.lat),
        lng: Number(detailPlace.lng),
      })
      const box = mapBoxRef.current
      if (!point) {
        setAnchor(null)
        return
      }
      // 카드가 지도 밖으로 반쯤 걸치지 않게 가로만 가둔다. 폭이 0인 환경(jsdom)에서는 그대로 둔다
      const width = box?.clientWidth ?? 0
      const half = Math.min(CARD_WIDTH, Math.max(width - 16, 0)) / 2
      const x = width > 0 ? Math.min(Math.max(point.x, half + 8), width - half - 8) : point.x
      setAnchor({ id: detailPlace.id, point: { x, y: point.y } })
    }
    update()
    return created.provider.onViewportChange(update)
  }, [detailPlace, created])

  // 이번에 연 장소의 자리일 때만 쓴다
  const anchorPoint = anchor && anchor.id === detailId ? anchor.point : null
  // 위에 놓을지 아래에 놓을지, 그리고 그때 쓸 수 있는 높이가 얼마인지를 함께 정한다.
  // 높이를 안 넘기면 카드가 핀 위 공간보다 커질 때 화면 위로 밀려 나가 제목이 잘린다 (실측)
  const cardStyle = ((): CSSProperties => {
    if (!anchorPoint) {
      return { left: '50%', bottom: CARD_BOTTOM_INSET, transform: 'translateX(-50%)', maxHeight: '70%' }
    }
    const above = anchorPoint.y - CARD_GAP - CARD_TOP_INSET
    if (above >= CARD_MIN_SPACE) {
      return {
        left: anchorPoint.x,
        bottom: `calc(100% - ${anchorPoint.y - CARD_GAP}px)`,
        maxHeight: above,
        transform: 'translateX(-50%)',
      }
    }
    return {
      left: anchorPoint.x,
      top: anchorPoint.y + CARD_GAP,
      maxHeight: `calc(100% - ${anchorPoint.y + CARD_GAP + CARD_BOTTOM_INSET}px)`,
      transform: 'translateX(-50%)',
    }
  })()

  function revealInList(id: string) {
    setHighlightedId(id)
    setScrollTarget({ id, nonce: ++nonceRef.current })
  }

  // 다른 강조가 열리면 시트는 자리를 비운다 — 강조 CTA 는 화면당 하나다 (L-09).
  // 호버 카드가 대신 뜨지 않도록 강조도 함께 거둔다
  function closeDetail() {
    setDetailId(null)
    setHighlightedId(null)
  }

  // 캔버스 밖(헤더 기간 폼)에서 온 신호 — 값이 바뀐 렌더에서 바로 접는다.
  // effect 가 아니라 렌더 중 조정이다 (react.dev — "프롭이 바뀔 때 state 조정하기")
  if (editorSignal !== seenSignal) {
    setSeenSignal(editorSignal)
    setDetailId(null)
    setHighlightedId(null)
  }

  function openDetail(id: string) {
    revealInList(id)
    setDetailId(id)
    setManualLatLng(null)
    setPickHint(false)
    // 카드는 지도 위에 산다 — 목록에서 눌렀다면 지도로 넘어가야 카드가 보인다.
    // 데스크톱은 사이드바와 지도가 함께 보이므로 이 전환이 눈에 띄지 않는다
    setMobileView('map')
  }

  function handlePinEvent(id: string, ev: PinEventKind) {
    if (ev === 'leave') {
      setHighlightedId((current) => (current === id ? null : current))
      return
    }
    if (ev === 'tap') {
      openDetail(id)
      return
    }
    setHighlightedId(id)
  }

  function handleSelect(id: string) {
    const place = byId(id)
    openDetail(id)
    if (place) created.provider.panTo({ lat: Number(place.lat), lng: Number(place.lng) })
  }

  // FR-016 — '지도에서 찍기' 모드를 켠 동안만 그냥 누르기를 받는다.
  // 평소 좌클릭은 지도 이동·핀 선택의 몫이라 여기서 가로채지 않는다.
  function handleMapTap(latLng: LatLng) {
    if (!pickHint) return
    handleLongPress(latLng)
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
      {/* 모바일에서는 세로 flex 의 남은 자리를 전부 먹는다 — h-full 로는 부모 높이가
          확정되지 않아 지도 컨테이너가 0px 이 되고 지도가 백지로 뜬다(실측). 데스크톱은 가로 flex */}
      <div
        ref={mapBoxRef}
        className="relative min-h-0 w-full flex-1 md:order-2 md:h-auto md:flex-1"
      >
        <MapPane
          created={created}
          places={bundle.places}
          days={bundle.days}
          highlightedId={highlightedId}
          onPinEvent={handlePinEvent}
          onLongPress={handleLongPress}
          onMapTap={handleMapTap}
        />

        {detailPlace && (
          <div
            data-testid="place-card-anchor"
            // 핀 바로 위에 뜬다. 위쪽 공간이 모자라면 아래로 뒤집는다 —
            // 지도 밖으로 나가 사라지느니 핀을 잠깐 가리는 편이 낫다
            className="absolute z-40 w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl shadow-xl"
            style={cardStyle}
          >
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
            onSaveEstimatedCost={
              onSaveEstimatedCost
                ? (amount) => onSaveEstimatedCost(detailPlace.id, amount)
                : undefined
            }
            days={bundle.days.map((day) => ({ id: day.id, label: dayLabel(day) }))}
            onAssign={
              onAssignPlace ? (dayId) => onAssignPlace(detailPlace.id, dayId) : undefined
            }
            onUnassign={
              onUnassignStop
                ? async () => {
                    // 같은 장소를 두 번 넣었을 수 있다 (#21) — 먼저 만나는 방문 하나만 뺀다
                    const stop = bundle.days
                      .flatMap((day) => day.stops)
                      .find((item) => item.place_id === detailPlace.id)
                    if (stop) await onUnassignStop(stop.id)
                  }
                : undefined
            }
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
        // 모바일에서 주인공은 지도다 — 일정 패널은 접혀 있다가 눌러야 나온다 (결정 #42).
        // 데스크톱은 그대로 왼쪽 사이드바다 (md:h-auto 가 아래 높이를 무효로 만든다)
        className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-black/10 bg-background transition-[height] duration-200 md:static md:order-1 md:z-0 md:h-auto md:w-[360px] md:shrink-0 md:rounded-none md:border-t-0 md:border-r dark:border-white/15 ${
          sheetOpen ? 'h-[82%]' : 'h-0 overflow-hidden md:overflow-visible'
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileView(sheetOpen ? 'map' : 'storage')}
          aria-expanded={sheetOpen}
          className="flex min-h-8 w-full items-center justify-center py-2 md:hidden"
        >
          <span className="sr-only">{sheetOpen ? '리스트 내리기' : '리스트 올리기'}</span>
          <span aria-hidden className="block h-1 w-10 rounded-full bg-black/25 dark:bg-white/30" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-20 md:pt-28 md:pb-6">
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

          {/* 롱프레스·우클릭은 숨은 동작이라 아무도 발견하지 못한다 — 보이는 문을 둔다.
              강조색은 쓰지 않는다: 이 화면의 주 행동은 여전히 검색 입력이다 (L-09) */}
          <button
            type="button"
            aria-pressed={pickHint}
            onClick={() => {
              setPickHint((on) => !on)
              setManualLatLng(null)
            }}
            className={`flex min-h-9 items-center gap-1.5 self-start rounded-full border px-3 text-sm transition-colors ${
              pickHint
                ? 'border-foreground font-medium'
                : 'border-black/15 hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]'
            }`}
          >
            <span aria-hidden>📍</span>
            지도에서 찍기
          </button>

          {pickHint && (
            <p role="status" className="text-sm text-black/60 dark:text-white/60">
              지도에서 담고 싶은 자리를 눌러 주세요. 길게 누르기(데스크톱은 오른쪽 클릭)로도 돼요.
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
            onEditorOpen={closeDetail}
            onSetDayColor={onSetDayColor}
            focusSection={mobileView === 'map' ? undefined : mobileView}
            onAddLegPhoto={onAddLegPhoto}
            onRemovePhoto={onRemovePhoto}
            onRemoveLeg={onRemoveLeg}
          />
        </div>

      </aside>

      {/* 검색은 화면 맨 위에 상주한다 (결정 #42 — 네이버 지도처럼). 인스턴스는 **하나**다:
          둘을 두면 `id="place-search"` 가 문서에 두 번 생겨 라벨이 엉뚱한 입력에 붙는다(실측).
          모바일은 지도 위에 띄우고, 데스크톱은 사이드바 위쪽 자리에 얹는다 */}
      <div className="absolute inset-x-3 top-3 z-30 rounded-2xl bg-background/95 p-2 shadow-lg backdrop-blur md:inset-x-auto md:top-4 md:left-4 md:w-[328px] md:bg-background md:shadow-none md:backdrop-blur-none">
        <PlaceSearchBox
          onSave={onSave}
          onShowExisting={revealInList}
          onEditorOpen={closeDetail}
          onPickOnMap={() => {
            setPickHint(true)
            setManualLatLng(null)
            setMobileView('map')
          }}
        />
      </div>

      {/* 하단 메뉴 — 지도가 기본 화면이고 보관함·일정은 갈아타는 곳이다 (결정 #42).
          데스크톱은 사이드바가 셋을 한 화면에 담으므로 내지 않는다 */}
      <nav
        aria-label="화면 고르기"
        className="absolute inset-x-0 bottom-0 z-50 flex border-t border-black/10 bg-background md:hidden dark:border-white/15"
      >
        {MOBILE_VIEWS.map(({ view, label, icon }) => (
          <button
            key={view}
            type="button"
            aria-current={mobileView === view ? 'page' : undefined}
            onClick={() => setMobileView(view)}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
              mobileView === view ? 'font-medium' : 'text-black/55 dark:text-white/55'
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              {icon}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </section>
  )
}
