'use client'

// FR-014 여행 목록 — 이름·기간·장소 수만 보여주고, 카드를 누르면 캔버스(뎁스 1)로 간다.

import Link from 'next/link'
import type { TripSummary } from '@/lib/trips/api'

export interface TripListProps {
  trips: TripSummary[]
  onCreateFirst: () => void
}

// 벽시계 날짜 문자열을 그대로 다룬다 — 타임존 변환 금지 (05 §규약)
function formatPeriod(startDate: string, endDate: string): string {
  return `${startDate.replaceAll('-', '.')} ~ ${endDate.replaceAll('-', '.')}`
}

export function TripList({ trips, onCreateFirst }: TripListProps) {
  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-black/15 p-8 dark:border-white/20">
        <p className="text-lg font-medium">아직 만든 여행이 없어요.</p>
        <p className="text-base text-black/60 dark:text-white/60">
          날짜만 정하면 하루씩 칸이 생겨요. 장소는 나중에 담아도 괜찮아요.
        </p>
        <button
          type="button"
          onClick={onCreateFirst}
          className="flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          첫 여행 만들기
        </button>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link
            href={`/trip/${trip.id}`}
            className="flex min-h-11 flex-col gap-1 rounded-2xl border border-black/10 p-5 transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]"
          >
            <span className="text-lg font-medium">{trip.name}</span>
            <span className="text-sm text-black/60 dark:text-white/60">
              {formatPeriod(trip.start_date, trip.end_date)} · 장소 {trip.place_count}곳
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
