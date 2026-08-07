import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: '로그인 · Trip Canvas',
  description: '메일로 받은 6자리 코드로 여행 캔버스에 들어와요.',
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">여행 캔버스에 들어가요</h1>
        <p className="text-base text-black/60 dark:text-white/60">
          쓰던 메일 주소를 넣으면 6자리 코드를 보내 드려요.
        </p>
      </header>

      <LoginForm />
    </main>
  )
}
