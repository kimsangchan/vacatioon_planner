// 없는 주소로 들어와도 막다른 화면을 만들지 않는다 — 항상 다음 행동 버튼을 둔다 (SPEC §UI 규칙).
// 루트 not-found 는 notFound() 호출과 매칭되지 않는 URL 을 함께 받는다 (Next.js 파일 규약).

import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">찾는 페이지가 없어요</h1>
      <p className="text-base text-black/60 dark:text-white/60">
        주소가 바뀌었거나 지워진 화면이에요. 여행 목록에서 다시 찾아 볼까요?
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          여행 목록으로
        </Link>
      </div>
    </main>
  )
}
