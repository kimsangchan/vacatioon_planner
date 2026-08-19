'use client'

// FR-005·FR-007 — 리스트 패널: 보관함(Stop 없는 Place) 하나와 일차 탭 여럿.
// 수집(보관함)과 배치(일차)는 다른 단계라 화면에서도 갈라 둔다 (결정 #8).
// 호버·포커스는 지도 핀 강조로, 핀 쪽에서 온 강조는 여기서 탭 전환+스크롤로 받는다 (상호 동기화).
//
// 배치는 두 번 누르면 끝난다: 항목의 "일정에 넣기" → 일차 고르기. 드래그는 이 화면의 전제가
// 아니다 — 아이폰 한 손 조작이 기준선이다 (FR-007 "드래그 또는 2탭").

import { useEffect, useRef, useState } from 'react'
import { DAY_COLORS, DAY_COLOR_LABEL, dayColorOf, dayColorVar, type DayColor } from '@/lib/map/day-color'
import { CATEGORY_COLOR_VAR, CATEGORY_LABEL } from '@/lib/map/provider'
import { formatWon } from '@/lib/timeline/money'
import { storageEstimate, tripBudget } from '@/lib/trips/budget'
import type { LegDraft } from '@/lib/timeline/api'
import type { DayRow, PhotoRow, PlaceRow } from '@/lib/trips/bundle'
import { CategoryIcon } from './CategoryIcon'
import { TimelinePane } from './TimelinePane'

export interface ListPaneProps {
  unassigned: PlaceRow[]
  days: DayRow[]
  places: PlaceRow[]
  highlightedId: string | null
  /** 핀에서 시작한 강조만 스크롤한다 — 리스트 호버로 리스트가 움직이면 어지럽다 */
  scrollTarget: { id: string; nonce: number } | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onAssignPlace?: (placeId: string, dayId: string) => Promise<void> | void
  onUnassignStop?: (stopId: string) => Promise<void> | void
  onUpdateStop?: (
    stopId: string,
    patch: { start_time: string | null; cost_amount: number | null },
  ) => Promise<void> | void
  onReorderDay?: (dayId: string, orderedIds: string[]) => Promise<void> | void
  onSaveLeg?: (dayId: string, draft: LegDraft, legId?: string) => Promise<void> | void
  /** 편집 폼을 펼친 순간 — 강조 CTA 가 겹치지 않게 캔버스가 미리보기 시트를 닫는다 (L-09) */
  onEditorOpen?: () => void
  onAddLegPhoto?: (legId: string, file: File) => Promise<void> | void
  onRemovePhoto?: (photo: PhotoRow) => Promise<void> | void
  onRemoveLeg?: (legId: string) => Promise<void> | void
  /** 일차 색 고르기 (결정 #41) — 지도 핀 색이 여기서 정해진다 */
  onSetDayColor?: (dayId: string, color: DayColor) => Promise<void> | void
  /** 모바일 하단 메뉴가 고른 구역 (결정 #42). 데스크톱은 넘기지 않는다 — 탭이 이미 다 보인다 */
  focusSection?: 'storage' | 'days'
}

const STORAGE_TAB = 'storage'

export function dayLabel(day: DayRow): string {
  return `${day.position + 1}일차`
}

