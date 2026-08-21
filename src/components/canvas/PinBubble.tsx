'use client'

// 데스크톱에서 핀을 누르면 뜨는 **짧은 말풍선** (사용자 요청 — 네이버 지도가 그렇게 한다).
//
// 왜 카드를 통째로 띄우지 않나: 카드에는 메모·예상 금액·사진·일차 고르기가 다 들어 있어
// 조금만 길어져도 핀 옆 공간을 넘겨 스크롤이 생기고, 정작 가리키는 곳을 제가 덮는다.
// 말풍선은 "여기가 어디인지"만 답하고, 손대는 일은 왼쪽 패널로 넘긴다.
//
// 별점을 여기 두는 이유: 협의(#46)는 훑어보며 하는 일이라 자세히 열기 전에 눌러야 값이 있다.

import { StarRating } from '@/components/common/StarRating'
import { CATEGORY_LABEL } from '@/lib/map/provider'
import type { PlaceRow } from '@/lib/trips/bundle'
import type { Stars } from '@/lib/vote/api'

export interface PinBubbleProps {
  place: PlaceRow
  vote?: { mine: number; total: number; voters: number }
  onVote?: (stars: 0 | Stars) => void
  onExpand: () => void
  onClose: () => void
}

export function PinBubble({ place, vote, onVote, onExpand, onClose }: PinBubbleProps) {
  return (
    <div
      data-testid="pin-bubble"
      className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[15px] font-semibold">{place.name}</span>
            <span className="shrink-0 text-[12px] text-fg-3">{CATEGORY_LABEL[place.category]}</span>
          </p>
          <p className="truncate text-[13px] text-fg-3">{place.road_address || place.address}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-s text-fg-3 transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
        >
          <span className="sr-only">말풍선 닫기</span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        {vote ? (
          <StarRating
            label={place.name}
            // 말풍선은 마우스로만 닿는다 — 손가락 크기로 키우면 길어져 #52 를 깬다
            size="compact"
            mine={vote.mine}
            total={vote.total}
            voters={vote.voters}
            onChange={onVote}
          />
        ) : (
          <span />
        )}

        {/* 손대는 일은 왼쪽 패널이 맡는다 — 말풍선은 짧게 둔다 */}
        <button
          type="button"
          onClick={onExpand}
          className="flex min-h-8 shrink-0 items-center rounded-m bg-brand px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          자세히
        </button>
      </div>
    </div>
  )
}
