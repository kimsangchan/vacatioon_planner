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
      <div className="flex flex-col items-start gap-4 rounded-2xl bg-surface-2 p-7 sm:p-9">
        <p className="text-lg font-medium">아직 만든 여행이 없어요.</p>
        <p className="text-base text-fg-2">
          누르면 바로 지도가 열려요. 이름과 기간은 나중에 붙여도 괜찮아요.
        </p>
        <button
          type="button"
          onClick={onCreateFirst}
          className="tds-button tds-button-xl bg-brand px-6 text-[17px] font-bold text-white hover:opacity-90"
        >
          첫 여행 만들기
        </button>
      </div>
    )
  }

  return (
    <ul aria-label="진행 중인 여행 목록" className="divide-y divide-line border-b border-line">
      {trips.map((trip) => (
        <li
          key={trip.id}
          className="group flex items-center gap-1 transition-colors duration-120 hover:bg-surface-2"
        >
          <Link
            href={`/trip/${trip.id}`}
            className="flex min-h-20 flex-1 flex-col justify-center gap-1 px-1 py-4 text-left sm:px-3"
          >
            <span className="text-[18px] leading-tight font-semibold">{trip.name}</span>
            <span className="tabular text-[13px] leading-tight text-fg-3">
              {formatPeriod(trip.start_date, trip.end_date)} · 장소 {trip.place_count}곳
            </span>
          </Link>
          {/* 되돌릴 수 있는 일이라 묻지 않는다 — 대신 지운 뒤 되돌리기를 바로 옆에 둔다 (T-06) */}
          {onDelete && (
            <button
              type="button"
              aria-label={`${trip.name} 삭제하기`}
              onClick={() => onDelete(trip)}
              className="tds-button tds-button-m shrink-0 px-3 text-[13px] font-medium text-fg-3 hover:bg-surface-3 hover:text-danger"
            >
              삭제하기
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
