// FR-014 여행 목록 (뎁스 0). 조회는 E-13 계약 그대로 — deleted_at 필터 + 살아있는 장소 수.

import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { TripsPanel } from '@/components/trips/TripsPanel'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listDeletedTrips, listTrips } from '@/lib/trips/api'

export default async function HomePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // proxy.ts 가 먼저 걸러 주지만, 데이터에 가까운 곳에서 한 번 더 확인한다
  if (!user) redirect('/login')

  // 지운 여행도 함께 읽는다 — 90일 안이면 되돌릴 수 있어야 한다 (FR-017)
  const [trips, deletedTrips] = await Promise.all([
    listTrips(supabase),
    listDeletedTrips(supabase),
  ])

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-8">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-[13px] font-bold tracking-[0.12em] text-brand-fg">TRIP CANVAS</p>
          <h1 className="text-[32px] leading-tight font-bold tracking-[-0.025em]">내 여행</h1>
          <p className="max-w-xl text-base text-fg-2 text-pretty">
            이어서 계획할 여행을 고르거나, 새 캔버스를 시작해 보세요.
          </p>
        </div>
        <SignOutButton />
      </header>

      <TripsPanel trips={trips} deletedTrips={deletedTrips} />
    </main>
  )
}
