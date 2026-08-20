'use client'

// FR-002 — 여행 이름은 여기서 붙이고 고친다. 새 여행이 이름·날짜를 묻지 않고 시작하므로
// (결정 #27), 이름을 정하는 유일한 자리가 캔버스 헤더다.
//
// 모달을 쓰지 않는다 (T-04) — 제목 자리에서 바로 입력으로 바뀐다.
// 여는 순간 onOpen 으로 알린다: 기간 편집기와 동시에 열리면 강조 CTA 가 둘이 된다 (L-09).

import { useEffect, useRef, useState } from 'react'
import { TripError, tripErrorMessage } from '@/lib/trips/api'

export interface TripTitleFieldProps {
  name: string
  onRename: (name: string) => Promise<void>
  /** 편집기를 열었다 — 헤더가 다른 편집기를 닫을 기회 */
  onOpen?: () => void
  /** 값이 바뀌면 스스로 닫는다 — 헤더의 다른 편집기가 열렸다는 뜻 (L-09) */
  closeSignal?: number
}

export function TripTitleField({ name, onRename, onOpen, closeSignal }: TripTitleFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  // 첫 렌더에는 닫을 것이 없다 — 신호가 "바뀔" 때만 닫는다
  const firstSignal = useRef(true)
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false
      return
    }
    setEditing(false)
    setFailure(null)
  }, [closeSignal])

  function open() {
    setDraft(name)
    setFailure(null)
    setEditing(true)
    onOpen?.()
  }

  function cancel() {
    setEditing(false)
    setFailure(null)
  }

  async function save() {
    if (saving) return
    // 빈 이름은 부르기 전에 막는다 — 왕복해서 같은 답을 받을 이유가 없다
    if (draft.trim() === '') {
      setFailure(tripErrorMessage('validation/name-empty'))
      inputRef.current?.focus()
      return
    }

    setSaving(true)
    setFailure(null)
    try {
      await onRename(draft.trim())
      setEditing(false)
    } catch (error) {
      setFailure(tripErrorMessage(error instanceof TripError ? error.code : 'unknown'))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className="flex min-h-8 min-w-0 items-center gap-1.5 rounded-lg px-1 text-left transition-colors hover:bg-surface-2"
      >
        <h1 className="truncate text-lg font-semibold tracking-tight">{name}</h1>
        <span aria-hidden className="text-sm text-fg-3">
          ✎
        </span>
        <span className="sr-only">이름 고치기</span>
      </button>
    )
  }

  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setFailure(null)
          }}
          aria-label="여행 이름"
          className="min-h-10 min-w-0 flex-1 rounded-m border border-line bg-surface-2 px-3 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex min-h-10 shrink-0 items-center rounded-m bg-brand px-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          이름 저장하기
        </button>
        <button
          type="button"
          onClick={cancel}
          className="flex min-h-9 shrink-0 items-center px-2 text-sm underline underline-offset-4"
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
