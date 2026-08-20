'use client'

// FR-007·FR-008 — 하루의 Stop 과 Leg 를 통합 position 순서 하나로 늘어놓는 타임라인.
// 시각은 라벨일 뿐 정렬에 관여하지 않고(결정 #15), position 과 시각이 어긋난 항목에만 경고 배지를
// 붙인다. 아래에는 그날 지출 합계 — Stop(방문) + Leg(이동) 합이다 (결정 #24).
//
// 높이를 아끼는 게 이 화면의 일이다: 한 항목 = 한 줄, 손대는 버튼은 필요할 때만 펼친다
// (SC-004 — 390×844 에서 Stop 8 + Leg 3 이 1스크롤 안에).

import { Fragment, useEffect, useId, useMemo, useState } from 'react'
import { ConfirmRow } from '@/components/common/ConfirmRow'
import { PhotoError, photoErrorMessage, photoPublicUrl } from '@/lib/photo/upload'
import { dayColorOf, dayColorVar } from '@/lib/map/day-color'
import { CATEGORY_COLOR_VAR, type LatLng } from '@/lib/map/provider'
import { LEG_MODE_LABEL, type LegDraft } from '@/lib/timeline/api'
import { dayTotal, mergeDayItems, movedItemIds } from '@/lib/timeline/merge'
import { routeSegments } from '@/lib/timeline/route'
import { formatDistance, formatDuration } from '@/lib/route/format'
import { useDayRoute } from '@/lib/route/use-day-route'
import { formatAmount, formatAmountInput, formatWon, parseAmountInput } from '@/lib/timeline/money'
import type { DayRow, LegRow, PhotoRow, PlaceRow, StopRow } from '@/lib/trips/bundle'
import { CategoryIcon } from './CategoryIcon'
import { LegForm } from './LegForm'

export interface TimelinePaneProps {
  day: DayRow
  /** '1일차' — 탭 라벨과 같은 말을 쓴다 */
  label: string
  places: PlaceRow[]
  highlightedId?: string | null
  onHover?: (id: string | null) => void
  onSelect?: (id: string) => void
  onReorder?: (dayId: string, orderedIds: string[]) => Promise<void> | void
  onUnassignStop?: (stopId: string) => Promise<void> | void
  onUpdateStop?: (
    stopId: string,
    patch: { start_time?: string | null; cost_amount?: number | null; confirmed?: boolean },
  ) => Promise<void> | void
  onSaveLeg?: (dayId: string, draft: LegDraft, legId?: string) => Promise<void> | void
  /** 편집 폼(이동·시각·가격)을 펼친 순간 — 미리보기 시트와 강조 CTA 가 겹치지 않게 위에서 정리한다 (L-09) */
  onEditorOpen?: () => void
  /** FR-018 — 예매 확인·티켓 캡처를 그 Leg 에 담는다 (E-05 leg_id 첨부) */
  onAddLegPhoto?: (legId: string, file: File) => Promise<void> | void
  onRemovePhoto?: (photo: PhotoRow) => Promise<void> | void
  onRemoveLeg?: (legId: string) => Promise<void> | void
  /** 지도 핀에서 온 강조를 이 리스트에서 받는다 (FR-005 상호 하이라이트) */
  registerItem?: (placeId: string, node: HTMLElement | null) => void
  /**
   * 그 날 실제로 달리는 길을 지도에 그리라고 위로 알린다 (결정 #49).
   * 경로를 여기서 받는 이유는 시간 표시가 여기 있어서고, 그리는 곳은 지도다 —
   * 그래서 상태를 들고 있지 않고 알리기만 한다.
   */
  onRouteChange?: (path: LatLng[], color: string) => void
}

// 되돌릴 수 없는 일만 여기를 거친다 (E-12 hard delete — Stop 해제·기간 변경은 묻지 않는다)
interface PendingConfirm {
  message: string
  confirmLabel: string
  run: () => Promise<void> | void
}

// TDS S 사이즈(32px). 보더 대신 호버 표면을 쓴다 — 행마다 테두리가 넷씩 있으면 목록이 시끄럽다
const ICON_BUTTON =
  'tds-button tds-button-s text-fg-3 hover:bg-surface-3 hover:text-fg'

