// 공유 뷰 (결정 #3·#46) — 링크를 받은 사람이 로그인 없이 여는 읽기 전용 화면.
//
// 라우트 뎁스 1 을 지킨다: `/s/<hex>` 하나뿐이고 그 아래로 더 들어가지 않는다 (SC-003).
// 토큰 모양을 서버에서 먼저 거르는 이유: 아무 문자열이나 RPC 로 흘리면 실패 계측(share_fail)이
// 쓰레기로 찬다. 형식이 맞는 것만 서버에 묻는다.

import { notFound } from 'next/navigation'
import { SharedTrip } from '@/components/trips/SharedTrip'
import { isShareToken } from '@/lib/share/api'

export const metadata = {
  title: '같이 보는 여행 · Trip Canvas',
  description: '링크로 받은 여행 일정을 보고 가고 싶은 곳에 별표를 남겨요.',
}

export default async function SharedTripPage({ params }: PageProps<'/s/[token]'>) {
  const { token } = await params
  if (!isShareToken(token)) notFound()

  return (
    <main className="flex h-dvh min-h-0 w-full flex-col overflow-hidden">
      <SharedTrip token={token} />
    </main>
  )
}
