// 카테고리를 색이 아니라 **모양**으로 알린다 (결정 #41) — 색은 일차가 쓰는 채널이다.
// path 데이터는 지도 핀(HTML 문자열)과 한 곳에서 나온다: lib/map/provider.ts.
// 그래야 지도와 리스트가 같은 모양을 쓴다.

import { CATEGORY_ICON_PATH, CATEGORY_LABEL } from '@/lib/map/provider'
import type { PlaceCategory } from '@/lib/place/category'

export interface CategoryIconProps {
  category: PlaceCategory
  /** 색을 따로 주지 않으면 글자색을 따른다 */
  color?: string
  size?: number
}

export function CategoryIcon({ category, color, size = 16 }: CategoryIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={CATEGORY_LABEL[category]}
      className="shrink-0"
    >
      <path d={CATEGORY_ICON_PATH[category]} />
    </svg>
  )
}
