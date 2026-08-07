'use client'

// FR-005 — 보관함(Stop 없는 Place) + 일정에 담긴 곳. 호버·포커스는 지도 핀 강조로,
// 핀 쪽에서 온 강조는 여기서 스크롤로 받는다 (상호 동기화).

import { useEffect, useRef } from 'react'
import { CATEGORY_LABEL } from '@/lib/map/provider'
import type { PlaceRow } from '@/lib/trips/bundle'

export interface ListPaneProps {
  unassigned: PlaceRow[]
  assigned: PlaceRow[]
  highlightedId: string | null
  /** 핀에서 시작한 강조만 스크롤한다 — 리스트 호버로 리스트가 움직이면 어지럽다 */
  scrollTarget: { id: string; nonce: number } | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

export function ListPane({
  unassigned,
  assigned,
  highlightedId,
  scrollTarget,
  onHover,
  onSelect,
}: ListPaneProps) {
  const itemsRef = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (!scrollTarget) return
    itemsRef.current.get(scrollTarget.id)?.scrollIntoView({ block: 'nearest' })
  }, [scrollTarget])

  function renderItem(place: PlaceRow) {
    const highlighted = place.id === highlightedId
    return (
      <li key={place.id}>
        <button
          type="button"
          ref={(node) => {
            if (node) itemsRef.current.set(place.id, node)
            else itemsRef.current.delete(place.id)
          }}
          data-testid={`place-item-${place.id}`}
          data-highlighted={highlighted ? 'true' : 'false'}
          onMouseEnter={() => onHover(place.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(place.id)}
          onBlur={() => onHover(null)}
          onClick={() => onSelect(place.id)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-[120ms] ${
            highlighted ? 'bg-black/8 dark:bg-white/12' : 'hover:bg-black/5 dark:hover:bg-white/10'
          }`}
        >
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ background: `var(--pin-${place.category})` }}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-medium">{place.name}</span>
            <span className="truncate text-sm text-black/55 dark:text-white/55">
              {CATEGORY_LABEL[place.category]} · {place.road_address || place.address}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label={`보관함 ${unassigned.length}곳`} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">보관함 {unassigned.length}곳</h2>
        {unassigned.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            아직 담아둔 곳이 없어요. 위에서 장소를 찾아 보관함에 담아 보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">{unassigned.map(renderItem)}</ul>
        )}
      </section>

      {assigned.length > 0 && (
        <section aria-label={`일정에 담긴 곳 ${assigned.length}곳`} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">일정에 담긴 곳 {assigned.length}곳</h2>
          <ul className="flex flex-col gap-1">{assigned.map(renderItem)}</ul>
        </section>
      )}
    </div>
  )
}
