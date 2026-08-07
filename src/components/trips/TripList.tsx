'use client'

// FR-014 여행 목록 — 이름·기간·장소 수만 보여주고, 카드를 누르면 캔버스(뎁스 1)로 간다.

import Link from 'next/link'
import type { TripSummary } from '@/lib/trips/api'

export interface TripListProps {
  trips: TripSummary[]
  onCreateFirst: () => void
  /** 지우기는 여기서 시작하고, 되돌리기는 TripsPanel 의 알림 줄이 맡는다 (FR-017) */
  onDelete?: (trip: TripSummary) => void
}

// 벽시계 날짜 문자열을 그대로 다룬다 — 타임존 변환 금지 (05 §규약)
export function formatPeriod(startDate: string, endDate: string): string {
  return `${startDate.replaceAll('-', '.')} ~ ${endDate.replaceAll('-', '.')}`
}

export function TripList({ trips, onCreateFirst, onDelete }: TripListProps) {
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
        <li key={trip.id} className="flex items-center gap-2">
          <Link
            href={`/trip/${trip.id}`}
            className="flex min-h-11 flex-1 flex-col gap-1 rounded-2xl border border-black/10 p-5 transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]"
          >
            <span className="text-lg font-medium">{trip.name}</span>
            <span className="text-sm text-black/60 dark:text-white/60">
              {formatPeriod(trip.start_date, trip.end_date)} · 장소 {trip.place_count}곳
            </span>
          </Link>
          {/* 되돌릴 수 있는 일이라 묻지 않는다 — 대신 지운 뒤 되돌리기를 바로 옆에 둔다 (T-06) */}
          {onDelete && (
            <button
              type="button"
              aria-label={`${trip.name} 삭제하기`}
              onClick={() => onDelete(trip)}
              className="flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm text-black/60 underline underline-offset-4 dark:text-white/60"
            >
              삭제하기
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
