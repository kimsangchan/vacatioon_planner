'use client'

// FR-002 새 여행 — 이름·시작일·종료일만 받는다. 저장은 create_trip RPC (E-02) 가 하고,
// 여기서는 계약 코드를 사용자 문구 + 다음 행동 버튼으로 옮긴다 (SPEC §UI 규칙).

import { useId, useRef, useState, type FormEvent } from 'react'
import { TripError, tripErrorMessage } from '@/lib/trips/api'

export interface NewTripDraft {
  name: string
  start_date: string
  end_date: string
}

export interface NewTripFormProps {
  onCreate: (draft: NewTripDraft) => Promise<void>
  onCancel: () => void
}

const FIELD =
  'min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-4 text-base outline-none focus:border-foreground dark:border-white/20'

export function NewTripForm({ onCreate, onCancel }: NewTripFormProps) {
  const nameId = useId()
  const startId = useId()
  const endId = useId()
  const startRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), start_date: startDate, end_date: endDate })
    } catch (failure) {
      setError(tripErrorMessage(failure instanceof TripError ? failure.code : 'unknown'))
    } finally {
      setPending(false)
    }
  }

  function retry() {
    setError(null)
    startRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-medium">
          여행 이름
        </label>
        <input
          id={nameId}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="제주 3일"
          required
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={startId} className="text-sm font-medium">
            시작하는 날
          </label>
          <input
            id={startId}
            name="start_date"
            type="date"
            ref={startRef}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
            className={FIELD}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={endId} className="text-sm font-medium">
            끝나는 날
          </label>
          <input
            id={endId}
            name="end_date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
            className={FIELD}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl bg-black/[.04] p-4 dark:bg-white/[.08]">
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="flex min-h-11 items-center justify-center self-start rounded-full border border-black/15 px-5 text-base font-medium transition-colors hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
          >
            날짜 다시 고르기
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-end">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? '만들고 있어요' : '여행 만들기'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-11 items-center justify-center px-5 text-base underline underline-offset-4"
        >
          그만두기
        </button>
      </div>
    </form>
  )
}
