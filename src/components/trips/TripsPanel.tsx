'use client'

// 목록 화면의 상태 보유자. 진입 모달 없이 인라인으로 폼을 펼치고,
// 강조 CTA 는 화면에 항상 하나만 남긴다 (SPEC §UI 규칙).
//
// 삭제는 E-12 소프트 삭제라 되돌릴 수 있다 — 그래서 묻지 않고 지운 뒤 "되돌리기"를 붙인다 (T-06).
// 그 줄은 새로고침하면 사라지므로, 90일 안의 삭제는 아래 접힌 섹션이 이어받는다.

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  TripError,
  createDraftTrip,
  restoreTrip,
  softDeleteTrip,
  tripErrorMessage,
  type DeletedTrip,
  type TripSummary,
} from '@/lib/trips/api'
import { todayIso } from '@/lib/trips/calendar'
import { DeletedTrips } from './DeletedTrips'
import { TripList } from './TripList'

export interface TripsPanelProps {
  trips: TripSummary[]
  deletedTrips?: DeletedTrip[]
  /** 새 여행을 만들고 그 id 를 돌려준다 */
  onCreate?: () => Promise<string>
  onDelete?: (tripId: string) => Promise<void>
  onRestore?: (tripId: string) => Promise<void>
}

// FR-002 — 이름도 날짜도 묻지 않는다. 초안을 만들고 곧장 캔버스로 보낸다 (결정 #27).
// 이름은 캔버스 헤더에서, 기간은 그 옆 달력에서 고친다.
async function startTrip(): Promise<string> {
  const trip = await createDraftTrip(createSupabaseBrowserClient(), todayIso())
  return trip.id
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
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [restoredIds, setRestoredIds] = useState<string[]>([])
  const [removed, setRemoved] = useState<TripSummary | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const create = onCreate ?? startTrip
  const remove = onDelete ?? deleteTrip
  const restore = onRestore ?? undeleteTrip

  // state 는 다음 렌더에야 반영된다 — 같은 틱의 두 번째 클릭은 ref 로만 막을 수 있다
  // (막지 못하면 빈 여행이 둘 생긴다)
  async function handleStart() {
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    setFailure(null)
    try {
      router.push(`/trip/${await create()}`)
    } catch (error) {
      startingRef.current = false
      setStarting(false)
      report(error)
    }
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
    <section aria-labelledby="active-trips-heading" className="flex flex-col gap-5">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id="active-trips-heading" className="text-lg font-bold">진행 중인 여행</h2>
          <span className="tabular text-sm text-fg-3">{visible.length}</span>
        </div>
        {visible.length > 0 && (
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={starting}
            className="tds-button tds-button-l bg-brand px-5 text-[15px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {starting ? '여는 중이에요' : '새 여행 만들기'}
          </button>
        )}
      </div>

      {removed && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3 text-[13px]"
        >
          ‘{removed.name}’ 여행을 지웠어요.
          <button
            type="button"
            onClick={() => void handleRestore(removed.id)}
            className="tds-button tds-button-m border border-line px-3 text-sm font-medium"
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

      <TripList
        trips={visible}
        onCreateFirst={() => void handleStart()}
        onDelete={(trip) => void handleDelete(trip)}
      />

      <DeletedTrips trips={recentlyDeleted} onRestore={(id) => void handleRestore(id)} />
    </section>
  )
}