// TDS M 사이즈(40px) · label-m(15/600)
const TEXT_BUTTON =
  'tds-button tds-button-m border border-line px-3.5 text-[13px] font-medium text-fg-2 hover:bg-surface-2'

// 24px 격자·1.5px 스트로크 (결정 #48). ⋯·↩·↑↓ 를 글자로 쓰면 서체마다 크기·중심이 달라진다
const ROW_ICON: Record<'more' | 'undo' | 'up' | 'down', string> = {
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  undo: 'M9 14 4 9l5-5M4 9h9a7 7 0 0 1 0 14h-3',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
}

function RowIcon({ name }: { name: keyof typeof ROW_ICON }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ROW_ICON[name]} />
    </svg>
  )
}

function timeLabel(value: string | null): string | null {
  return value ? value.slice(0, 5) : null
}

export function TimelinePane({
  day,
  label,
  places,
  highlightedId,
  onHover,
  onSelect,
  onReorder,
  onUnassignStop,
  onUpdateStop,
  onSaveLeg,
  onEditorOpen,
  onAddLegPhoto,
  onRemovePhoto,
  onRemoveLeg,
  registerItem,
  onRouteChange,
}: TimelinePaneProps) {
  const ids = useId()
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [editingLegId, setEditingLegId] = useState<string | null>(null)
  const [actionsForId, setActionsForId] = useState<string | null>(null)
  const [addingLeg, setAddingLeg] = useState(false)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const items = useMemo(() => mergeDayItems(day.stops, day.legs), [day.stops, day.legs])
  const total = dayTotal(day.stops, day.legs)
  const hasAmount = [...day.stops, ...day.legs].some((item) => item.cost_amount !== null)

  const stopById = (id: string) => day.stops.find((stop) => stop.id === id)
  const legById = (id: string) => day.legs.find((leg) => leg.id === id)
  const placeOf = (stop: StopRow) =>
    stop.place ?? places.find((place) => place.id === stop.place_id) ?? null

  // 목록 순서대로 이은 방문들 — 이 순서가 곧 이동 순서다 (#15). 순서를 바꾸면 좌표 목록이
  // 바뀌고 이동시간도 새로 받는다. 지운 장소가 끼어 좌표를 모르면 아예 묻지 않는다
  const routeItems = items.filter(
    (item) => item.kind !== 'stop' || stopById(item.id)?.confirmed !== false,
  )
  const orderedStops = routeItems.flatMap((item) =>
    item.kind === 'stop' ? (day.stops.find((stop) => stop.id === item.id) ?? []) : [],
  )
  const stopPlaces = orderedStops.map((stop) => placeOf(stop))
  const routePoints = stopPlaces.every((place) => place !== null)
    ? stopPlaces.map((place) => ({ lat: Number(place!.lat), lng: Number(place!.lng) }))
    : []
  const route = useDayRoute(routePoints)
  // 사이에 적어 둔 이동이 있는 구간은 추정치를 내지 않는다 — 기록이 추정보다 세다
  const shownSegments = new Set(
    routeSegments(routeItems).map((segment) => `${segment.fromStopId}->${segment.toStopId}`),
  )
  // 안내 문구는 경로가 세는 것과 **같은 기준**으로 센다 — 미확정은 경로에서 빠지므로(#47)
  // 확정 하나 + 미확정 하나인 날은 여전히 "한 곳 더"가 맞다
  const confirmedStopCount = day.stops.filter((stop) => stop.confirmed !== false).length
  const stopOrder = new Map(orderedStops.map((stop, index) => [stop.id, index]))

  // 길이 도착하면 지도에 그린다. 일차 색을 함께 넘겨 선과 핀이 같은 일차로 읽히게 한다
  const routePath = route?.path
  const dayLine = dayColorVar(dayColorOf(day))
  useEffect(() => {
    onRouteChange?.(routePath ?? [], dayLine)
  }, [routePath, dayLine, onRouteChange])

  function travelRow(fromStopId: string, toStopId: string) {
    if (!route || !shownSegments.has(`${fromStopId}->${toStopId}`)) return null
    const section = route.sections[stopOrder.get(fromStopId) ?? -1]
    if (!section) return null

    return (
      <li
        key={`travel-${fromStopId}`}
        data-testid={`travel-${fromStopId}`}
        className="flex items-center gap-2 pl-6 text-sm text-fg-3"
      >
        <span aria-hidden>↓</span>
        차로 {formatDuration(section.durationSeconds)} · {formatDistance(section.distanceMeters)}
      </li>
    )
  }

  function move(id: string, delta: -1 | 1) {
    void onReorder?.(day.id, movedItemIds(items, id, delta))
  }

  // 사진 쪽 실패는 폼 밖에서 일어난다 — 삼키지 않고 한 줄로 알린다 (SPEC §UI 규칙)
  async function run(action: () => Promise<void> | void): Promise<void> {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      await action()
      setPending(null)
    } catch (error) {
      setFailure(
        error instanceof PhotoError
          ? photoErrorMessage(error.code)
          : '방금 한 일을 저장하지 못했어요. 잠시 뒤에 다시 해 주세요.',
      )
    } finally {
      setBusy(false)
    }
  }

  function moveButtons(id: string, index: number) {
    return (
      <>
        {index > 0 && (
          <button
            type="button"
            onClick={() => move(id, -1)}
            className={ICON_BUTTON}
            aria-label="위로 옮기기"
          >
            <RowIcon name="up" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            onClick={() => move(id, 1)}
            className={ICON_BUTTON}
            aria-label="아래로 옮기기"
          >
            <RowIcon name="down" />
          </button>
        )}
      </>
    )
  }

  const warningBadge = (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
      <span aria-hidden>⚠</span>
      <span className="sr-only">시각 순서 확인</span>
    </span>
  )

  function renderStop(stop: StopRow, index: number, timeWarning: boolean) {
    const place = placeOf(stop)
    const time = timeLabel(stop.start_time)
    const highlighted = place !== null && place.id === highlightedId

    return (
      <li
        key={stop.id}
        data-testid={`day-item-${stop.id}`}
        data-ui="list-row"
        data-lines="2"
        data-time-warning={timeWarning ? 'true' : 'false'}
        className={`flex flex-col border-b border-line-subtle transition-colors duration-120 last:border-b-0 ${
          highlighted ? 'bg-surface-2' : ''
        }`}
      >
        <div className="flex min-h-11 items-center gap-3 px-1">
          {/* 확정 체크 (결정 #47) — 경로는 확정된 것만 잇는다. 기본이 확정이라 이 체크는
              "아직 고민 중"을 표시하려고 푸는 자리다. TDS checkbox 규격: 22px · radius 6 */}
          {onUpdateStop && (
            <button
              type="button"
              role="checkbox"
              aria-checked={stop.confirmed}
              aria-label={`${place?.name ?? '지운 장소'} 확정`}
              onClick={() => void onUpdateStop(stop.id, { confirmed: !stop.confirmed })}
              className={`relative flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-120 after:absolute after:-inset-2.5 ${
                stop.confirmed
                  ? 'border-transparent bg-brand text-white'
                  : 'border-line-strong bg-surface text-transparent'
              }`}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </button>
          )}
          {/* 색은 일차의 채널이 됐다 (결정 #41) — 여기서 카테고리는 모양으로 알린다 */}
          {place ? (
            <CategoryIcon
              category={place.category}
              color={CATEGORY_COLOR_VAR[place.category]}
              size={14}
            />
          ) : (
            <span aria-hidden className="size-3.5 shrink-0" />
          )}
          {/* TDS list-row — 타이틀 한 줄, 시각·금액은 그 아래 보조 줄로 내린다.
              한 줄에 다 붙이면 이름이 잘리고 어디까지가 이름인지 읽히지 않는다 */}
          <button
            type="button"
            ref={(node) => {
              registerItem?.(stop.place_id, node)
            }}
            onMouseEnter={() => onHover?.(stop.place_id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(stop.place_id)}
            onBlur={() => onHover?.(null)}
            onClick={() => onSelect?.(stop.place_id)}
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 text-left"
          >
            <span
              className={`truncate text-[17px] leading-tight font-semibold ${
                stop.confirmed ? '' : 'text-fg-3'
              }`}
            >
              {place?.name ?? '지운 장소'}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] leading-tight text-fg-3">
              {time && <span className="tabular shrink-0">{time}</span>}
              {place && <span className="truncate">{place.road_address || place.address}</span>}
              {!stop.confirmed && <span className="shrink-0">아직 고민 중</span>}
              {timeWarning && warningBadge}
            </span>
          </button>

          {/* 실제가 적혀 있으면 그것만 보인다. 없을 때만 예상 단가를 오른쪽 보조값으로 둔다. */}
          {stop.cost_amount !== null ? (
            <span className="tabular shrink-0 text-[13px] font-medium text-fg-2">
              {formatWon(stop.cost_amount)}
            </span>
          ) : (
            place?.estimated_cost != null && (
              <span className="tabular shrink-0 text-[12px] text-fg-3">
                예상 {formatWon(place.estimated_cost)}
              </span>
            )
          )}

          {/* 순서 바꾸기는 접지 않는다 — 목록 순서가 곧 이동 순서이고(#15) 경로·이동시간이 여기 달려 있어
              가장 자주 만지는 손질이다. 접어 두면 두 번 눌러야 한 칸 움직인다 (사용자 지적) */}
          {onReorder && moveButtons(stop.id, index)}

          {(onUpdateStop || onUnassignStop) && (
            <button
              type="button"
              aria-expanded={actionsForId === stop.id}
              onClick={() => {
                setActionsForId((current) => (current === stop.id ? null : stop.id))
              }}
              className={ICON_BUTTON}
              aria-label={`${place?.name ?? '지운 장소'} 작업 ${actionsForId === stop.id ? '닫기' : '열기'}`}
            >
              <RowIcon name="more" />
            </button>
          )}
        </div>

        {actionsForId === stop.id && (
          <div className="flex flex-wrap items-center justify-end gap-1 border-t border-line-subtle py-2">
            {onUpdateStop && (
              <button
                type="button"
                onClick={() => {
                  const opening = editingStopId !== stop.id
                  setEditingStopId(opening ? stop.id : null)
                  if (opening) onEditorOpen?.()
                }}
                className={TEXT_BUTTON}
                aria-label="시각·가격 적기"
              >
                시각·가격
              </button>
            )}
            {onUnassignStop && (
              <button
                type="button"
                onClick={() => void onUnassignStop(stop.id)}
                className={TEXT_BUTTON}
                aria-label="보관함으로 되돌리기"
              >
                보관함으로
              </button>
            )}
          </div>
        )}

        {editingStopId === stop.id && onUpdateStop && (
          <StopEditor
            stop={stop}
            onSave={async (patch) => {
              await onUpdateStop(stop.id, patch)
              setEditingStopId(null)
            }}
            onCancel={() => setEditingStopId(null)}
          />
        )}
      </li>
    )
  }

  // FR-018 — 담아 둔 캡처는 항상 보이고(예매번호를 눈으로 맞춰 보는 게 쓰임새다),
  // 담기·지우기는 이동을 고칠 때만 펼친다 (SC-004 — 한 항목 한 줄)
  function legPhotos(leg: LegRow, editing: boolean) {
    const photos = leg.photos ?? []
    if (photos.length === 0) return null

    return (
      <ul className="flex flex-wrap gap-2 pl-1">
        {photos.map((photo) => (
          <li key={photo.id} className="flex flex-col items-center gap-1">
            <a
              href={photoPublicUrl(photo.storage_path)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="예매 캡처 크게 보기"
            >
              {/* next/image 를 쓰지 않는 이유는 PreviewCard 와 같다 — 이미 줄여 올린 WebP 다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPublicUrl(photo.thumb_path)}
                alt="예매 캡처"
                width={56}
                height={56}
                className="size-14 rounded-lg object-cover"
              />
            </a>
            {editing && onRemovePhoto && (
              <button
                type="button"
                onClick={() =>
                  setPending({
                    message: '이 캡처를 지울까요? 되돌릴 수 없어요.',
                    confirmLabel: '캡처 지우기',
                    run: () => onRemovePhoto(photo),
                  })
                }
                className="flex min-h-8 items-center rounded-full border border-line px-2 text-xs"
              >
                예매 캡처 지우기
              </button>
            )}
          </li>
        ))}
      </ul>
    )
  }

  function legActions(leg: LegRow) {
    const inputId = `${ids}-leg-photo-${leg.id}`

    return (
      <div className="flex flex-wrap items-center gap-2">
        {onAddLegPhoto && (
          <>
            <label
              htmlFor={inputId}
              className={`${TEXT_BUTTON} cursor-pointer font-medium`}
            >
              예매 캡처 담기
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = '' // 같은 파일을 다시 골라도 change 가 오도록
                if (file) void run(() => onAddLegPhoto(leg.id, file))
              }}
              className="sr-only"
            />
          </>
        )}
        {onRemoveLeg && (
          <button
            type="button"
            onClick={() =>
              setPending({
                message: '이 이동을 지울까요? 담아 둔 캡처도 함께 사라져요 — 되돌릴 수 없어요.',
                confirmLabel: '지우기',
                run: () => onRemoveLeg(leg.id),
              })
            }
            className={TEXT_BUTTON}
          >
            이동 지우기
          </button>
        )}
      </div>
    )
  }

  function renderLeg(leg: LegRow, index: number, timeWarning: boolean) {
    const editing = editingLegId === leg.id

    return (
      <li
        key={leg.id}
        data-testid={`day-item-${leg.id}`}
        data-ui="list-row"
        data-lines="2"
        data-time-warning={timeWarning ? 'true' : 'false'}
        className="flex flex-col border-b border-line-subtle last:border-b-0"
      >
        <div className="flex min-h-11 items-center gap-3 px-1">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h15m-4-4 4 4-4 4" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span className="truncate text-[15px] leading-tight font-semibold">
              {LEG_MODE_LABEL[leg.mode]} · <span className="tabular">{timeLabel(leg.depart_at)}→{timeLabel(leg.arrive_at)}</span>
              {leg.arrive_day_offset > 0 && ` +${leg.arrive_day_offset}일`}
            </span>
            <span className="truncate text-[13px] leading-tight text-fg-3">
              {leg.from_label || '출발지 미정'} → {leg.to_label || '도착지 미정'}
              {leg.booking_ref !== '' && ` · 예약번호 ${leg.booking_ref}`}
              {timeWarning && <> · {warningBadge}</>}
            </span>
          </span>
          {leg.cost_amount !== null && (
            <span className="tabular shrink-0 text-[13px] font-medium text-fg-2">
              {formatWon(leg.cost_amount)}
            </span>
          )}
          {(onReorder || onSaveLeg || onAddLegPhoto || onRemoveLeg) && (
            <button
              type="button"
              aria-expanded={actionsForId === leg.id}
              onClick={() => {
                setActionsForId((current) => (current === leg.id ? null : leg.id))
              }}
              className={ICON_BUTTON}
              aria-label={`이동 작업 ${actionsForId === leg.id ? '닫기' : '열기'}`}
            >
              <RowIcon name="more" />
            </button>
          )}
        </div>

        {actionsForId === leg.id && (
          <div className="flex flex-wrap items-center justify-end gap-1 border-t border-line-subtle py-2">
            {moveButtons(leg.id, index)}
            {(onSaveLeg || onAddLegPhoto || onRemoveLeg) && (
              <button
                type="button"
                onClick={() => {
                  setEditingLegId(editing ? null : leg.id)
                  setAddingLeg(false)
                  setPending(null)
                  setFailure(null)
                  if (!editing) onEditorOpen?.()
                }}
                className={TEXT_BUTTON}
                aria-label="이동 고치기"
              >
                이동 고치기
              </button>
            )}
          </div>
        )}

        {legPhotos(leg, editing)}

        {editing && onSaveLeg && (
          <LegForm
            leg={leg}
            onSubmit={async (draft) => {
              await onSaveLeg(day.id, draft, leg.id)
              setEditingLegId(null)
            }}
            onCancel={() => setEditingLegId(null)}
          />
        )}

        {editing && (onAddLegPhoto || onRemoveLeg) && legActions(leg)}

        {editing && pending && (
          <ConfirmRow
            message={pending.message}
            confirmLabel={pending.confirmLabel}
            busy={busy}
            onConfirm={() => void run(pending.run)}
            onCancel={() => setPending(null)}
          />
        )}

        {editing && failure && (
          <p role="status" className="text-sm">
            {failure}
          </p>
        )}
      </li>
    )
  }

  return (
    <section aria-label={`${label} 일정`} className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-sm text-fg-2">
          아직 이 날에 담은 게 없어요. 보관함에서 장소를 넣어 보세요.
        </p>
      ) : (
        <ol className="flex flex-col border-y border-line">
          {items.map((item, index) => {
            const routeIndex = routeItems.findIndex((routeItem) => routeItem.id === item.id)
            const next = routeIndex >= 0 ? routeItems[routeIndex + 1] : undefined
            // 다음 항목도 방문이면 그 사이에 이동시간을 끼운다
            const travel =
              item.kind === 'stop' && next?.kind === 'stop' ? travelRow(item.id, next.id) : null

            const stop = item.kind === 'stop' ? stopById(item.id) : null
            if (stop) {
              return (
                <Fragment key={item.id}>
                  {renderStop(stop, index, item.timeWarning)}
                  {travel}
                </Fragment>
              )
            }

            const leg = legById(item.id)
            return leg ? renderLeg(leg, index, item.timeWarning) : null
          })}
        </ol>
      )}

      {/* 이동시간은 자동이다 (결정 #45) — 두 곳이 이어져야 구간이 생긴다.
          침묵하면 사용자가 "내가 직접 넣어야 하나" 하고 이동 적기를 누른다 (실제 피드백) */}
      {confirmedStopCount === 1 && (
        <p className="text-[13px] text-fg-3">
          한 곳 더 담으면 사이 이동시간을 자동으로 알려드려요.
        </p>
      )}

      {onSaveLeg &&
        (addingLeg ? (
          <LegForm
            onSubmit={async (draft) => {
              await onSaveLeg(day.id, draft, undefined)
              setAddingLeg(false)
            }}
            onCancel={() => setAddingLeg(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setAddingLeg(true)
              setEditingLegId(null)
              onEditorOpen?.()
            }}
            className={`${TEXT_BUTTON} w-fit`}
          >
            이동 적기
          </button>
        ))}

      {onSaveLeg && !addingLeg && (
        <p className="text-[13px] text-fg-3">
          예매한 기차·버스·비행기를 적는 자리예요. 차로 가는 시간은 위에 저절로 나와요.
        </p>
      )}

      {hasAmount && (
        <p
          data-testid="day-total"
          className="border-t border-line pt-2 text-sm font-medium"
        >
          오늘 {formatWon(total)}
        </p>
      )}
    </section>
  )
}

// 시각·가격은 선택 입력이라 평소엔 접어 둔다 — 한 줄 높이를 지키려는 것 (SC-004)
function StopEditor({
  stop,
  onSave,
  onCancel,
}: {
  stop: StopRow
  onSave: (patch: { start_time: string | null; cost_amount: number | null }) => Promise<void>
  onCancel: () => void
}) {
  const ids = useId()
  const [time, setTime] = useState(timeLabel(stop.start_time) ?? '')
  const [cost, setCost] = useState(stop.cost_amount === null ? '' : formatAmount(stop.cost_amount))
  const [saving, setSaving] = useState(false)

  return (
    <div className="flex flex-wrap items-end gap-2 py-2 pl-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-time`} className="text-xs font-medium">
          방문 시각
        </label>
        <input
          id={`${ids}-time`}
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="tds-field min-h-10 rounded-m border border-line bg-transparent px-3 text-sm outline-none focus:border-brand"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-cost`} className="text-xs font-medium">
          가격
        </label>
        <input
          id={`${ids}-cost`}
          type="text"
          inputMode="numeric"
          value={cost}
          autoComplete="off"
          placeholder="원 단위로"
          onChange={(event) => setCost(formatAmountInput(event.target.value))}
          className="tds-field min-h-10 w-28 rounded-m border border-line bg-transparent px-3 text-sm outline-none focus:border-brand"
        />
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          if (saving) return
          setSaving(true)
          void onSave({
            start_time: time === '' ? null : time,
            cost_amount: parseAmountInput(cost),
          }).finally(() => setSaving(false))
        }}
        className="tds-button tds-button-m bg-brand px-3 text-[13px] font-semibold text-white hover:opacity-90"
      >
        시각·가격 저장하기
      </button>
      <button type="button" onClick={onCancel} className={TEXT_BUTTON}>
        그만두기
      </button>
    </div>
  )
}
