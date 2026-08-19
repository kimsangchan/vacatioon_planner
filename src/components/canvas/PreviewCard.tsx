'use client'

// FR-006 — 미리보기 한 컴포넌트, 두 얼굴.
//   card  = 데스크톱 호버 (썸네일·이름·카테고리·메모 첫 줄, fade 120ms)
//   sheet = 모바일 탭 / 데스크톱 클릭 (사진·이름·카테고리·메모 편집·행동 버튼)
// 둘 다 라우트가 아니다 — 캔버스(뎁스 1) 위의 뎁스 2 표면이다 (SC-003).
// 썸네일은 캔버스가 열릴 때 이미 받아 뒀다(lib/photo/prefetch.ts) — 여기서 네트워크를 타지 않는다.

import { useId, useState } from 'react'
import { ConfirmRow } from '@/components/common/ConfirmRow'
import { CATEGORY_LABEL } from '@/lib/map/provider'
import { PhotoError, photoErrorMessage, photoPublicUrl } from '@/lib/photo/upload'
import { formatAmount, formatAmountInput, parseAmountInput } from '@/lib/timeline/money'
import { coverPhoto, type PhotoRow, type PlaceRow } from '@/lib/trips/bundle'

export interface PreviewCardProps {
  place: PlaceRow
  variant: 'card' | 'sheet'
  /** 이 장소가 지금 몇 개의 Stop 으로 담겨 있는지 — 빼기 확인 문구의 근거 (FR-017) */
  placedCount?: number
  onAddPhoto?: (file: File) => Promise<void> | void
  onSetCover?: (photoId: string) => Promise<void> | void
  onRemovePhoto?: (photo: PhotoRow) => Promise<void> | void
  onSaveMemo?: (memo: string) => Promise<void> | void
  /** 예상 금액 (결정 #39). 원 단위 정수, 비우면 null — 실제 지출(Stop)과 다른 값이다 */
  onSaveEstimatedCost?: (estimatedCost: number | null) => Promise<void> | void
  /** 일정에 넣고 빼는 일도 이 카드에서 한다 (결정 #43) — 장소를 보는 자리가 곧 정하는 자리다 */
  days?: { id: string; label: string }[]
  onAssign?: (dayId: string) => Promise<void> | void
  onUnassign?: () => Promise<void> | void
  onDeletePlace?: () => Promise<void> | void
  onClose?: () => void
}

const SMALL_BUTTON =
  'flex min-h-8 items-center rounded-full border border-black/15 px-2 text-xs dark:border-white/20'

// 되돌릴 수 없는 일(사진 hard delete)과 미리 알려야 하는 일(Stop 동반 삭제)만 여기를 거친다
interface PendingConfirm {
  message: string
  confirmLabel: string
  run: () => Promise<void> | void
}

