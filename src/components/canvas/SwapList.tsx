'use client'

// 교체 후보 목록 (결정 #53). 타임라인 행(PC 기본 경로)과 미리보기 시트(모바일 현장 경로)가
// **같은 목록**을 쓴다 — 진입점은 둘이고 고르는 화면은 하나다.

import { CATEGORY_COLOR_VAR } from '@/lib/map/provider'
import { formatDistance } from '@/lib/route/format'
import type { SwapCandidate } from '@/lib/timeline/swap'
import { CategoryIcon } from './CategoryIcon'

// 교체 후보 (결정 #53) — 보관함을 **이 자리 기준**으로 줄 세워 보여 준다.
// 미리 등록해 둔 후보군이 아니다: 담은 것이 곧 후보이고, 순서는 열 때 계산한다.
export function SwapList({
  candidates,
  fromName,
  onHover,
  onPick,
  onCancel,
  cancelClassName,
}: {
  candidates: SwapCandidate[]
  fromName: string
  onHover?: (id: string | null) => void
  onPick: (candidate: SwapCandidate) => Promise<void> | void
  onCancel: () => void
  /** 그만두기 버튼의 옷 — 타임라인과 카드가 서로 다른 어휘를 쓴다 */
  cancelClassName: string
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-line-subtle py-2">
      {candidates.length === 0 ? (
        // 에러·빈 화면엔 항상 다음 행동 (L-06)
        <p className="text-[13px] text-fg-2">
          근처에 담아둔 후보가 없어요. 검색해서 보관함에 담으면 여기 나와요.
        </p>
      ) : (
        <ul aria-label={`${fromName} 자리에 대신 갈 곳`} className="flex flex-col">
          {candidates.map((candidate) => (
            <li key={candidate.place.id}>
              <button
                type="button"
                aria-label={`${candidate.place.name}로 바꾸기`}
                // 목록에서 고르는 동안 지도가 어디인지 알려 준다 (FR-005 상호 하이라이트)
                onMouseEnter={() => onHover?.(candidate.place.id)}
                onMouseLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(candidate.place.id)}
                onBlur={() => onHover?.(null)}
                onClick={() => void onPick(candidate)}
                className="flex min-h-11 w-full items-center gap-2 rounded-m px-1 text-left transition-colors duration-120 hover:bg-surface-2"
              >
                <CategoryIcon
                  category={candidate.place.category}
                  color={CATEGORY_COLOR_VAR[candidate.place.category]}
                  size={14}
                />
                <span className="min-w-0 flex-1 truncate text-[14px]">{candidate.place.name}</span>
                {candidate.placedLabel !== null && (
                  <span className="shrink-0 text-[12px] text-fg-3">{candidate.placedLabel}</span>
                )}
                <span className="tabular shrink-0 text-[12px] text-fg-3">
                  {formatDistance(candidate.meters)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onCancel} className={cancelClassName} aria-label="그만두기">
          그만두기
        </button>
      </div>
    </div>
  )
}
