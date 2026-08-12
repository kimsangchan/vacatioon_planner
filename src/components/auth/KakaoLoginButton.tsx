'use client'

// FR-001 보조 경로 — 카카오로 들어오기 (결정 #33).
//
// 메일 OTP 를 대체하지 않고 옆에 둔다: E2E 5개가 Mailpit 으로 자동화돼 있는데 카카오 동의
// 화면은 카카오 도메인이라 자동화가 닿지 않는다. 실사용은 카카오 한 번, 테스트는 메일 코드.
//
// 강조색(bg-foreground)을 쓰지 않는다 — 이 화면의 강조 CTA 는 '인증 코드 받기' 하나다 (L-09).
// 카카오 브랜드색은 그 규칙 밖의 색이라 눈에 띄면서도 강조를 둘로 만들지 않는다.

import { useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export interface KakaoLoginButtonProps {
  /** 테스트·스토리에서 갈아끼운다 */
  signIn?: () => Promise<void>
}

async function startKakaoLogin(): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    // 카카오는 Supabase 로 되돌려보내고, Supabase 가 다시 이 주소로 code 를 실어 보낸다.
    // 지금 보고 있는 origin 을 그대로 쓴다 — 폰에서 LAN IP 로 들어와도 자기 자리로 돌아온다
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}

export function KakaoLoginButton({ signIn }: KakaoLoginButtonProps) {
  const start = signIn ?? startKakaoLogin
  // state 는 다음 렌더에야 반영된다 — 같은 틱의 두 번째 클릭은 ref 로만 막을 수 있다
  const startingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  function handleClick() {
    if (startingRef.current) return
    startingRef.current = true
    setPending(true)
    setFailed(false)

    void start()
      .catch(() => {
        startingRef.current = false
        setPending(false)
        setFailed(true)
      })
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] px-5 text-base font-medium text-[#191600] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <span aria-hidden>💬</span>
        {pending ? '카카오로 이동하고 있어요' : '카카오로 계속하기'}
      </button>

      {failed && (
        <p role="alert" className="text-sm">
          카카오 로그인을 시작하지 못했어요. 아래 메일 주소로 코드를 받아 들어와 주세요.
        </p>
      )}
    </div>
  )
}
