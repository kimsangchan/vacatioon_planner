'use client'

// FR-007·FR-008 — 하루의 Stop 과 Leg 를 통합 position 순서 하나로 늘어놓는 타임라인.
// 시각은 라벨일 뿐 정렬에 관여하지 않고(결정 #15), position 과 시각이 어긋난 항목에만 경고 배지를
// 붙인다. 아래에는 그날 지출 합계 — Stop(방문) + Leg(이동) 합이다 (결정 #24).
//
// 높이를 아끼는 게 이 화면의 일이다: 한 항목 = 한 줄, 손대는 버튼은 필요할 때만 펼친다
// (SC-004 — 390×844 에서 Stop 8 + Leg 3 이 1스크롤 안에).

import { useId, useMemo, useState } from 'react'
import { ConfirmRow } from '@/components/common/ConfirmRow'
import { PhotoError, photoErrorMessage, photoPublicUrl } from '@/lib/photo/upload'
import { CATEGORY_COLOR_VAR } from '@/lib/map/provider'
import { LEG_MODE_LABEL, type LegDraft } from '@/lib/timeline/api'
import { dayTotal, mergeDayItems, movedItemIds } from '@/lib/timeline/merge'
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
    patch: { start_time: string | null; cost_amount: number | null },
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
}

// 되돌릴 수 없는 일만 여기를 거친다 (E-12 hard delete — Stop 해제·기간 변경은 묻지 않는다)
interface PendingConfirm {
  message: string
  confirmLabel: string
  run: () => Promise<void> | void
}

const ICON_BUTTON =
  'flex size-8 shrink-0 items-center justify-center rounded-full border border-black/15 text-sm dark:border-white/20'

const TEXT_BUTTON =
  'flex min-h-8 items-center rounded-full border border-black/15 px-3 text-xs dark:border-white/20'

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
}: TimelinePaneProps) {
  const ids = useId()
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [editingLegId, setEditingLegId] = useState<string | null>(null)
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
            <span aria-hidden>↑</span>
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            onClick={() => move(id, 1)}
            className={ICON_BUTTON}
            aria-label="아래로 옮기기"
          >
            <span aria-hidden>↓</span>
          </button>
        )}
      </>
    )
  }

  const warningBadge = (
    <span className="rounded-full bg-black/8 px-2 py-0.5 text-xs dark:bg-white/15">
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
        data-time-warning={timeWarning ? 'true' : 'false'}
        className={`flex flex-col gap-2 rounded-xl px-2 py-1.5 ${
          highlighted ? 'bg-black/8 dark:bg-white/12' : ''
        }`}
      >
        <div className="flex items-center gap-2">
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
            className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="truncate text-base font-medium">{place?.name ?? '지운 장소'}</span>
            {time && <span className="shrink-0 text-sm text-black/60 dark:text-white/60">{time}</span>}
            {/* 실제가 적혀 있으면 그것만 보인다. 없을 때만 장소의 예상 단가를 대신 세우되
                "예상"이라고 밝힌다 — 같은 모양으로 나가면 쓴 돈과 구분이 안 된다 (결정 #39) */}
            {stop.cost_amount !== null ? (
              <span className="shrink-0 text-sm text-black/60 dark:text-white/60">
                {formatWon(stop.cost_amount)}
              </span>
            ) : (
              place?.estimated_cost != null && (
                <span className="shrink-0 text-sm text-black/45 dark:text-white/45">
                  예상 {formatWon(place.estimated_cost)}
                </span>
              )
            )}
            {timeWarning && warningBadge}
          </button>

          {moveButtons(stop.id, index)}
          {onUpdateStop && (
            <button
              type="button"
              onClick={() => {
                const opening = editingStopId !== stop.id
                setEditingStopId(opening ? stop.id : null)
                if (opening) onEditorOpen?.()
              }}
              className={ICON_BUTTON}
              aria-label="시각·가격 적기"
            >
              <span aria-hidden>⋯</span>
            </button>
          )}
          {onUnassignStop && (
            <button
              type="button"
              onClick={() => void onUnassignStop(stop.id)}
              className={ICON_BUTTON}
              aria-label="보관함으로 되돌리기"
            >
              <span aria-hidden>↩</span>
            </button>
          )}
        </div>

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
                className="flex min-h-8 items-center rounded-full border border-black/15 px-2 text-xs dark:border-white/20"
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
        data-time-warning={timeWarning ? 'true' : 'false'}
        className="flex flex-col gap-2 rounded-xl border-l-2 border-black/15 px-2 py-1.5 dark:border-white/20"
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-black/60 dark:text-white/60">
            {LEG_MODE_LABEL[leg.mode]}
          </span>
          {/* SC-004 — 시각이 첫 줄을 차지한다. 390px 에서도 출발·도착이 잘리면 안 된다 */}
          <span className="flex-1 text-sm tabular-nums">
            {timeLabel(leg.depart_at)}→{timeLabel(leg.arrive_at)}
            {leg.arrive_day_offset > 0 && ` +${leg.arrive_day_offset}일`}
          </span>
          {leg.cost_amount !== null && (
            <span className="shrink-0 text-sm text-black/60 dark:text-white/60">
              {formatWon(leg.cost_amount)}
            </span>
          )}
          {timeWarning && warningBadge}

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
              className={ICON_BUTTON}
              aria-label="이동 고치기"
            >
              <span aria-hidden>⋯</span>
            </button>
          )}
        </div>

        {/* 지점·예약번호는 둘째 줄로 — 좁은 화면에서 시각을 밀어내지 않게 한다 */}
        {(leg.from_label !== '' || leg.to_label !== '' || leg.booking_ref !== '') && (
          <p className="truncate text-xs text-black/55 dark:text-white/55">
            {leg.from_label} → {leg.to_label}
            {leg.booking_ref !== '' && ` · 예약번호 ${leg.booking_ref}`}
          </p>
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
        <p className="text-sm text-black/60 dark:text-white/60">
          아직 이 날에 담은 게 없어요. 보관함에서 장소를 넣어 보세요.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {items.map((item, index) => {
            const stop = item.kind === 'stop' ? stopById(item.id) : null
            if (stop) return renderStop(stop, index, item.timeWarning)

            const leg = legById(item.id)
            return leg ? renderLeg(leg, index, item.timeWarning) : null
          })}
        </ol>
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

      {hasAmount && (
        <p
          data-testid="day-total"
          className="border-t border-black/10 pt-2 text-sm font-medium dark:border-white/15"
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
    <div className="flex flex-wrap items-end gap-2 pl-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-time`} className="text-xs font-medium">
          방문 시각
        </label>
        <input
          id={`${ids}-time`}
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="min-h-8 rounded-lg border border-black/15 bg-transparent px-2 text-sm outline-none focus:border-foreground dark:border-white/20"
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
          className="min-h-8 w-28 rounded-lg border border-black/15 bg-transparent px-2 text-sm outline-none focus:border-foreground dark:border-white/20"
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
        className="flex min-h-8 items-center rounded-full bg-foreground px-3 text-xs font-medium text-background transition-opacity duration-[120ms] hover:opacity-90"
      >
        시각·가격 저장하기
      </button>
      <button type="button" onClick={onCancel} className={TEXT_BUTTON}>
        그만두기
      </button>
    </div>
  )
}
