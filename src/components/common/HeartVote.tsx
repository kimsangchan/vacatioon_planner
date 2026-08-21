'use client'

// 하트 (결정 #59) — "가고 싶다" 하나만 묻는다.
//
// 별 1~5 는 끝내 "3과 4의 차이를 아무도 설명하지 못한다"(#46)를 풀지 못했다. 3단계로 시작해
// 5단계로 넓혔지만(#52) 같은 문제가 남았고, 두 사람 이상이 주면 합계만으로는 누구 뜻인지도 몰랐다.
// 묻는 것을 하나로 줄이면 **누가 눌렀는지도 한 줄에 들어간다**.
//
// 크기는 #54 의 교훈을 그대로 가져간다: 손가락이 닿는 자리는 44px, 마우스 전용 말풍선만 compact.

/** 손가락 최소 타깃 (Apple HIG · WCAG 2.5.5) */
export const HEART_TAP_CLASS = 'size-11'
/** 마우스 전용 자리(PC 말풍선·좁은 패널) — 말풍선은 짧아야 한다 (#52) */
export const HEART_COMPACT_CLASS = 'size-7'

const HEART_PATH =
  'M12 20.4s-7.5-4.6-7.5-9.7A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 3.1c0 5.1-7.5 9.7-7.5 9.7Z'

export interface HeartVoteProps {
  /** 장소 이름 — 스크린리더가 "무엇에" 누르는지 알아야 한다 */
  label: string
  hearts: number
  mine: boolean
  /** 이름을 적은 사람들. 안 적은 사람은 수에만 든다 */
  names: string[]
  size?: 'touch' | 'compact'
  onToggle?: (hearted: boolean) => void
}

/** "민수·지현 외 1명" — 이름을 적은 사람을 먼저 부르고 나머지는 수로 맺는다 */
export function heartedByLabel(hearts: number, names: string[]): string {
  if (hearts === 0) return ''
  const rest = hearts - names.length
  if (names.length === 0) return `${hearts}명이 가고 싶어해요`
  if (rest <= 0) return `${names.join('·')} 가고 싶어해요`
  return `${names.join('·')} 외 ${rest}명이 가고 싶어해요`
}

export function HeartVote({ label, hearts, mine, names, size = 'touch', onToggle }: HeartVoteProps) {
  const box = onToggle ? (size === 'compact' ? HEART_COMPACT_CLASS : HEART_TAP_CLASS) : HEART_COMPACT_CLASS
  const icon = (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`size-[18px] ${mine ? 'text-heart' : 'text-line-strong'}`}
      fill={mine ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d={HEART_PATH} />
    </svg>
  )
  const said = heartedByLabel(hearts, names)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {onToggle ? (
        <button
          type="button"
          aria-pressed={mine}
          aria-label={mine ? `${label} 가고 싶어요 취소` : `${label} 가고 싶어요`}
          onClick={() => onToggle(!mine)}
          className={`flex ${box} items-center justify-center rounded-s transition-colors duration-120 hover:bg-surface-2`}
        >
          {icon}
        </button>
      ) : (
        <span
          role="img"
          aria-label={hearts === 0 ? `${label} 아직 아무도 안 눌렀어요` : `${label} ${said}`}
          className={`flex ${box} items-center justify-center`}
        >
          {icon}
        </span>
      )}
      {said !== '' && <span className="min-w-0 truncate text-[13px] text-fg-3">{said}</span>}
    </div>
  )
}
