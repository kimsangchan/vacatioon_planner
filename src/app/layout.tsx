import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip Canvas",
  description: "장소를 담고 일차별로 배치해 지도와 타임라인으로 보는 여행 캔버스",
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
