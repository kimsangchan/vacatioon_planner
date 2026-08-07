// 캔버스 자리표시 (뎁스 1). 지도·보관함·타임라인은 T6~T7 에서 채운다.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function TripCanvasPage({ params }: PageProps<'/trip/[id]'>) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: trip } = await supabase
    .from('trips')
    .select('id,name,start_date,end_date')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!trip) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-5 py-12 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">그 여행을 찾지 못했어요</h1>
        <p className="text-base text-black/60 dark:text-white/60">
          주소가 바뀌었거나 지운 여행일 수 있어요.
        </p>
        <Link
          href="/"
          className="flex min-h-11 items-center justify-center self-start rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          여행 목록 보기
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-12 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link href="/" className="flex min-h-8 items-center self-start text-sm underline underline-offset-4">
          여행 목록으로
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="text-base text-black/60 dark:text-white/60">
          {trip.start_date.replaceAll('-', '.')} ~ {trip.end_date.replaceAll('-', '.')}
        </p>
      </header>

      <p className="rounded-2xl border border-dashed border-black/15 p-8 text-base text-black/60 dark:border-white/20 dark:text-white/60">
        여기에 지도·보관함·타임라인 캔버스가 들어와요. 지금은 여행만 만들어 둘 수 있어요.
      </p>
    </main>
  )
}
