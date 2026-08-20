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
    // 캔버스는 뷰포트 높이에 딱 맞는다 — 넘치면 세로 스크롤바가 생기고, 그 스크롤바가
    // 폭을 15px 먹어 지도가 오른쪽 끝까지 못 간다(실측: body 1166px vs 뷰포트 860px).
    // 안쪽 패널은 자기 안에서 스크롤한다. dvh 를 쓰는 이유: 모바일 브라우저 툴바가 접혔다 펴진다
    <main className="flex h-dvh min-h-0 w-full flex-col overflow-hidden">
      <TripCanvas tripId={id} ownerId={user.id} />
    </main>
  )
}
