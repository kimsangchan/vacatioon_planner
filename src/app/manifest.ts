// PWA 설치 정보 (결정 #1 — 반응형 웹 + PWA). 아이폰 홈 화면에서 앱처럼 열리게 하는 최소 조건이다.
//
// `display: standalone` 이 사파리 주소창·툴바를 걷어낸다. 이게 없으면 홈 화면에 추가해도
// 그냥 북마크처럼 열려 화면을 두 겹으로 잃는다(주소창 + 하단 툴바) — 지도가 주인공인 앱에서 크다.
//
// start_url 을 '/' 로 두는 이유: 여행 목록이 이 앱의 문이다. 마지막으로 본 여행으로 바로 들어가는
// 편이 편해 보이지만, 그 여행을 지운 뒤에는 열자마자 막다른 화면이 된다 (L-06).

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '여행 캔버스',
    short_name: '여행 캔버스',
    description: '장소를 담고 일차별로 배치해 지도와 타임라인으로 보는 여행 캔버스',
    lang: 'ko',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // 세로 고정: 지도와 타임라인 둘 다 세로로 읽는 화면이라 가로에서 얻을 것이 없다
    orientation: 'portrait',
    background_color: '#ffffff',
    // 상태 표시줄과 스플래시에 쓰이는 색 — 액션 색(브랜드)이 아니라 표면색이다.
    // 브랜드색을 여기 두면 화면 맨 위에 강조색 띠가 상시로 생겨 "화면당 강조 하나"가 깨진다 (#48)
    theme_color: '#ffffff',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
