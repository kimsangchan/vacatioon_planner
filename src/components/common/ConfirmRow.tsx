'use client'

// 되돌릴 수 없는 일 앞에서만 한 번 묻는 줄 (SPEC §UI 규칙 · PRD T-06).
// 모달을 쓰지 않는다 — 화면을 덮으면 무엇을 지우는지 못 보고 답해야 한다.
// 빨간 강조도 쓰지 않는다: 파괴적 행동을 색으로 겁주는 대신, 문장으로 결과를 말한다.

export interface ConfirmRowProps {
  message: string
  /** 실행 쪽 라벨은 행동 서술형으로 — "네" 하나만 두지 않는다 (T-08) */
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

export function ConfirmRow({
  message,
  confirmLabel,
  cancelLabel = '그만두기',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmRowProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-black/15 p-3 text-sm dark:border-white/20"
    >
      <p>{message}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex min-h-8 items-center rounded-full border border-black/25 px-3 text-sm font-medium transition-colors duration-[120ms] hover:bg-black/[.06] disabled:opacity-40 dark:border-white/30 dark:hover:bg-white/[.10]"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-8 items-center rounded-full px-3 text-sm underline underline-offset-4"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}
