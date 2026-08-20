'use client'

// 별표 협의 (결정 #46) — "나 여기 가고 싶다"의 세기를 1~3으로 남긴다.
//
// 5단계를 안 쓰는 이유: 3과 4의 차이를 아무도 설명하지 못한다. 가고 싶다 / 꼭 가고 싶다면 족하다.
// 이미 준 별을 다시 누르면 취소다 — 지우는 버튼을 따로 두면 별 셋 옆에 버튼이 넷이 된다.
//
// 색은 TDS rating 규약을 따른다: 채운 별은 warm(--color-star), 빈 별은 중성 라인.
// 강조색(브랜드)을 쓰지 않는 이유는 이게 액션이 아니라 **데이터**이기 때문이다 (결정 #48).

const STAR_PATH =
  'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z'

export interface StarRatingProps {
  /** 내가 준 별 (0 = 아직 안 누름) */
  mine: number
  /** 모두가 준 별의 합 — 옆에 숫자로 낸다 */
  total?: number
  /** 표를 준 사람 수 */
  voters?: number
  label: string
  onChange?: (stars: 0 | 1 | 2 | 3) => void
}

export function StarRating({ mine, total, voters, label, onChange }: StarRatingProps) {
  const readOnly = !onChange

  return (
    <div className="flex items-center gap-1.5">
      <div
        role={readOnly ? 'img' : 'radiogroup'}
        aria-label={readOnly ? `${label} 별점 ${mine}점` : `${label} 별점 고르기`}
        className="flex items-center"
      >
        {[1, 2, 3].map((value) => {
          const filled = value <= mine
          const common = 'flex size-7 items-center justify-center transition-colors duration-120'
          const icon = (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={`size-5 ${filled ? 'text-star' : 'text-line-strong'}`}
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
              onClick={() => onChange(mine === value ? 0 : (value as 1 | 2 | 3))}
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
