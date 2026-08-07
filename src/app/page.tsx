// FR-014 여행 목록 (뎁스 0). 조회는 E-13 계약 그대로 — deleted_at 필터 + 살아있는 장소 수.

import { redirect } from 'next/navigation'
import { TripsPanel } from '@/components/trips/TripsPanel'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listTrips } from '@/lib/trips/api'

export default async function HomePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // proxy.ts 가 먼저 걸러 주지만, 데이터에 가까운 곳에서 한 번 더 확인한다
  if (!user) redirect('/login')

  const trips = await listTrips(supabase)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-12 sm:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">내 여행</h1>
        <p className="text-base text-black/60 dark:text-white/60">
          여행을 고르면 지도와 일정이 있는 캔버스가 열려요.
        </p>
      </header>

      <TripsPanel trips={trips} />
    </main>
  )
}
