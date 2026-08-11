import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: '로그인 · Trip Canvas',
  description: '메일로 받은 6자리 코드로 여행 캔버스에 들어와요.',
}

// 왜 이 화면에 와 있는지 한 줄로 알린다 — 설명이 없으면 되돌려보내진 사용자는 이유를 알 수 없다.
// 'session-ended' 는 만료·해지·시계 어긋남 셋 다에 참인 문장이어야 한다 (만료라고 단정하면 사실이 아니다).
// Map 을 쓴다 — 평범한 객체로 조회하면 `?reason=toString` 같은 상속 키가 **함수**를 돌려주고,
// React 가 그걸 렌더하려다 500 으로 죽는다(실측). 주소창은 사용자가 무엇이든 적을 수 있는 자리다.
const NOTICES = new Map<string, string>([
  ['signed-out', '로그아웃했어요. 메일 주소를 넣으면 다시 들어와요.'],
  [
    'session-ended',
    '이 기기의 로그인 정보를 더 쓸 수 없어서 정리했어요. 메일 주소를 넣으면 바로 다시 들어와요.',
  ],
])

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { reason } = await searchParams
  const notice = typeof reason === 'string' ? NOTICES.get(reason) : undefined

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">여행 캔버스에 들어가요</h1>
        <p className="text-base text-black/60 dark:text-white/60">
          쓰던 메일 주소를 넣으면 6자리 코드를 보내 드려요.
        </p>
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-2xl bg-black/[.04] px-4 py-3 text-sm dark:bg-white/[.08]"
        >
          {notice}
        </p>
      )}

      <LoginForm />
    </main>
  )
}
