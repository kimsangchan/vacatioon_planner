'use client'

// 별표 협의 (결정 #46) — "나 여기 가고 싶다"의 세기를 1~3으로 남긴다.
//
// 1~5. 결정 #46 은 3단계로 시작했지만 사용자가 써 보고 5점을 원했다 (0013).
// 이미 준 별을 다시 누르면 취소다 — 지우는 버튼을 따로 두면 별 다섯 옆에 버튼이 여섯이 된다.
//
// 색은 TDS rating 규약을 따른다: 채운 별은 warm(--color-star), 빈 별은 중성 라인.
// 강조색(브랜드)을 쓰지 않는 이유는 이게 액션이 아니라 **데이터**이기 때문이다 (결정 #48).

import type { Stars } from '@/lib/vote/api'

const STAR_PATH =
  'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z'

/** 손가락 최소 타깃 44px (Apple HIG · WCAG 2.5.5) — 24px 다섯이 붙어 있어 못 누른다는 신고를 받았다 */
export const STAR_TAP_CLASS = 'size-11'
/** 마우스 전용 자리(PC 말풍선)만 줄인다 — 말풍선은 짧아야 한다 (#52) */
export const STAR_COMPACT_CLASS = 'size-6'

export interface StarRatingProps {
  /** 내가 준 별 (0 = 아직 안 누름) */
  mine: number
  /** 모두가 준 별의 합 — 옆에 숫자로 낸다 */
  total?: number
  /** 표를 준 사람 수 */
  voters?: number
  label: string
  /** 손가락 화면은 touch(기본), 마우스 전용 말풍선만 compact */
  size?: 'touch' | 'compact'
  onChange?: (stars: 0 | Stars) => void
}

export function StarRating({ mine, total, voters, label, size = 'touch', onChange }: StarRatingProps) {
  const readOnly = !onChange
  // 읽기 전용은 누를 것이 없으니 자리를 차지할 이유도 없다
  const box = readOnly || size === 'compact' ? STAR_COMPACT_CLASS : STAR_TAP_CLASS

  return (
    <div className="flex items-center gap-1.5">
      <div
        role={readOnly ? 'img' : 'radiogroup'}
        aria-label={readOnly ? `${label} 별점 ${mine}점` : `${label} 별점 고르기`}
        className="flex items-center"
      >
        {[1, 2, 3, 4, 5].map((value) => {
          const filled = value <= mine
          const common = `flex ${box} items-center justify-center transition-colors duration-120`
          const icon = (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={`size-[18px] ${filled ? 'text-star' : 'text-line-strong'}`}
              fill={filled ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
            >
              <path d={STAR_PATH} />
            </svg>
          )

          if (readOnly) {
            return (
              <span key={value} className={common}>
                {icon}
              </span>
            )
          }

          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mine === value}
              // 같은 별을 다시 누르면 취소 — 지우는 버튼을 따로 두지 않는다
              aria-label={`${label} 별 ${value}점${mine === value ? ' 취소' : ''}`}
              onClick={() => onChange(mine === value ? 0 : (value as Stars))}
              className={`${common} rounded-s hover:bg-surface-2`}
            >
              {icon}
            </button>
          )
        })}
      </div>
      {typeof total === 'number' && total > 0 && (
        <span className="tabular text-[13px] font-medium text-fg-3">
          {total}
          {typeof voters === 'number' && voters > 1 && (
            <span className="font-normal"> · {voters}명</span>
          )}
        </span>
      )}
    </div>
  )
}