export function ListPane({
  unassigned,
  days,
  places,
  highlightedId,
  scrollTarget,
  onHover,
  onSelect,
  onAssignPlace,
  onUnassignStop,
  onUpdateStop,
  onReorderDay,
  onSaveLeg,
  onEditorOpen,
  onAddLegPhoto,
  onRemovePhoto,
  onRemoveLeg,
  onSetDayColor,
  focusSection,
}: ListPaneProps) {
  const itemsRef = useRef(new Map<string, HTMLElement>())
  const [tab, setTab] = useState<string>(STORAGE_TAB)
  const [pickingFor, setPickingFor] = useState<string | null>(null)

  // 핀을 누른 곳이 이미 배치돼 있으면 그 일차 탭을 열어 준다 — 강조만 하고 감추면 못 찾는다.
  // nonce 로 "이번 탭(누름)"을 한 번만 처리한다 — 저장 뒤 번들이 갱신됐다고 탭이 튀면 안 된다
  const handledNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!scrollTarget || handledNonce.current === scrollTarget.nonce) return
    handledNonce.current = scrollTarget.nonce
    const inStorage = unassigned.some((place) => place.id === scrollTarget.id)
    const day = inStorage
      ? null
      : days.find((d) => d.stops.some((stop) => stop.place_id === scrollTarget.id))
    setTab(day ? day.id : STORAGE_TAB)
  }, [scrollTarget, unassigned, days])

  // 하단 메뉴가 구역을 고르면 그 구역의 탭으로 옮긴다. 같은 구역을 다시 고르면 건드리지 않는다 —
  // 일차를 골라 둔 사람이 '일정'을 다시 눌렀다고 1일차로 튕기면 안 된다
  const lastSection = useRef<string | null>(null)
  useEffect(() => {
    if (!focusSection || lastSection.current === focusSection) return
    lastSection.current = focusSection
    setTab(focusSection === 'storage' ? STORAGE_TAB : (days[0]?.id ?? STORAGE_TAB))
  }, [focusSection, days])

  // 탭이 바뀐 뒤에야 그 항목이 DOM 에 있다 — 두 값 모두를 의존성으로 둔 이유
  useEffect(() => {
    if (!scrollTarget) return
    itemsRef.current.get(scrollTarget.id)?.scrollIntoView({ block: 'nearest' })
  }, [scrollTarget, tab])

  function registerItem(placeId: string, node: HTMLElement | null) {
    if (node) itemsRef.current.set(placeId, node)
    else itemsRef.current.delete(placeId)
  }

  const activeDay = days.find((day) => day.id === tab) ?? null
  // 여행 전체는 일차에 배치된 것만 센다 — 보관함은 갈지 안 갈지 모르는 후보다 (결정 #39)
  const budget = tripBudget(days, places)
  const storage = storageEstimate(unassigned)

  function renderStorageItem(place: PlaceRow) {
    const highlighted = place.id === highlightedId
    const picking = pickingFor === place.id

    return (
      <li key={place.id} className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={(node) => {
              registerItem(place.id, node)
            }}
            data-testid={`place-item-${place.id}`}
            data-highlighted={highlighted ? 'true' : 'false'}
            onMouseEnter={() => onHover(place.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(place.id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(place.id)}
            className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-[120ms] ${
              highlighted ? 'bg-black/8 dark:bg-white/12' : 'hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            <CategoryIcon category={place.category} color={CATEGORY_COLOR_VAR[place.category]} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-base font-medium">{place.name}</span>
              <span className="truncate text-sm text-black/55 dark:text-white/55">
                {CATEGORY_LABEL[place.category]} · {place.road_address || place.address}
              </span>
            </span>
          </button>

          {onAssignPlace && days.length > 0 && (
            <button
              type="button"
              aria-label={`${place.name} 일정에 넣기`}
              aria-expanded={picking}
              onClick={() => setPickingFor(picking ? null : place.id)}
              className="flex min-h-8 shrink-0 items-center rounded-full border border-black/15 px-3 text-xs dark:border-white/20"
            >
              일정에 넣기
            </button>
          )}
        </div>

        {picking && onAssignPlace && (
          <ul className="flex flex-wrap gap-1 pl-3">
            {days.map((day) => (
              <li key={day.id}>
                <button
                  type="button"
                  aria-label={`${place.name} ${dayLabel(day)}에 넣기`}
                  onClick={() => {
                    setPickingFor(null)
                    void onAssignPlace(place.id, day.id)
                  }}
                  // 고르는 자리는 주 행동이 아니다 — 강조색은 화면당 하나뿐이다 (L-09)
                  className="flex min-h-8 items-center rounded-full border border-black/15 px-3 text-xs font-medium transition-colors duration-[120ms] hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  {dayLabel(day)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  const tabClass = (selected: boolean) =>
    `flex min-h-8 shrink-0 items-center rounded-full px-3 text-sm transition-colors duration-[120ms] ${
      selected
        ? 'bg-black/10 font-medium dark:bg-white/15'
        : 'border border-black/15 dark:border-white/20'
    }`

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label="보관함과 일차 고르기"
        className="flex gap-1 overflow-x-auto pb-1"
        role="group"
      >
        <button
          type="button"
          aria-pressed={tab === STORAGE_TAB}
          onClick={() => setTab(STORAGE_TAB)}
          className={`${tabClass(tab === STORAGE_TAB)} hidden md:flex`}
        >
          보관함 {unassigned.length}
        </button>
        {days.map((day) => (
          <button
            key={day.id}
            type="button"
            aria-pressed={tab === day.id}
            onClick={() => setTab(day.id)}
            className={`${tabClass(tab === day.id)} gap-1.5`}
          >
            <span
              data-testid={`day-color-${day.id}`}
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: dayColorVar(dayColorOf(day)) }}
            />
            {dayLabel(day)}
          </button>
        ))}
      </div>

      {/* 확정(이미 쓴 돈)과 예상을 한 숫자로 합치지 않는다 — 합치면 화면에서 되찾을 수 없다.
          둘의 차이가 곧 "아직 안 정해진 돈"이라 나란히 둘 때 읽힌다 */}
      {budget.hasAny && (
        <dl
          data-testid="trip-budget"
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-black/10 pb-2 text-sm dark:border-white/15"
        >
          <div className="flex items-baseline gap-1.5">
            <dt className="text-black/55 dark:text-white/55">확정</dt>
            <dd className="font-medium">{formatWon(budget.confirmed)}</dd>
          </div>
          {budget.withEstimate !== budget.confirmed && (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-black/55 dark:text-white/55">예상 포함</dt>
              <dd className="font-medium">{formatWon(budget.withEstimate)}</dd>
            </div>
          )}
        </dl>
      )}

      {activeDay && onSetDayColor && (
        <div
          role="group"
          aria-label={`${dayLabel(activeDay)} 색 고르기`}
          className="flex flex-wrap gap-1.5"
        >
          {DAY_COLORS.map((color) => {
            const current = dayColorOf(activeDay) === color
            return (
              <button
                key={color}
                type="button"
                aria-label={`${dayLabel(activeDay)} 색 ${DAY_COLOR_LABEL[color]}로 바꾸기`}
                aria-pressed={current}
                onClick={() => void onSetDayColor(activeDay.id, color)}
                // 고른 색만 테두리로 표시한다 — 강조색은 화면당 하나라 여기에 쓰지 않는다 (L-09)
                className={`size-7 rounded-full transition-transform duration-[120ms] ${
                  current ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''
                }`}
                style={{ background: dayColorVar(color) }}
              />
            )
          })}
        </div>
      )}

      {activeDay ? (
        <TimelinePane
          day={activeDay}
          label={dayLabel(activeDay)}
          places={places}
          highlightedId={highlightedId}
          onHover={onHover}
          onSelect={onSelect}
          onReorder={onReorderDay}
          onUnassignStop={onUnassignStop}
          onUpdateStop={onUpdateStop}
          onSaveLeg={onSaveLeg}
          onEditorOpen={onEditorOpen}
          onAddLegPhoto={onAddLegPhoto}
          onRemovePhoto={onRemovePhoto}
          onRemoveLeg={onRemoveLeg}
          registerItem={registerItem}
        />
      ) : (
        <section aria-label={`보관함 ${unassigned.length}곳`} className="flex flex-col gap-2">
          {/* 보관함 소계는 여행 총액과 섞지 않는다 — 아직 일정에 없는 후보들이다 */}
          {storage.hasAny && (
            <p
              data-testid="storage-estimate"
              className="text-sm text-black/55 dark:text-white/55"
            >
              후보 {storage.count}곳 · 예상 {formatWon(storage.total)}
            </p>
          )}

          {unassigned.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              아직 담아둔 곳이 없어요. 위에서 장소를 찾아 보관함에 담아 보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">{unassigned.map(renderStorageItem)}</ul>
          )}
        </section>
      )}
    </div>
  )
}
