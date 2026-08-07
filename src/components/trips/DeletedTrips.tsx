'use client'

// FR-017 — 지운 여행은 90일 동안 여기 있다. 알림 줄의 "되돌리기"는 새로고침하면 사라지지만,
// 되돌릴 수 있다는 사실까지 사라지면 안 된다 (T-06 — 삭제·되돌리기 항상 가능).
//
// 목록 아래에 접어 둔다: 평소에는 개수 한 줄, 필요할 때만 펼친다 — 홈의 주인공은 살아있는 여행이다.

import { useState } from 'react'
import type { DeletedTrip } from '@/lib/trips/api'
import { formatPeriod } from './TripList'

export interface DeletedTripsProps {
  trips: DeletedTrip[]
  onRestore: (tripId: string) => void
}

export function DeletedTrips({ trips, onRestore }: DeletedTripsProps) {
  const [open, setOpen] = useState(false)

  if (trips.length === 0) return null

  return (
    <section className="flex flex-col gap-3 border-t border-black/10 pt-5 dark:border-white/15">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-fit items-center gap-2 text-sm text-black/60 underline underline-offset-4 dark:text-white/60"
      >
        최근 삭제한 여행 {trips.length}개 — {open ? '접기' : '보기'}
      </button>

      {open && (
        <ul className="flex flex-col gap-2">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="flex items-center gap-2 rounded-2xl border border-black/10 px-4 py-3 dark:border-white/15"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-medium">{trip.name}</span>
                <span className="truncate text-sm text-black/55 dark:text-white/55">
                  {formatPeriod(trip.start_date, trip.end_date)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`${trip.name} 되돌리기`}
                onClick={() => onRestore(trip.id)}
                className="flex min-h-8 shrink-0 items-center rounded-full border border-black/15 px-3 text-sm dark:border-white/20"
              >
                되돌리기
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
