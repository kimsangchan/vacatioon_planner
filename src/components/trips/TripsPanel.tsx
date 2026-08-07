'use client'

// 목록 화면의 상태 보유자. 진입 모달 없이 인라인으로 폼을 펼치고,
// 강조 CTA 는 화면에 항상 하나만 남긴다 (SPEC §UI 규칙).
//
// 삭제는 E-12 소프트 삭제라 되돌릴 수 있다 — 그래서 묻지 않고 지운 뒤 "되돌리기"를 붙인다 (T-06).
// 그 줄은 새로고침하면 사라지므로, 90일 안의 삭제는 아래 접힌 섹션이 이어받는다.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  TripError,
  createTrip,
  restoreTrip,
  softDeleteTrip,
  tripErrorMessage,
  type DeletedTrip,
  type TripSummary,
} from '@/lib/trips/api'
import { DeletedTrips } from './DeletedTrips'
import { NewTripForm, type NewTripDraft } from './NewTripForm'
import { TripList } from './TripList'

export interface TripsPanelProps {
  trips: TripSummary[]
  deletedTrips?: DeletedTrip[]
  onCreate?: (draft: NewTripDraft) => Promise<void>
  onDelete?: (tripId: string) => Promise<void>
  onRestore?: (tripId: string) => Promise<void>
}

async function saveTrip(draft: NewTripDraft): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  // PK 는 클라이언트가 만든다 — 재시도해도 한 행 (05 §멱등성)
  await createTrip(supabase, { id: crypto.randomUUID(), ...draft })
}

const deleteTrip = (tripId: string) => softDeleteTrip(createSupabaseBrowserClient(), tripId)
const undeleteTrip = (tripId: string) => restoreTrip(createSupabaseBrowserClient(), tripId)

export function TripsPanel({
  trips,
  deletedTrips = [],
  onCreate,
  onDelete,
  onRestore,
}: TripsPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [restoredIds, setRestoredIds] = useState<string[]>([])
  const [removed, setRemoved] = useState<TripSummary | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const save = onCreate ?? saveTrip
  const remove = onDelete ?? deleteTrip
  const restore = onRestore ?? undeleteTrip

  async function handleCreate(draft: NewTripDraft) {
    await save(draft)
    setOpen(false)
    router.refresh()
  }

  function report(error: unknown) {
    setFailure(tripErrorMessage(error instanceof TripError ? error.code : 'unknown'))
  }

  // 화면에서 먼저 치우고 서버를 부른다 — 실패하면 있던 자리로 되돌린다
  async function handleDelete(trip: TripSummary) {
    setHiddenIds((ids) => [...ids, trip.id])
    setRemoved(trip)
    setFailure(null)
    try {
      await remove(trip.id)
      router.refresh()
    } catch (error) {
      setHiddenIds((ids) => ids.filter((id) => id !== trip.id))
      setRemoved(null)
      report(error)
    }
  }

  async function handleRestore(tripId: string) {
    setHiddenIds((ids) => ids.filter((id) => id !== tripId))
    setRestoredIds((ids) => [...ids, tripId])
    setRemoved(null)
    setFailure(null)
    try {
      await restore(tripId)
      router.refresh()
    } catch (error) {
      setRestoredIds((ids) => ids.filter((id) => id !== tripId))
      report(error)
    }
  }

  const visible = trips.filter((trip) => !hiddenIds.includes(trip.id))
  const recentlyDeleted = deletedTrips.filter((trip) => !restoredIds.includes(trip.id))

  return (
    <section className="flex flex-col gap-6">
      {open && <NewTripForm onCreate={handleCreate} onCancel={() => setOpen(false)} />}

      {!open && visible.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center justify-center self-start rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          새 여행 만들기
        </button>
      )}

      {removed && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-black/[.04] px-4 py-3 text-sm dark:bg-white/[.08]"
        >
          ‘{removed.name}’ 여행을 지웠어요.
          <button
            type="button"
            onClick={() => void handleRestore(removed.id)}
            className="flex min-h-8 items-center rounded-full border border-black/15 px-3 text-sm font-medium dark:border-white/20"
          >
            되돌리기
          </button>
        </p>
      )}

      {failure && (
        <p role="alert" className="text-sm">
          {failure}
        </p>
      )}

      {(!open || visible.length > 0) && (
        <TripList
          trips={visible}
          onCreateFirst={() => setOpen(true)}
          onDelete={(trip) => void handleDelete(trip)}
        />
      )}

      <DeletedTrips trips={recentlyDeleted} onRestore={(id) => void handleRestore(id)} />
    </section>
  )
}
