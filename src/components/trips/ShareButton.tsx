'use client'

// 공유 링크 (결정 #3·#46) — 동행자에게 보낼 **읽기 전용** 주소를 만든다.
//
// 계정을 요구하지 않는 이유(#46): 여행 한 번 때문에 가입을 시키면 아무도 안 열어 본다.
// 링크를 받은 사람은 일정을 보고 **별표만** 남긴다 — 고치지는 못한다.
//
// "다시 만들기"를 따로 두지 않는다: 켜기를 다시 누르면 새 토큰이 나오고, 그게 곧 이전 링크
// 무효화다(0003 enable_share). 버튼을 둘로 나누면 "무효화"라는 말을 사용자가 배워야 한다.

import { useState } from 'react'
import { shareUrl } from '@/lib/share/api'

export interface ShareButtonProps {
  enabled: boolean
  /** hex 토큰. 꺼져 있으면 null */
  token: string | null
  onEnable: () => Promise<void>
  onDisable: () => Promise<void>
}

export function ShareButton({ enabled, token, onEnable, onDisable }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const url = token && typeof window !== 'undefined' ? shareUrl(window.location.origin, token) : ''

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      await action()
    } catch {
      setFailure('링크를 바꾸지 못했어요. 잠시 뒤에 다시 해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="flex min-h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-fg-2 transition-colors duration-120 hover:bg-surface-2"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.7 13.4l6.6 3.8M15.3 6.8L8.7 10.6M18 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        </svg>
        같이 보기
      </button>

      {open && (
        <div
          role="group"
          aria-label="같이 보기 링크"
          className="absolute top-full right-0 z-50 mt-2 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-3"
        >
          <p className="text-[13px] leading-relaxed text-fg-2">
            링크를 받은 사람은 <strong className="font-semibold text-fg">일정을 보고 별표를 남길 수</strong>{' '}
            있어요. 고치지는 못해요.
          </p>

          {enabled && token ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  aria-label="같이 보기 주소"
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-h-10 min-w-0 flex-1 rounded-m border border-line bg-surface-2 px-3 text-[13px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url)
                    setCopied(true)
                  }}
                  className="flex min-h-10 shrink-0 items-center rounded-m bg-brand px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {copied ? '복사했어요' : '복사하기'}
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(onDisable)}
                className="min-h-9 self-start rounded-m px-2 text-[13px] font-medium text-fg-3 transition-colors duration-120 hover:bg-surface-2 hover:text-danger disabled:opacity-30"
              >
                링크 끄기
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(onEnable)}
              className="flex min-h-12 items-center justify-center rounded-l bg-brand px-5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              링크 만들기
            </button>
          )}

          {failure && <p className="text-[13px] text-danger">{failure}</p>}
        </div>
      )}
    </div>
  )
}
