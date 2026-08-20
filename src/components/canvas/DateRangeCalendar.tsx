'use client'

// FR-015 — 기간을 달력에서 고른다. 날짜 입력 두 칸 대신 범위를 직접 칠하는 방식이다
// (여행 앱들의 관례 — 며칠짜리인지가 한눈에 보인다).
//
// 규칙 셋:
//   ① 지난 날짜는 고를 수 없다 — 여행은 앞으로의 일이고, 과거 기간은 실수로만 만들어진다
//   ② 시작보다 이른 날을 누르면 거기서 다시 시작한다 — 거꾸로 된 기간을 애초에 만들지 않는다
//      (E-14 도 거절하지만, 거절당하기 전에 막는 편이 낫다)
//   ③ 끌기는 데스크톱의 편의일 뿐 — 누르기만으로도 전부 된다(터치·키보드)
//
// 날짜는 'YYYY-MM-DD' 문자열로만 오간다. Date 계산은 lib/trips/calendar 안에 가둔다 (05 §규약).

import { useRef, useState } from 'react'
import {
  koreanMonthLabel,
  monthMatrix,
  nightsLabel,
  shiftMonth,
  todayIso,
  WEEKDAY_LABELS,
} from '@/lib/trips/calendar'

export interface DateRangeCalendarProps {
  start: string
  end: string
  /** 이 날 이전은 고를 수 없다. 기본값 = 오늘 */
  minDate?: string
  onChange: (start: string, end: string) => void
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}

export function DateRangeCalendar({ start, end, minDate, onChange }: DateRangeCalendarProps) {
  const floor = minDate ?? todayIso()
  const [year, month] = start.split('-').map(Number)
  const [view, setView] = useState<[number, number]>([year, month])
  // 한 번 눌러 시작만 정해진 상태. null 이면 다음 누르기가 새 시작이다
  const [anchor, setAnchor] = useState<string | null>(null)
  // 실제 포인터는 mousedown → mouseup → click 순서로 온다(터치의 탭도 같은 순서로 호환
  // 마우스 이벤트를 발사한다). mousedown 에서 선택을 건드리면 두 번 눌러 범위를 잡는 경로가
  // 스스로를 덮어써 하루짜리로 무너진다 — 그래서 여기서는 "끌기 후보"만 기록하고,
  // 실제로 다른 날로 넘어갔을 때(mouseenter)만 끌기로 승격한다.
  const dragFrom = useRef<string | null>(null)
  const dragging = useRef(false)
  const justDragged = useRef(false)

  const weeks = monthMatrix(view[0], view[1])
  const canGoBack = `${view[0]}-${String(view[1]).padStart(2, '0')}-01` > floor

  function pick(iso: string) {
    if (anchor === null || iso < anchor) {
      setAnchor(iso)
      onChange(iso, iso)
      return
    }
    onChange(anchor, iso)
    setAnchor(null)
  }

  // 선택을 바꾸지 않는다 — 아직 탭인지 끌기인지 모른다
  function armDrag(iso: string) {
    dragFrom.current = iso
    dragging.current = false
  }

  function extendDrag(iso: string) {
    const from = dragFrom.current
    if (from === null || iso === from) return
    dragging.current = true
    // 끄는 방향은 자유 — 항상 앞뒤를 바로잡아 넘긴다
    onChange(from < iso ? from : iso, from < iso ? iso : from)
  }

  function endDrag() {
    if (dragging.current) {
      // 끌기 끝에 따라오는 click 은 삼킨다 — pick 이 범위를 다시 접어 버린다
      justDragged.current = true
      setAnchor(null)
    }
    dragFrom.current = null
    dragging.current = false
  }

  function tap(iso: string) {
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    pick(iso)
  }

  function move(delta: number) {
    setView(shiftMonth(view[0], view[1], delta))
  }

  return (
    <div className="flex flex-col gap-3" onMouseLeave={endDrag} onMouseUp={endDrag}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={!canGoBack}
          aria-label="지난 달"
          className="flex size-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-surface-2 disabled:opacity-30"
        >
          ‹
        </button>
        <p data-testid="calendar-month" className="text-sm font-medium">
          {koreanMonthLabel(view[0], view[1])}
        </p>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="다음 달"
          className="flex size-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-surface-2"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1 text-center text-xs text-fg-3">
            {label}
          </span>
        ))}

        {weeks.flat().map((iso, index) => {
          if (iso === null) return <span key={`pad-${index}`} />

          const disabled = iso < floor
          const inRange = iso >= start && iso <= end
          const edge = iso === start || iso === end

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              aria-label={dayLabel(iso)}
              aria-pressed={inRange}
              onClick={() => tap(iso)}
              onMouseDown={() => armDrag(iso)}
              onMouseEnter={() => extendDrag(iso)}
              onMouseUp={endDrag}
              className={[
                'flex min-h-10 items-center justify-center text-sm transition-colors select-none',
                edge ? 'rounded-full bg-brand font-medium text-white' : '',
                inRange && !edge ? 'bg-brand/12' : '',
                !inRange && !disabled ? 'rounded-full hover:bg-surface-2' : '',
                disabled ? 'text-fg-4' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {Number(iso.split('-')[2])}
            </button>
          )
        })}
      </div>

      <p className="text-sm text-fg-2">
        {start.replaceAll('-', '.')} ~ {end.replaceAll('-', '.')} · {nightsLabel(start, end)}
      </p>
    </div>
  )
}
