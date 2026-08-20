import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip Canvas",
  description: "장소를 담고 일차별로 배치해 지도와 타임라인으로 보는 여행 캔버스",
  // 홈 화면에 추가하면 앱처럼 열린다 (결정 #1). capable 이 사파리 크롬을 걷어내고,
  // title 이 아이콘 밑에 붙는 이름이 된다 — 없으면 <title> 이 그대로 잘려 나온다
  appleWebApp: {
    capable: true,
    title: "여행 캔버스",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // 표면색을 그대로 쓴다 — 강조색을 두면 화면 맨 위에 브랜드 띠가 상시로 생긴다 (#48)
  themeColor: "#ffffff",
  // **이게 있어야 env(safe-area-inset-*) 이 값을 낸다.** 하단 메뉴와 지도 경계가
  // `--mobile-nav-h = 3.5rem + safe-area` 로 계산되므로(결정 #50) 없으면 노치 기기에서 어긋난다
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/*
          Pretendard — TDS 의 Toss Product Sans 를 대체한다 (결정 #48).
          동적 서브셋이라 한글 페이지가 필요한 글립만 받아 간다.
          preconnect 를 함께 두는 이유: 서체가 늦으면 첫 화면 글자가 한 번 튄다.
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
