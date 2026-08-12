// FR-001 보조 경로 — 카카오로 들어오기 (결정 #33·#36).
//
// Supabase 의 내장 카카오 연동(signInWithOAuth)을 쓰지 않는다: GoTrue 가 scope 에
// account_email 을 강제로 넣는데, 이메일 동의항목은 비즈 앱 전환 + 심사를 통과해야 설정할 수
// 있고 **설정되지 않은 항목을 요청하면 카카오가 인가를 거절한다.** 그래서 우리가 카카오를 직접
// 부르고(scope=openid) id_token 만 받아 Supabase 에 건넨다 — 절차는 lib/auth/kakao-flow.ts.
//
// 'use client' 가 없는 평범한 폼이다: JS 없이도 눌리고, 세션이 꼬여도 눌린다.
// GET 링크로 두면 Next 의 prefetch 가 로그인을 미리 실행해 nonce 를 태운다.
//
// 강조색(bg-foreground)을 쓰지 않는다 — 이 화면의 강조 CTA 는 '인증 코드 받기' 하나다 (L-09).

export function KakaoLoginButton() {
  return (
    <form method="post" action="/auth/kakao/start">
      <button
        type="submit"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] px-5 text-base font-medium text-[#191600] transition-opacity hover:opacity-90"
      >
        <span aria-hidden>💬</span>
        카카오로 계속하기
      </button>
    </form>
  )
}
