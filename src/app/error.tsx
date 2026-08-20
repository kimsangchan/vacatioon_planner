'use client'

// 막다른 에러 화면을 만들지 않기 위한 공통 경계 — 항상 다음 행동 버튼을 둔다 (SPEC §UI 규칙).

import Link from 'next/link'
import { SignOutButton } from '@/components/auth/SignOutButton'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">화면을 여는 데 실패했어요</h1>
      <p className="text-base text-fg-2">
        잠깐 문제가 있었어요. 다시 열어 볼까요?
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="flex min-h-12 items-center justify-center rounded-l bg-brand px-5 text-[17px] font-bold text-white transition-opacity hover:opacity-90"
        >
          다시 열기
        </button>
        <Link
          href="/"
          className="flex min-h-11 items-center justify-center px-5 text-base underline underline-offset-4"
        >
          여행 목록으로
        </Link>
      </div>

      {/* 로그인 정보가 원인이면 위의 두 길은 같은 실패로 되돌아온다 — 여기서 세션을 버리고 나간다 */}
      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <p className="text-sm text-fg-2">
          다시 열어도 같은 화면이면 로그아웃하고 들어와 주세요.
        </p>
        <SignOutButton />
      </div>
    </main>
  )
}
