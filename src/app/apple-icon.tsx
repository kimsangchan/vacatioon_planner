// 아이폰 홈 화면 아이콘 (결정 #1). 180×180 이 iOS 가 쓰는 크기다.
//
// 모서리를 둥글리지 않는다 — iOS 가 알아서 스퀘어클로 깎는다. 여기서 미리 깎으면 두 번 깎여
// 흰 모서리가 남는다. 투명 배경도 같은 이유로 쓰지 않는다(검게 채워진다).

import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#3182F6',
          color: '#ffffff',
        }}
      >
        {/* 핀 하나 — 이 앱이 하는 일이 곧 "어디를 갈지 찍는 것"이다 */}
        <svg width="92" height="92" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.6" fill="#ffffff" stroke="none" />
        </svg>
      </div>
    ),
    size,
  )
}
