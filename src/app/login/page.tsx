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
    <main
      data-testid="login-shell"
      className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-20"
    >
      <section
        role="region"
        aria-label="여행 캔버스 소개"
        className="flex flex-col gap-8 lg:pr-4"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-bold tracking-[0.12em] text-brand-fg">TRIP CANVAS</p>
          <h1 className="max-w-md text-[34px] leading-[1.2] font-bold tracking-[-0.025em] text-pretty sm:text-[40px]">
            가고 싶은 곳을 담고,
            <br />하루의 동선으로 정리해요
          </h1>
          <p className="max-w-md text-base leading-7 text-fg-2 text-pretty">
            지도에서 찾은 장소와 이동, 예상 비용을 한 화면에서 이어 보세요.
          </p>
        </div>

        <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {['장소 찾기', '일정에 담기', '동선 확인'].map((label, index) => (
            <li key={label} className="flex min-h-24 flex-col justify-between bg-surface p-4">
              <span className="tabular text-[13px] font-semibold text-brand-fg">0{index + 1}</span>
              <span className="font-semibold">{label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex w-full max-w-md flex-col gap-7 lg:justify-self-end lg:border-l lg:border-line lg:pl-14">
        <header className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">여행 캔버스에 들어가요</h2>
          <p className="text-base text-fg-2">
            가장 편한 방법으로 로그인하고 계획을 이어가세요.
          </p>
        </header>

        {notice && (
          <p role="status" className="rounded-m bg-surface-2 px-4 py-3 text-sm text-pretty">
            {notice}
          </p>
        )}

        <LoginForm />
      </section>
    </main>
  )
}