export function PreviewCard({
  place,
  variant,
  placedCount = 0,
  onAddPhoto,
  onSetCover,
  onRemovePhoto,
  onSaveMemo,
  onSaveEstimatedCost,
  days = [],
  onAssign,
  onUnassign,
  onDeletePlace,
  onClose,
}: PreviewCardProps) {
  const fileInputId = useId()
  const memoInputId = useId()
  const amountInputId = useId()
  const [memo, setMemo] = useState(place.memo)
  // 화면에는 콤마가 붙은 문자열로 두고, 저장할 때만 정수로 되돌린다 (#17)
  const [amount, setAmount] = useState(
    place.estimated_cost === null ? '' : formatAmount(place.estimated_cost),
  )
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [picking, setPicking] = useState(false)

  const cover = coverPhoto(place)
  const sheet = variant === 'sheet'
  const memoFirstLine = place.memo.split('\n')[0]?.trim() ?? ''

  async function run(action: () => Promise<void> | void, done?: string) {
    if (busy) return
    setBusy(true)
    setFailure(null)
    setNote(null)
    try {
      await action()
      setPending(null)
      if (done) setNote(done)
    } catch (error) {
      setFailure(
        error instanceof PhotoError
          ? photoErrorMessage(error.code)
          : '방금 한 일을 저장하지 못했어요. 잠시 뒤에 다시 해 주세요.',
      )
    } finally {
      setBusy(false)
    }
  }

  // 보관함에서 빼기 = Place 소프트 삭제. 되돌릴 수 있으니 평소엔 묻지 않는다 (T-06).
  // 다만 일정에 담겨 있으면 그 자리(Stop)는 hard delete 라 먼저 알린다 (E-12)
  function removePlace() {
    if (!onDeletePlace) return
    if (placedCount === 0) {
      void run(onDeletePlace)
      return
    }
    setPending({
      message: `일정에 ${placedCount}곳 담겨 있어 일정에서도 빠져요. 되돌리면 보관함으로 돌아오지만 일정은 다시 담아야 해요.`,
      confirmLabel: '네, 뺄게요',
      run: onDeletePlace,
    })
  }

  function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // 같은 파일을 다시 골라도 change 가 오도록
    if (!file || !onAddPhoto) return
    void run(() => onAddPhoto(file), '사진을 담았어요.')
  }

  const photoButton = onAddPhoto ? (
    <>
      <label
        htmlFor={fileInputId}
        className="flex min-h-8 cursor-pointer items-center justify-center rounded-full border border-black/15 px-3 text-sm font-medium dark:border-white/20"
      >
        사진 담기
      </label>
      <input
        id={fileInputId}
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={pickPhoto}
        className="sr-only"
      />
    </>
  ) : null

  return (
    <article
      data-testid="preview-card"
      data-variant={variant}
      aria-label={`${place.name} 미리보기`}
      className="flex animate-[fade-in_120ms_ease-out] flex-col gap-3 rounded-2xl border border-black/10 bg-background p-3 shadow-sm dark:border-white/15"
    >
      <div className="flex items-start gap-3">
        {cover ? (
          // next/image 를 쓰지 않는다: 이미 320px WebP 로 줄여 올린 사진이고(lib/photo/resize.ts),
          // 최적화 대상 호스트가 환경마다 다른 Supabase URL 이라 remotePatterns 를 못 박는다
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoPublicUrl(cover.thumb_path)}
            alt={`${place.name} 사진`}
            width={80}
            height={80}
            className="size-20 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span
            data-testid="photo-placeholder"
            aria-hidden
            className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10"
          >
            <span
              className="size-6 rounded-full"
              style={{ background: `var(--pin-${place.category})` }}
            />
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate text-base font-semibold">{place.name}</h3>
          <p className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
            <span
              // 옆의 truncate 형제가 자리를 다 가져가면 이 배지가 최소 너비까지 눌려
              // "스팟" 같은 두 글자가 세로로 접힌다 — 줄이지도 말고 접지도 마라
              className="shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-background"
              style={{ background: `var(--pin-${place.category})` }}
            >
              {CATEGORY_LABEL[place.category]}
            </span>
            <span className="truncate">{place.road_address || place.address}</span>
          </p>
          {!sheet && memoFirstLine !== '' && (
            <p className="truncate text-sm text-black/70 dark:text-white/70">{memoFirstLine}</p>
          )}
        </div>

        {sheet && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-8 min-w-8 items-center justify-center rounded-full text-sm text-black/60 dark:text-white/60"
          >
            <span className="sr-only">미리보기 닫기</span>
            <span aria-hidden>✕</span>
          </button>
        )}
      </div>

      {sheet && place.photos.length > 0 && (onSetCover || onRemovePhoto) && (
        <ul className="flex flex-wrap gap-2">
          {place.photos.map((photo) => (
            <li key={photo.id} className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPublicUrl(photo.thumb_path)}
                alt={`${place.name} 사진`}
                width={56}
                height={56}
                className="size-14 rounded-lg object-cover"
              />
              {photo.id === cover?.id ? (
                <span className="text-xs text-black/60 dark:text-white/60">대표</span>
              ) : (
                onSetCover && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => onSetCover(photo.id), '대표 사진을 바꿨어요.')}
                    className={SMALL_BUTTON}
                  >
                    대표로 두기
                  </button>
                )
              )}
              {onRemovePhoto && (
                <button
                  type="button"
                  onClick={() =>
                    setPending({
                      message: '이 사진을 지울까요? 되돌릴 수 없어요.',
                      confirmLabel: '지우기',
                      run: () => onRemovePhoto(photo),
                    })
                  }
                  className={SMALL_BUTTON}
                >
                  사진 지우기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 일정에 넣고 빼기 — 장소를 들여다보는 자리에서 바로 정한다 (결정 #43).
          강조색은 쓰지 않는다: 이 카드의 주 행동은 내용을 채우는 것이다 (L-09) */}
      {sheet && onUnassign && placedCount > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => onUnassign(), '일정에서 뺐어요.')}
          className={SMALL_BUTTON}
        >
          일정에서 빼기
        </button>
      )}

      {sheet && onAssign && placedCount === 0 && days.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
            className={SMALL_BUTTON}
          >
            일정에 넣기
          </button>
          {picking && (
            <ul className="flex flex-wrap gap-1">
              {days.map((day) => (
                <li key={day.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setPicking(false)
                        await onAssign(day.id)
                      }, `${day.label}에 넣었어요.`)
                    }
                    className={SMALL_BUTTON}
                  >
                    {day.label}에 넣기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 메모와 예상 금액은 한 폼·한 버튼이다 — 카드에서 다 고친다는 게 이 표면의 쓸모이고,
          강조 CTA 는 화면당 하나여야 한다 (L-09). 안 바꾼 값은 보내지 않는다 */}
      {sheet && (onSaveMemo || onSaveEstimatedCost) && (
        <div className="flex flex-col gap-2">
          {onSaveMemo && (
            <>
              <label htmlFor={memoInputId} className="text-sm font-medium">
                메모
              </label>
              <textarea
                id={memoInputId}
                rows={2}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="가서 뭘 할지 적어 두세요"
                className="rounded-xl border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground dark:border-white/20"
              />
            </>
          )}

          {onSaveEstimatedCost && (
            <>
              <label htmlFor={amountInputId} className="text-sm font-medium">
                예상 금액
              </label>
              <input
                id={amountInputId}
                // 모바일에서 숫자 키패드가 뜨게 한다. type=number 는 콤마를 못 쓴다
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(formatAmountInput(event.target.value))}
                placeholder="여기서 얼마쯤 쓸까요"
                className="rounded-xl border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground dark:border-white/20"
              />
              <p className="text-xs text-black/55 dark:text-white/55">
                실제로 쓴 돈은 일정에 넣은 뒤 그 방문에 적어요.
              </p>
            </>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (onSaveMemo && memo !== place.memo) await onSaveMemo(memo)
                const next = parseAmountInput(amount)
                if (onSaveEstimatedCost && next !== place.estimated_cost) {
                  await onSaveEstimatedCost(next)
                }
              }, '저장했어요.')
            }
            className="flex min-h-11 w-fit items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity duration-[120ms] hover:opacity-90"
          >
            저장하기
          </button>
        </div>
      )}

      {sheet && (photoButton !== null || place.provider_link !== null || onDeletePlace) && (
        <div className="flex flex-wrap items-center gap-2">
          {photoButton}
          {place.provider_link && (
            <a
              href={place.provider_link}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-h-8 items-center rounded-full border border-black/15 px-3 text-sm dark:border-white/20"
            >
              네이버에서 보기
            </a>
          )}
          {/* 파괴적이지만 되돌릴 수 있는 일이다 — 빨간 강조 대신 보조 스타일로 둔다 */}
          {onDeletePlace && (
            <button
              type="button"
              disabled={busy}
              onClick={removePlace}
              className="flex min-h-8 items-center rounded-full px-3 text-sm text-black/60 underline underline-offset-4 dark:text-white/60"
            >
              보관함에서 빼기
            </button>
          )}
        </div>
      )}

      {sheet && pending && (
        <ConfirmRow
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          busy={busy}
          onConfirm={() => void run(pending.run)}
          onCancel={() => setPending(null)}
        />
      )}

      {/* 사진이 없으면 호버 카드에서도 바로 담을 수 있다 (PRD 엣지 — 기능은 성립) */}
      {!sheet && !cover && photoButton && <div className="flex">{photoButton}</div>}

      {note && (
        <p role="status" className="text-sm text-black/60 dark:text-white/60">
          {note}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-sm">
          {failure}
        </p>
      )}
    </article>
  )
}
