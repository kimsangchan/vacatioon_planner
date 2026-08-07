'use client'

// FR-001 — 6자리 코드 입력이 기본, 매직링크는 보조 (decision-log #13).
// 화면당 강조 CTA 1개: 단계마다 하나씩만 두고, 에러에는 항상 다음 행동 버튼을 붙인다 (SPEC §UI 규칙).

import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export interface LoginFormProps {
  requestCode?: (email: string) => Promise<void>
  verifyCode?: (email: string, code: string) => Promise<void>
  onSignedIn?: () => void
}

async function sendOtpCode(email: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) throw error
}

async function confirmOtpCode(email: string, code: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) throw error
}

const PRIMARY =
  'flex min-h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50'
const SECONDARY =
  'flex min-h-11 items-center justify-center rounded-full border border-black/15 px-5 text-base font-medium transition-colors hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]'
const FIELD =
  'min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-4 text-base outline-none focus:border-foreground dark:border-white/20'

export function LoginForm({ requestCode, verifyCode, onSignedIn }: LoginFormProps) {
  const router = useRouter()
  const emailId = useId()
  const codeId = useId()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = requestCode ?? sendOtpCode
  const confirm = verifyCode ?? confirmOtpCode
  const signedIn =
    onSignedIn ??
    (() => {
      router.replace('/')
      router.refresh()
    })

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await send(email.trim())
      setStep('code')
    } catch {
      setError('메일을 보내지 못했어요. 주소를 확인하고 다시 보내 주세요.')
    } finally {
      setPending(false)
    }
  }

  async function handleConfirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await confirm(email.trim(), code.trim())
      signedIn()
    } catch {
      setError('코드가 맞지 않거나 시간이 지났어요. 코드를 다시 받아 주세요.')
    } finally {
      setPending(false)
    }
  }

  function backToEmail() {
    setStep('email')
    setCode('')
    setError(null)
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleConfirmCode} className="flex w-full flex-col gap-4">
        <p className="text-base text-black/70 dark:text-white/70">
          {email}로 6자리 코드를 보냈어요. 코드를 넣으면 바로 들어가요.
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor={codeId} className="text-sm font-medium">
            6자리 인증 코드
          </label>
          <input
            id={codeId}
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className={`${FIELD} tracking-[0.4em]`}
          />
        </div>

        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-xl bg-black/[.04] p-4 dark:bg-white/[.08]">
            <p className="text-sm">{error}</p>
            <button type="button" onClick={backToEmail} className={`${SECONDARY} self-start`}>
              코드 다시 받기
            </button>
          </div>
        )}

        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? '확인하고 있어요' : '코드 확인하기'}
        </button>

        <p className="text-sm text-black/60 dark:text-white/60">
          메일의 링크로도 열려요. 코드가 편하면 위에 그대로 넣어 주세요.
        </p>
        <button
          type="button"
          onClick={backToEmail}
          className="flex min-h-11 items-center self-start text-sm underline underline-offset-4"
        >
          다른 메일 주소로 받기
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSendCode} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="text-sm font-medium">
          이메일 주소
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className={FIELD}
        />
      </div>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl bg-black/[.04] p-4 dark:bg-white/[.08]">
          <p className="text-sm">{error}</p>
          <button type="submit" disabled={pending} className={`${SECONDARY} self-start`}>
            다시 보내기
          </button>
        </div>
      )}

      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? '메일을 보내고 있어요' : '인증 코드 받기'}
      </button>

      <p className="text-sm text-black/60 dark:text-white/60">
        메일로 6자리 코드와 링크를 함께 보내요. 코드를 넣는 쪽이 어느 기기에서나 잘 열려요.
      </p>
    </form>
  )
}
