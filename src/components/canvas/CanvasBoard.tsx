'use client'

// FR-003·FR-005·FR-006·FR-016 캔버스 본체. 데이터(TripBundle)를 받아 보관함·지도·검색·미리보기를
// 한 화면에 묶는다. 레이아웃: 데스크톱 = 좌 리스트(360px) + 우 지도 / 모바일 = 지도 위 + 끌어올리는
// 하단 시트 (docs/design/03 §UI 방향). 라이브러리 없이 CSS 만으로 — 장식 모션은 넣지 않는다.
//
// 미리보기는 라우트를 늘리지 않는다 — 호버·클릭 모두 지도 위에 뜨는 카드다 (SC-003 뎁스 2).
// 클릭 카드는 그 장소 핀에 붙어 지도를 따라 움직인다 — 화면 모서리 고정은 지도 위 카드가 아니다.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createMapProvider, type CreatedMapProvider } from '@/lib/map/create'
import type { DayColor } from '@/lib/map/day-color'
import type { LatLng, PinEventKind, ScreenPoint } from '@/lib/map/provider'
import { prefetchThumbnails } from '@/lib/photo/prefetch'
import { tallyVotes, voterKey, type Stars } from '@/lib/vote/api'
import { photoPublicUrl } from '@/lib/photo/upload'
import type { LegDraft } from '@/lib/timeline/api'
import {
  thumbPaths,
  unassignedPlaces,
  type PhotoRow,
  type PlaceRow,
  type TripBundle,
} from '@/lib/trips/bundle'
import { swapCandidates } from '@/lib/timeline/swap'
import { ListPane, dayLabel } from './ListPane'
import { ManualPlaceForm } from './ManualPlaceForm'
import { MapPane } from './MapPane'
import { PlaceSearchBox, type PlaceDraft } from './PlaceSearchBox'
import { PinBubble } from './PinBubble'
import { PreviewCard } from './PreviewCard'

/** 모바일 하단 메뉴가 고르는 화면 */
type MobileView = 'map' | 'storage' | 'days'

const MOBILE_VIEWS: { view: MobileView; label: string }[] = [
  { view: 'map', label: '지도' },
  { view: 'storage', label: '보관함' },
  { view: 'days', label: '일정' },
]

// 24px 격자·1.5px 스트로크 (결정 #48 — TDS 아이콘 규격). 활성 탭만 채운다.
// 이모지를 쓰지 않는 이유: 플랫폼마다 다른 그림이 오고 색을 우리가 못 정한다
const TAB_ICON_PATH: Record<MobileView, string> = {
  map: 'M9 3.5 3.5 5.8v14.7L9 18.2l6 2.3 5.5-2.3V3.5L15 5.8 9 3.5Zm0 0v14.7m6-12.4v14.7',
  storage: 'M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-3.6L5.5 20.5v-16a1 1 0 0 1 1-1Z',
  days: 'M4.5 6.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-12Zm0 4h15M8.5 3.5v4m7-4v4',
}

