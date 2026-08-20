// 브라우저 탭 아이콘 (결정 #1). 이미지 파일을 두지 않고 그려서 내는 이유:
// 색을 디자인 토큰과 같은 값으로 코드에 두면 브랜드색이 바뀔 때 아이콘만 옛 색으로 남지 않는다.

import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#3182F6',
          color: '#ffffff',
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        여
      </div>
    ),
    size,
  )
}
