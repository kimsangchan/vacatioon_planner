'use client'

// FR-015 기간 고치기 — 캔버스 헤더의 기간을 눌러 여는 인라인 폼 (모달 금지 · T-04).
// 저장은 E-14 `update_trip_dates` 하나가 단일 트랜잭션으로 하고, 여기서는 두 가지만 맡는다:
//   ① 담긴 곳이 있는 Day 가 사라질 때 실행 전에 한 번 묻기 (놀람 방지 — 데이터는 보관함에 남는다)
//   ② 계약 에러(validation/date-range)를 다음 행동이 있는 문구로 옮기기

import { useState } from 'react'
import { ConfirmRow } from '@/components/common/ConfirmRow'
import { TripError, tripErrorMessage } from '@/lib/trips/api'
import type { DayRow } from '@/lib/trips/bundle'
import { todayIso } from '@/lib/trips/calendar'
import { shrinkConfirmMessage, shrinkImpact } from '@/lib/trips/dates'
import { DateRangeCalendar } from './DateRangeCalendar'

export interface TripDatesFormProps {
  startDate: string
  endDate: string
  days: DayRow[]
  /** 주입 가능 — 실제 오늘에 기대면 테스트가 내일 깨진다 */
  today?: string
  onSubmit: (startDate: string, endDate: string) => Promise<void>
  onCancel: () => void
}

export function TripDatesForm({
  startDate,
  endDate,
  days,
  today,
  onSubmit,
  onCancel,
}: TripDatesFormProps) {
  const now = today ?? todayIso()
  // 이미 시작한 여행은 제 시작일보다 앞으로 못 가게만 한다 — 오늘로 막으면 고칠 길이 없어진다
  const floor = startDate < now ? startDate : now

  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(endDate)
  const [question, setQuestion] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function save() {
    if (saving) return
    setSaving(true)
    setFailure(null)
    try {
      await onSubmit(start, end)
      setQuestion(null)
    } catch (error) {
      setFailure(tripErrorMessage(error instanceof TripError ? error.code : 'unknown'))
    } finally {
      setSaving(false)
    }
  }

  function submit() {
    // 거꾸로 된 기간은 셀 것도 없다 — 판정은 E-14 에 맡기고 그 문구를 그대로 보여 준다
    const asking = end < start ? null : shrinkConfirmMessage(shrinkImpact(days, start, end))
    if (asking) {
      setQuestion(asking)
      return
    }
    void save()
  }

  function change(nextStart: string, nextEnd: string) {
    setStart(nextStart)
    setEnd(nextEnd)
    setQuestion(null)
    setFailure(null)
  }

  return (
    <form
      data-testid="trip-dates-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-3 rounded-2xl border border-black/10 p-3 dark:border-white/15"
    >
      <DateRangeCalendar start={start} end={end} minDate={floor} onChange={change} />

      {question && (
        <ConfirmRow
          message={question}
          confirmLabel="네, 줄일게요"
          cancelLabel="아니요, 날짜를 고칠게요"
          busy={saving}
          onConfirm={() => void save()}
          onCancel={() => setQuestion(null)}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-foreground px-4 text-base font-medium text-background transition-opacity duration-[120ms] hover:opacity-90 disabled:opacity-40"
        >
          기간 저장하기
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-11 items-center rounded-full border border-black/15 px-4 text-sm dark:border-white/20"
        >
          그만두기
        </button>
      </div>

      {failure && (
        <p role="alert" className="text-sm">
          {failure}
        </p>
      )}
    </form>
  )
}
