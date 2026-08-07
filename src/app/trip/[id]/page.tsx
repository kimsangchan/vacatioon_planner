// 캔버스 (뎁스 1) — FR-003·005. 데이터는 클라이언트에서 E-06 Trip Bundle 한 번으로 읽는다
// (react-query). 서버는 로그인 확인과 owner_id 전달만 한다 — 저장(E-04)이 owner_id 를 요구한다.

import { redirect } from 'next/navigation'
import { TripCanvas } from '@/components/canvas/TripCanvas'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function TripCanvasPage({ params }: PageProps<'/trip/[id]'>) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col">
      <TripCanvas tripId={id} ownerId={user.id} />
    </main>
  )
}
