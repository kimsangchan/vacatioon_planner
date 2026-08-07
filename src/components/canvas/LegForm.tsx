'use client'

// FR-008 — 이동(교통) 입력. 예매처 연동이 없으니 손으로 적는 대신, 적는 일이 가볍게 끝나야 한다
// (결정 #7). 시각은 벽시계 값 그대로 저장한다 — UTC 변환 금지 (05 §규약).
//
// 이 폼의 핵심은 야간 이동이다: 도착이 출발보다 이르면 그냥 저장하지 않고 "다음 날 도착인가요?"를
// 먼저 묻는다. 확인하면 arrive_day_offset=1, 아니면 시각을 고치게 둔다 (PRD 엣지 —
// 확인 없는 역전은 E-08 validation/time-reversed).

import { useId, useState } from 'react'
import {
  LEG_MODE_LABEL,
  LEG_MODE_ORDER,
  TimelineError,
  isTimeReversed,
  timelineErrorMessage,
  type LegDraft,
  type LegMode,
} from '@/lib/timeline/api'
import { formatAmount, formatAmountInput, parseAmountInput } from '@/lib/timeline/money'
import type { LegRow } from '@/lib/trips/bundle'

export interface LegFormProps {
  /** 있으면 고치기, 없으면 새로 담기 */
  leg?: LegRow
  onSubmit: (draft: LegDraft) => Promise<void> | void
  onCancel: () => void
}

const FIELD =
  'min-h-11 rounded-xl border border-black/15 bg-transparent px-3 text-base outline-none focus:border-foreground dark:border-white/20'

// time 입력은 'HH:MM'을 주고받는다. DB 는 'HH:MM:SS'로 돌려주므로 앞 5글자만 쓴다
function toTimeInput(value: string | null | undefined, fallback: string): string {
  return value ? value.slice(0, 5) : fallback
}

export function LegForm({ leg, onSubmit, onCancel }: LegFormProps) {
  const ids = useId()
  const field = (name: string) => `${ids}-${name}`

  const [mode, setMode] = useState<LegMode>(leg?.mode ?? 'train')
  const [departAt, setDepartAt] = useState(toTimeInput(leg?.depart_at, '09:00'))
  const [arriveAt, setArriveAt] = useState(toTimeInput(leg?.arrive_at, '10:00'))
  const [fromLabel, setFromLabel] = useState(leg?.from_label ?? '')
  const [toLabel, setToLabel] = useState(leg?.to_label ?? '')
  const [bookingRef, setBookingRef] = useState(leg?.booking_ref ?? '')
  const [cost, setCost] = useState(leg?.cost_amount == null ? '' : formatAmount(leg.cost_amount))
  const [memo, setMemo] = useState(leg?.memo ?? '')

  const [askNextDay, setAskNextDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const editing = leg !== undefined

  function draft(arriveDayOffset: number): LegDraft {
    return {
      mode,
      depart_at: departAt,
      arrive_at: arriveAt,
      arrive_day_offset: arriveDayOffset,
      from_label: fromLabel.trim(),
      to_label: toLabel.trim(),
      booking_ref: bookingRef.trim(),
      cost_amount: parseAmountInput(cost),
      memo: memo.trim(),
    }
  }

  async function save(arriveDayOffset: number) {
    if (saving) return
    setSaving(true)
    setFailure(null)
    try {
      await onSubmit(draft(arriveDayOffset))
      setAskNextDay(false)
    } catch (error) {
      const code = error instanceof TimelineError ? error.code : 'unknown'
      setFailure(timelineErrorMessage(code))
    } finally {
      setSaving(false)
    }
  }

  function submit() {
    if (isTimeReversed(departAt, arriveAt)) {
      // 확인 전에는 저장하지 않는다 — 야간 이동인지 오타인지는 사람만 안다
      setAskNextDay(true)
      return
    }
    void save(0)
  }

  return (
    <form
      data-testid="leg-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-3 rounded-2xl border border-black/10 p-3 dark:border-white/15"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={field('mode')} className="text-sm font-medium">
          이동 수단
        </label>
        <select
          id={field('mode')}
          value={mode}
          onChange={(event) => setMode(event.target.value as LegMode)}
          className={FIELD}
        >
          {LEG_MODE_ORDER.map((item) => (
            <option key={item} value={item}>
              {LEG_MODE_LABEL[item]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={field('depart')} className="text-sm font-medium">
            출발 시각
          </label>
          <input
            id={field('depart')}
            type="time"
            value={departAt}
            onChange={(event) => {
              setDepartAt(event.target.value)
              setAskNextDay(false)
            }}
            className={FIELD}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={field('arrive')} className="text-sm font-medium">
            도착 시각
          </label>
          <input
            id={field('arrive')}
            type="time"
            value={arriveAt}
            onChange={(event) => {
              setArriveAt(event.target.value)
              setAskNextDay(false)
            }}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={field('from')} className="text-sm font-medium">
            출발 지점
          </label>
          <input
            id={field('from')}
            type="text"
            value={fromLabel}
            autoComplete="off"
            placeholder="용산역"
            onChange={(event) => setFromLabel(event.target.value)}
            className={FIELD}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={field('to')} className="text-sm font-medium">
            도착 지점
          </label>
          <input
            id={field('to')}
            type="text"
            value={toLabel}
            autoComplete="off"
            placeholder="목포역"
            onChange={(event) => setToLabel(event.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={field('booking')} className="text-sm font-medium">
            예약번호
          </label>
          <input
            id={field('booking')}
            type="text"
            value={bookingRef}
            autoComplete="off"
            onChange={(event) => setBookingRef(event.target.value)}
            className={FIELD}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={field('cost')} className="text-sm font-medium">
            가격
          </label>
          <input
            id={field('cost')}
            type="text"
            inputMode="numeric"
            value={cost}
            autoComplete="off"
            placeholder="원 단위로"
            onChange={(event) => setCost(formatAmountInput(event.target.value))}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={field('memo')} className="text-sm font-medium">
          메모
        </label>
        <textarea
          id={field('memo')}
          rows={2}
          value={memo}
          placeholder="좌석·환승 같은 걸 적어 두세요"
          onChange={(event) => setMemo(event.target.value)}
          className="rounded-xl border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground dark:border-white/20"
        />
      </div>

      {askNextDay && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-black/15 p-3 text-sm dark:border-white/20"
        >
          <p>
            도착 {arriveAt} 이 출발 {departAt} 보다 일러요. 다음 날 도착인가요?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(1)}
              className="flex min-h-8 items-center rounded-full bg-foreground px-3 text-sm font-medium text-background transition-opacity duration-[120ms] hover:opacity-90"
            >
              네, 다음 날 도착이에요
            </button>
            <button
              type="button"
              onClick={() => setAskNextDay(false)}
              className="flex min-h-8 items-center rounded-full border border-black/15 px-3 text-sm dark:border-white/20"
            >
              아니요, 시각을 고칠게요
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-foreground px-4 text-base font-medium text-background transition-opacity duration-[120ms] hover:opacity-90 disabled:opacity-40"
        >
          {editing ? '이동 저장하기' : '이동 담기'}
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