function TabIcon({ view, active }: { view: MobileView; active: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6"
      fill={active && view !== 'days' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={TAB_ICON_PATH[view]} />
    </svg>
  )
}

// 말풍선 폭. 가로로 화면을 넘지 않게 가두는 계산에 쓴다
const BUBBLE_WIDTH = 300
// 핀과 말풍선 사이 간격, 위아래로 남겨 둘 여백
const CARD_GAP = 14
const CARD_TOP_INSET = 8
const CARD_BOTTOM_INSET = 64
// 핀 위에 이만큼도 없으면 아래로 뒤집는다
const CARD_MIN_SPACE = 140

// 지도 조작이 멎었다고 볼 때까지 (결정 #48). 끌 때마다 탭이 깜빡이면 그게 더 시끄럽다
const MAP_IDLE_MS = 900

// 손잡이를 이만큼 아래로 끌면 패널을 내린다. 그 아래는 손 떨림이지 의사표시가 아니다
const SWIPE_CLOSE_PX = 60
const SWIPE_SLOP_PX = 8

export interface CanvasBoardProps {
  bundle: TripBundle
  /** 저장한 장소의 id 를 돌려준다 — 저장 직후 그 곳을 지도에 띄운다 (결정 #50) */
  onSave: (draft: PlaceDraft) => Promise<string>
  onAddPhoto?: (placeId: string, file: File) => Promise<void>
  onSetCover?: (placeId: string, photoId: string) => Promise<void>
  onSaveMemo?: (placeId: string, memo: string) => Promise<void>
  /** 예상 금액 (결정 #39) — 실제 지출(Stop)과 다른 값이다 */
  onSaveEstimatedCost?: (placeId: string, estimatedCost: number | null) => Promise<void>
  /** 공개 검색 결과와 별개로 사용자가 직접 적는 여러 줄 영업시간 */
  onSaveOpeningHours?: (placeId: string, openingHours: string) => Promise<void>
  /** 전화번호는 손으로 적는다 — 네이버가 주지 않는다 (2026-08-21 실호출 확인) */
  onSavePhone?: (placeId: string, phone: string) => Promise<void>
  /** 일차 색 고르기 (결정 #41) — 지도 핀 색이 여기서 정해진다 */
  onSetDayColor?: (dayId: string, color: DayColor) => Promise<void>
  // T7-3 — 사진 첨부·삭제·되돌리기 (FR-017·FR-018)
  onAddLegPhoto?: (legId: string, file: File) => Promise<void>
  onRemovePhoto?: (photo: PhotoRow) => Promise<void>
  onRemoveLeg?: (legId: string) => Promise<void>
  onDeletePlace?: (place: PlaceRow) => Promise<void>
  // T7-1·T7-2 — 배치·순서·이동 (FR-007·FR-008)
  onAssignPlace?: (placeId: string, dayId: string) => Promise<void>
  /** 별표 협의 (결정 #46) — 0 은 취소다 */
  onVotePlace?: (placeId: string, stars: 0 | Stars) => Promise<void>
  onUnassignStop?: (stopId: string) => Promise<void>
  onUpdateStop?: (
    stopId: string,
    patch: {
      start_time?: string | null
      cost_amount?: number | null
      confirmed?: boolean
      /** 자리는 두고 장소만 갈아끼운다 (결정 #53) */
      place_id?: string
    },
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
  onSaveOpeningHours,
  onSavePhone,
  onSetDayColor,
  onAddLegPhoto,
  onRemovePhoto,
  onRemoveLeg,
  onDeletePlace,
  onAssignPlace,
  onVotePlace,
  onUnassignStop,
  onUpdateStop,
  onReorderDay,
  onSaveLeg,
  editorSignal,
  createProvider,
}: CanvasBoardProps) {
  const [created] = useState<CreatedMapProvider>(() => (createProvider ?? createMapProvider)())
  // 검색 결과를 "지금 보고 있는 지도" 순으로 세우는 기준점 — 함수를 고정해야 검색이 다시 걸리지 않는다
  const viewCenter = useCallback(() => created.provider.viewCenter(), [created])
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  // 어느 장소의 자리인지 함께 들고 있는다 — 다른 장소를 열었을 때 낡은 위치가 한 프레임 비치지 않게
  const [anchor, setAnchor] = useState<{ id: string; point: ScreenPoint } | null>(null)
  const mapBoxRef = useRef<HTMLDivElement | null>(null)
  // 손잡이 끌기. 끌기로 판정되면 뒤따라오는 click 을 삼킨다 —
  // 안 그러면 내리자마자 토글이 다시 열어 버린다 (결정 #28 에서 배운 순서 문제와 같은 계열)
  const dragStartY = useRef<number | null>(null)
  const draggedRef = useRef(false)
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null)
  // 모바일은 하단 메뉴로 화면을 갈아탄다 (결정 #42 — 네이버 지도식).
  // 기본은 지도지만, 아직 담아둔 곳이 없으면 보관함으로 시작한다:
  // 지도에 볼 것도 없는데 담는 문까지 숨기면 새 여행이 막다른 화면이 된다
  const [mobileView, setMobileView] = useState<MobileView>(() =>
    (bundle.places?.length ?? 0) === 0 ? 'storage' : 'map',
  )
  const sheetOpen = mobileView !== 'map'
  const setSheetOpen = (open: boolean) => setMobileView(open ? 'storage' : 'map')
  // 지도를 만지는 동안은 하단 메뉴를 치워 지도를 넓게 쓴다 (결정 #48 — 네이버 지도식).
  // 조작이 멎고 나서야 돌아온다
  const [mapBusy, setMapBusy] = useState(false)
  // 데스크톱 좌측 패널은 접힌다 — 지도를 넓게 보고 싶을 때가 있다 (결정 #48)
  const [panelOpen, setPanelOpen] = useState(true)
  // 상세를 어디에 낼지 가른다 — 데스크톱은 패널 안, 모바일은 핀에 붙는 카드.
  // 서버 렌더에는 화면 폭이 없으므로 false 로 시작해 mount 후 맞춘다
  const [isDesktop, setIsDesktop] = useState(false)
  // 데스크톱은 두 단계다: 핀을 누르면 **짧은 말풍선**, '자세히'를 눌러야 패널이 상세로 갈아탄다
  // (사용자 요청 — 네이버 지도 방식). 바로 패널을 채우면 목록이 사라져 연달아 담지 못한다
  const [expanded, setExpanded] = useState(false)
  // 이 브라우저의 표 주인 (결정 #46). 서버 렌더에는 localStorage 가 없어 그때만 null 이다 —
  // 별표는 카드를 연 뒤에나 그려지므로 하이드레이션과 부딪히지 않는다
  const [myVoterKey] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : voterKey(window.localStorage),
  )
  // 그 날 실제로 달리는 길 (결정 #49). 타임라인이 받아서 알려 주면 지도가 그린다 —
  // 핀만으로는 어디서 어디로 가는지 안 읽힌다 (사용자 지적)
  const [routeLine, setRouteLine] = useState<{ path: LatLng[]; color: string }>({
    path: [],
    color: '',
  })
  const handleRouteChange = useCallback(
    (path: LatLng[], color: string) => setRouteLine({ path, color }),
    [],
  )
  const [manualLatLng, setManualLatLng] = useState<LatLng | null>(null)
  const [pickHint, setPickHint] = useState(false)
  const [seenSignal, setSeenSignal] = useState(editorSignal)
  const nonceRef = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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

  // 지도 화면에서만 물러난다 — 보관함·일정 화면에서 탭이 사라지면 돌아갈 문이 없어진다
  // 지도를 만지는 **동안만** 물러난다. 카드가 열린 것으로는 숨기지 않는다 —
  // 조작은 순간이지만 카드는 머무는 상태라, 그동안 메뉴를 못 누르면 갇힌다 (사용자 지적)
  const navHidden = mobileView === 'map' && mapBusy

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
      const half = Math.min(BUBBLE_WIDTH, Math.max(width - 16, 0)) / 2
      const x = width > 0 ? Math.min(Math.max(point.x, half + 8), width - half - 8) : point.x
      setAnchor({ id: detailPlace.id, point: { x, y: point.y } })
    }
    update()
    return created.provider.onViewportChange(update)
  }, [detailPlace, created])

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined
    const stop = created.provider.onViewportChange(() => {
      setMapBusy(true)
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => setMapBusy(false), MAP_IDLE_MS)
    })
    return () => {
      if (idle) clearTimeout(idle)
      stop?.()
    }
  }, [created])

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
    setExpanded(false)
    setManualLatLng(null)
    setPickHint(false)
    // 카드는 지도 위에 산다 — 목록에서 눌렀다면 지도로 넘어가야 카드가 보인다.
    // 데스크톱은 사이드바와 지도가 함께 보이므로 이 전환이 눈에 띄지 않는다
    setMobileView('map')
  }

  // 저장한 곳은 보관함에만 두지 않는다 — 후보지도 지도에 있어야 어디쯤인지 읽히고,
  // 그 자리에서 바로 일차를 정할 수 있다 (사용자 요청, 결정 #50).
  //
  // **모바일에서만** 카드를 연다. 거기서는 보관함이 탭 뒤에 있어 저장해도 아무 답이 없지만,
  // 데스크톱은 목록과 지도가 함께 보여 담긴 것이 바로 눈에 든다 — 거기서 카드를 열면
  // 패널이 상세로 갈아타 **여러 곳을 연달아 담지 못한다**(E2E 가 이걸 잡았다).
  async function saveAndOpen(draft: PlaceDraft): Promise<void> {
    const id = await onSave(draft)
    if (id && !isDesktop) openDetail(id)
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

  // 데스크톱에서는 장소 상세가 지도 위 카드가 아니라 **왼쪽 패널 안**으로 들어간다 (사용자 요청).
  // 카드가 커지면 지도 위에서 스크롤이 생겨 정작 지도를 가린다. 모바일은 핀에 붙는 카드 그대로다 (#40·#43).
  // 두 벌 렌더하지 않고 자바스크립트로 하나만 고르는 이유: 이 카드 안에는 id 가 박힌 입력이 있어
  // 문서에 같은 id 가 둘 생기면 라벨이 엉뚱한 입력에 붙는다 (#42 에서 겪은 것)
  const detailVote =
    detailPlace && myVoterKey ? tallyVotes(detailPlace.place_votes ?? [], myVoterKey) : undefined

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

  // 지금 보고 있는 장소가 앉아 있는 자리 (#21 — 여러 번 담았으면 먼저 만나는 것)
  const detailStop = detailPlace
    ? (bundle.days.flatMap((day) => day.stops).find((stop) => stop.place_id === detailPlace.id) ??
      null)
    : null

  const previewCard = detailPlace ? (
          <PreviewCard
            key={detailPlace.id}
            variant="sheet"
            vote={detailVote}
            onVote={onVotePlace ? (stars) => void onVotePlace(detailPlace.id, stars) : undefined}
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
            onSaveOpeningHours={
              onSaveOpeningHours
                ? (openingHours) => onSaveOpeningHours(detailPlace.id, openingHours)
                : undefined
            }
            onSavePhone={onSavePhone ? (phone) => onSavePhone(detailPlace.id, phone) : undefined}
            // 시트는 모바일만이 아니다 — 데스크톱 오른쪽 패널(380px)도 같은 시트라
            // 44px 별 다섯이 패널을 넘었다 (사용자 지적). 마우스로 닿는 자리는 compact
            starSize={isDesktop ? 'compact' : 'touch'}
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
            // 현장 3탭 교체 (결정 #53) — 핀 탭 → 바꾸기 → 후보 탭.
            // 자리를 고르는 규칙은 빼기와 같다: 먼저 만나는 방문 하나 (#21)
            swapOptions={detailStop ? swapCandidates(bundle, detailStop.id) : []}
            onSwap={
              onUpdateStop && detailStop
                ? (placeId) => onUpdateStop(detailStop.id, { place_id: placeId })
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
  ) : null

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
          routePath={routeLine.path}
          routeColor={routeLine.color}
        />

        {/* 모바일 장소 상세 — 핀에 붙는 팝업에서 **아래에서 올라오는 시트**로 바꿨다
            (사용자 요청, 결정 #40 을 뒤집는다). 핀 위에 띄우면 카드가 조금만 길어져도
            핀 옆 공간을 넘겨 스크롤이 생기고, 정작 가리키는 곳을 카드가 덮는다.
            시트는 폭을 다 쓰므로 같은 내용이 짧아지고, 지도 위쪽은 늘 열려 있다 (네이버 지도 방식).
            하단 메뉴 위에서 끝난다 — 메뉴를 덮으면 다시 갇힌다 (#50) */}
        {/* 데스크톱 — 핀에 붙는 짧은 말풍선 (사용자 요청). 펼치면 패널이 이어받는다 */}
        {detailPlace && isDesktop && !expanded && (
          <div
            data-testid="place-card-anchor"
            className="absolute z-40 w-[300px] max-w-[calc(100%-1.5rem)]"
            style={cardStyle}
          >
            <PinBubble
              place={detailPlace}
              vote={detailVote}
              onVote={onVotePlace ? (stars) => void onVotePlace(detailPlace.id, stars) : undefined}
              onExpand={() => setExpanded(true)}
              onClose={closeDetail}
            />
          </div>
        )}

        {detailPlace && !isDesktop && (
          <div
            data-testid="place-sheet"
            className="absolute inset-x-0 bottom-[var(--mobile-nav-h)] z-40 max-h-[70%] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line bg-surface shadow-sheet"
          >
            {previewCard}
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

      {/* 데스크톱 패널 여닫이 — 지도를 넓게 보고 싶을 때가 있다 (결정 #48, 네이버 지도식).
          모바일에는 내지 않는다: 거기서는 하단 메뉴가 이미 같은 일을 한다 */}
      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        aria-expanded={panelOpen}
        aria-label={panelOpen ? '패널 접기' : '패널 펴기'}
        className={`absolute top-1/2 z-30 hidden h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-m border border-l-0 border-line bg-surface text-fg-3 shadow-1 transition-[left] duration-200 hover:text-fg md:flex ${
          panelOpen ? 'left-[360px]' : 'left-0'
        }`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={panelOpen ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'} />
        </svg>
      </button>

      <aside
        inert={isDesktop ? !panelOpen : !sheetOpen}
        // 모바일에서 주인공은 지도다 — 일정 패널은 접혀 있다가 눌러야 나온다 (결정 #42).
        // 데스크톱은 왼쪽 사이드바이고, 접으면 폭이 0 이 된다 (결정 #48).
        // `hidden` 이 아니라 폭을 줄이는 이유: 안에 든 지도·리스트 상태가 그대로 살아 있어야
        // 다시 폈을 때 스크롤 위치와 열어 둔 일차가 유지된다
        className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-line bg-surface transition-[height] duration-200 md:static md:order-1 md:z-0 md:h-auto md:shrink-0 md:rounded-none md:border-t-0 md:border-r md:transition-[width] ${
          sheetOpen ? 'h-[82%]' : 'h-0 overflow-hidden md:overflow-visible'
        } ${panelOpen ? 'md:w-[360px]' : 'md:w-0 md:overflow-hidden md:border-r-0'}`}
      >
        <button
          type="button"
          onPointerDown={(event) => {
            dragStartY.current = event.clientY
            draggedRef.current = false
            // 손잡이 밖으로 나가도 끌기를 계속 받는다 — 캡처가 없으면 손잡이 높이(약 44px)를
            // 벗어나는 순간 pointermove 가 끊겨 60px 임계값에 영영 닿지 못한다 (실측)
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              // jsdom 등 포인터 캡처가 없는 환경 — 끌기 판정은 그대로 동작한다
            }
          }}
          onPointerMove={(event) => {
            if (dragStartY.current === null) return
            const moved = event.clientY - dragStartY.current
            if (moved > SWIPE_SLOP_PX) draggedRef.current = true
            // 아래로만 받는다 — 위로 끄는 건 다른 뜻이다(더 올릴 자리도 없다)
            if (moved > SWIPE_CLOSE_PX) {
              dragStartY.current = null
              setMobileView('map')
            }
          }}
          onPointerUp={() => {
            dragStartY.current = null
          }}
          onPointerCancel={() => {
            dragStartY.current = null
            draggedRef.current = false
          }}
          onClick={() => {
            if (draggedRef.current) {
              draggedRef.current = false
              return
            }
            setMobileView(sheetOpen ? 'map' : 'storage')
          }}
          aria-expanded={sheetOpen}
          className="flex min-h-11 w-full touch-none items-center justify-center py-2 md:hidden"
        >
          <span className="sr-only">{sheetOpen ? '리스트 내리기' : '리스트 올리기'}</span>
          <span aria-hidden className="block h-1 w-10 rounded-full bg-line-strong" />
        </button>

        {/* 데스크톱 장소 상세 — 지도 위에 띄우지 않고 패널이 통째로 갈아탄다 (네이버 지도 방식).
            목록을 지우지 않고 감추는 이유: 되돌아왔을 때 스크롤 위치와 열어 둔 일차가 살아 있어야 한다 */}
        {isDesktop && expanded && previewCard && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-8 md:px-6 md:pt-24">
            <button
              type="button"
              // 펼침만 접는다 — 말풍선은 남긴다. 여기서 선택까지 지우면
              // "어디를 보고 있었는지"를 잃어 지도에서 다시 찾아야 한다
              onClick={() => setExpanded(false)}
              className="flex min-h-9 w-fit items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg-2 transition-colors duration-120 hover:bg-surface-2"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 5 8 12l7 7" />
              </svg>
              목록으로
            </button>
            {previewCard}
          </div>
        )}

        <div
          className={`flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-20 md:px-6 md:pt-28 md:pb-8 ${
            isDesktop && expanded && detailPlace ? 'hidden' : ''
          }`}
        >
          {manualLatLng && (
            <ManualPlaceForm
              latLng={manualLatLng}
              onSubmit={async (draft) => {
                await saveAndOpen(draft)
                setManualLatLng(null)
              }}
              onCancel={() => setManualLatLng(null)}
            />
          )}

          {/* 롱프레스·우클릭은 숨은 동작이라 아무도 발견하지 못한다 — 보이는 문을 둔다.
              강조색은 쓰지 않는다: 이 화면의 주 행동은 여전히 검색 입력이다 (L-09) */}
          <div className="flex flex-col gap-2 border-b border-line pb-5">
            <p className="text-[13px] font-semibold text-fg-3">장소 추가</p>
            <button
              type="button"
              aria-pressed={pickHint}
              onClick={() => {
                setPickHint((on) => !on)
                setManualLatLng(null)
              }}
              className={`tds-button tds-button-m gap-1.5 self-start border px-3 text-sm ${
                pickHint
                  ? 'border-foreground font-medium'
                  : 'border-line hover:bg-surface-2'
              }`}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" />
                <circle cx="12" cy="10" r="2" />
              </svg>
              지도에서 찍기
            </button>

            {pickHint && (
              <p role="status" className="text-sm text-fg-2">
                지도에서 담고 싶은 자리를 눌러 주세요. 길게 누르기(데스크톱은 오른쪽 클릭)로도 돼요.
              </p>
            )}
          </div>

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
            onRouteChange={handleRouteChange}
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
      {/* 넘치면 이 안에서 스크롤한다 — 캔버스가 뷰포트 높이에 고정돼 있어 넘친 만큼은 그냥 잘린다.
            아래는 하단 메뉴 자리를 비워 둔다 */}
        <div className="absolute inset-x-3 top-3 z-30 max-h-[calc(100%-5.5rem)] overflow-y-auto overscroll-contain rounded-2xl bg-background/95 p-2 shadow-3 backdrop-blur md:inset-x-auto md:top-4 md:left-4 md:max-h-[calc(100%-3rem)] md:w-[328px] md:bg-background md:shadow-none md:backdrop-blur-none">
        <PlaceSearchBox
          getCenter={viewCenter}
          onSave={saveAndOpen}
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
          데스크톱은 사이드바가 셋을 한 화면에 담으므로 내지 않는다.
          지도를 만지거나 장소 카드를 연 동안에는 물러난다 (결정 #48) — 지도를 넓게 쓰려고 숨기는 것이라
          `hidden` 이 아니라 밀어 내린다: 되돌아올 때 자리가 튀지 않고, 스크린리더에도 계속 있다 */}
      <nav
        inert={navHidden}
        aria-label="화면 고르기"
        data-hidden={navHidden || undefined}
        className={`absolute inset-x-0 bottom-0 z-50 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] md:hidden ${
          navHidden ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        {MOBILE_VIEWS.map(({ view, label }) => {
          const active = mobileView === view
          return (
            <button
              key={view}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setMobileView(view)}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-120 ${
                active ? 'text-brand-fg' : 'text-fg-3'
              }`}
            >
              <TabIcon view={view} active={active} />
              {label}
            </button>
          )
        })}
      </nav>
    </section>
  )
}
