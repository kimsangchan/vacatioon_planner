'use client'

// FR-006 — 미리보기 한 컴포넌트, 두 얼굴.
//   card  = 데스크톱 호버 (썸네일·이름·카테고리·메모 첫 줄, fade 120ms)
//   sheet = 모바일 탭 / 데스크톱 클릭 (사진·이름·카테고리·메모 편집·행동 버튼)
// 둘 다 라우트가 아니다 — 캔버스(뎁스 1) 위의 뎁스 2 표면이다 (SC-003).
// 썸네일은 캔버스가 열릴 때 이미 받아 뒀다(lib/photo/prefetch.ts) — 여기서 네트워크를 타지 않는다.

import { useId, useRef, useState } from 'react'
import { ConfirmRow } from '@/components/common/ConfirmRow'
import { StarRating } from '@/components/common/StarRating'
import type { SwapCandidate } from '@/lib/timeline/swap'
import { SwapList } from './SwapList'
import type { Stars } from '@/lib/vote/api'
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
  /** 공개 검색 결과와 별개로 사용자가 직접 적는 여러 줄 영업시간 */
  onSaveOpeningHours?: (openingHours: string) => Promise<void> | void
  /**
   * 전화번호는 **손으로 적는다** — 네이버 지역검색의 `telephone` 은 항상 빈 문자열이다
   * (2026-08-21 실호출 10건 전부. 결정 #52 의 "네이버가 준다"는 틀렸다)
   */
  onSavePhone?: (phone: string) => Promise<void> | void
  /** 일정에 넣고 빼는 일도 이 카드에서 한다 (결정 #43) — 장소를 보는 자리가 곧 정하는 자리다 */
  days?: { id: string; label: string }[]
  onAssign?: (dayId: string) => Promise<void> | void
  onUnassign?: () => Promise<void> | void
  /** 이 자리에 대신 갈 곳 (결정 #53) — 계산은 위에서 한다, 여기는 고르는 화면이다 */
  swapOptions?: SwapCandidate[]
  onSwap?: (placeId: string) => Promise<void> | void
  onDeletePlace?: () => Promise<void> | void
  onClose?: () => void
  /** 별표 협의 (결정 #46) — 내가 준 별과 모두의 합. 없으면 별표를 아예 내지 않는다 */
  vote?: { mine: number; total: number; voters: number }
  onVote?: (stars: 0 | Stars) => void
  /**
   * 별 크기. 시트는 모바일만이 아니다 — **데스크톱 오른쪽 패널도 같은 시트**라
   * 44px 다섯이면 380px 패널을 넘는다(사용자 지적). 마우스로 닿는 자리는 compact.
   */
  starSize?: 'touch' | 'compact'
}

const SMALL_BUTTON =
  'flex min-h-8 items-center rounded-full border border-line px-2 text-xs'

const OPENING_HOURS_TEMPLATES = [
  { label: '매일 09:00–18:00', value: '매일 09:00–18:00' },
  { label: '평일/주말', value: '평일 09:00–18:00\n주말 10:00–17:00' },
  { label: '24시간', value: '24시간' },
  { label: '예약제', value: '예약제' },
] as const

// 되돌릴 수 없는 일(사진 hard delete)과 미리 알려야 하는 일(Stop 동반 삭제)만 여기를 거친다
interface PendingConfirm {
  message: string
  confirmLabel: string
  run: () => Promise<void> | void
}

export function PreviewCard({
  place,
  vote,
  onVote,
  variant,
  placedCount = 0,
  onAddPhoto,
  onSetCover,
  onRemovePhoto,
  onSaveMemo,
  onSaveEstimatedCost,
  onSaveOpeningHours,
  onSavePhone,
  starSize,
  days = [],
  onAssign,
  onUnassign,
  swapOptions,
  onSwap,
  onDeletePlace,
  onClose,
}: PreviewCardProps) {
  const fileInputId = useId()
  const memoInputId = useId()
  const amountInputId = useId()
  const openingHoursInputId = useId()
  const phoneInputId = useId()
  const [memo, setMemo] = useState(place.memo)
  const [openingHoursDraft, setOpeningHoursDraft] = useState({
    value: place.opening_hours,
    dirty: false,
  })
  const openingHours = openingHoursDraft.dirty
    ? openingHoursDraft.value
    : place.opening_hours
  const [phone, setPhone] = useState(place.phone)
  // 화면에는 콤마가 붙은 문자열로 두고, 저장할 때만 정수로 되돌린다 (#17)
  const [amount, setAmount] = useState(
    place.estimated_cost === null ? '' : formatAmount(place.estimated_cost),
  )
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [picking, setPicking] = useState(false)
  // 기본은 **보여 주기**다 (사용자 요청 — 네이버 지도가 그렇게 한다).
  // 카드가 길어져 스크롤까지 하게 된 원인이 "늘 편집 상태"였다 — 입력창은 접어 두고 연필로 연다
  const [editing, setEditing] = useState(false)

  const cover = coverPhoto(place)
  const sheet = variant === 'sheet'
  // 교체 (결정 #53) — 되돌리기는 "그 자리에 원래 장소를 다시 넣기"라 같은 문 하나로 대칭이다
  const [swapping, setSwapping] = useState(false)
  const [swapped, setSwapped] = useState<{ fromPlaceId: string; toName: string } | null>(null)
  const memoFirstLine = place.memo.split('\n')[0]?.trim() ?? ''

  // 하던 일이 끝나기 전에 누른 것도 **버리지 않는다**. 예전에는 `if (busy) return` 으로
  // 조용히 반환해서, 저장하기 직후에 고른 사진이 그대로 사라졌다 (여정 1 E2E 가 잡았다).
  // 게다가 `pickPhoto` 가 이미 파일 입력을 비운 뒤라 같은 사진을 다시 고르기 전엔 재시도도 막혔다.
  // 버리는 대신 줄을 세운다 — 누른 순서 그대로 하나씩 간다.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  async function run(action: () => Promise<void> | void, done?: string) {
    const mine = queue.current.then(async () => {
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
    })
    // 앞의 일이 실패해도 줄은 계속 간다 — 실패는 그 일의 화면 메시지로 이미 알렸다
    queue.current = mine.catch(() => {})
    await mine
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
        className="flex min-h-8 cursor-pointer items-center justify-center rounded-full border border-line px-3 text-sm font-medium"
      >
        사진 담기
      </label>
      <input
        id={fileInputId}
        type="file"
        accept="image/*"
        // busy 로 잠그지 않는다 — 잠그면 저장 중에 고른 사진이 줄에 서지도 못하고 사라진다
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
      className="flex animate-[fade-in_120ms_ease-out] flex-col gap-3 rounded-2xl border border-line bg-background p-3 shadow-sm"
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
            className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-surface-2"
          >
            <span
              className="size-6 rounded-full"
              style={{ background: `var(--pin-${place.category})` }}
            />
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate text-[18px] leading-tight font-semibold">{place.name}</h3>
          <p className="flex items-center gap-2 text-sm text-fg-2">
            <span
              // 옆의 truncate 형제가 자리를 다 가져가면 이 배지가 최소 너비까지 눌려
              // "스팟" 같은 두 글자가 세로로 접힌다 — 줄이지도 말고 접지도 마라
              className="shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-white"
              style={{ background: `var(--pin-${place.category})` }}
            >
              {CATEGORY_LABEL[place.category]}
            </span>
            <span className="truncate">{place.road_address || place.address}</span>
          </p>
          {sheet && vote && (
            <StarRating
              label={place.name}
              size={starSize}
              mine={vote.mine}
              total={vote.total}
              voters={vote.voters}
              onChange={onVote}
            />
          )}
          {!sheet && memoFirstLine !== '' && (
            <p className="truncate text-sm text-fg-2">{memoFirstLine}</p>
          )}
        </div>

        {sheet && (onSaveMemo || onSaveEstimatedCost || onSaveOpeningHours || onSavePhone) && (
          <button
            type="button"
            aria-pressed={editing}
            aria-label={editing ? '고치기 그만두기' : '고치기'}
            onClick={() => setEditing((on) => !on)}
            className={`flex size-8 shrink-0 items-center justify-center rounded-s transition-colors duration-120 ${
              editing ? 'bg-surface-3 text-fg' : 'text-fg-3 hover:bg-surface-2 hover:text-fg'
            }`}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
            </svg>
          </button>
        )}

        {sheet && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-s text-fg-3 transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
          >
            <span className="sr-only">미리보기 닫기</span>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
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
                <span className="text-xs text-fg-2">대표</span>
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

      {sheet && onSwap && placedCount > 0 && (
        <button
          type="button"
          disabled={busy}
          aria-expanded={swapping}
          onClick={() => {
            setSwapping((open) => !open)
            setSwapped(null)
          }}
          className={SMALL_BUTTON}
        >
          다른 곳으로 바꾸기
        </button>
      )}

      {sheet && onSwap && swapping && (
        <SwapList
          candidates={swapOptions ?? []}
          fromName={place.name}
          onPick={async (candidate) => {
            const from = place.id
            await run(() => onSwap(candidate.place.id))
            setSwapping(false)
            setSwapped({ fromPlaceId: from, toName: candidate.place.name })
          }}
          onCancel={() => setSwapping(false)}
          cancelClassName={SMALL_BUTTON}
        />
      )}

      {sheet && onSwap && swapped !== null && (
        <p className="flex items-center justify-between gap-2 text-[13px] text-fg-2">
          <span className="min-w-0">
            {swapped.toName}로 바꿨어요. {place.name}은 보관함에 있어요.
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await run(() => onSwap(swapped.fromPlaceId))
              setSwapped(null)
            }}
            className={`${SMALL_BUTTON} shrink-0`}
            aria-label="되돌리기"
          >
            되돌리기
          </button>
        </p>
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

      {/* 읽기 모드 — 저장해 둔 것을 보여 주기만 한다 (사용자 요청). */}
      {sheet && !editing && (
        <dl className="flex flex-col gap-1.5 text-[13px]">
          {place.phone !== '' && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-fg-3">전화</dt>
              <dd className="min-w-0 flex-1">
                <a href={`tel:${place.phone}`} className="tabular text-brand-fg underline underline-offset-2">
                  {place.phone}
                </a>
              </dd>
            </div>
          )}
          {place.opening_hours.trim() !== '' && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-fg-3">영업시간</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap">{place.opening_hours}</dd>
            </div>
          )}
          {place.memo.trim() !== '' && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-fg-3">메모</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap">{place.memo}</dd>
            </div>
          )}
          {place.estimated_cost != null && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-fg-3">예상</dt>
              <dd className="tabular min-w-0 flex-1">{formatAmount(place.estimated_cost)}원</dd>
            </div>
          )}
          {place.provider_link && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-fg-3">더 보기</dt>
              <dd className="min-w-0 flex-1">
                <a
                  href={place.provider_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-fg underline underline-offset-2"
                >
                  네이버에서 열기
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* 메모와 예상 금액은 한 폼·한 버튼이다 — 카드에서 다 고친다는 게 이 표면의 쓸모이고,
          강조 CTA 는 화면당 하나여야 한다 (L-09). 안 바꾼 값은 보내지 않는다 */}
      {sheet &&
        editing &&
        (onSaveMemo || onSaveEstimatedCost || onSaveOpeningHours || onSavePhone) && (
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
                className="min-h-12 rounded-m border border-line bg-surface-2 px-3 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface"
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
                className="min-h-12 rounded-m border border-line bg-surface-2 px-3 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface"
              />
              <p className="text-xs text-fg-3">
                실제로 쓴 돈은 일정에 넣은 뒤 그 방문에 적어요.
              </p>
            </>
          )}

          {onSavePhone && (
            <>
              <label htmlFor={phoneInputId} className="text-sm font-medium">
                전화번호
              </label>
              <input
                id={phoneInputId}
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="네이버 상세에서 보고 적어 두세요"
                className="min-h-12 rounded-m border border-line bg-surface-2 px-3 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface"
              />
            </>
          )}

          {onSaveOpeningHours && (
            <>
              <label htmlFor={openingHoursInputId} className="text-sm font-medium">
                영업시간
              </label>
              <div
                role="group"
                aria-label="영업시간 빠른 입력"
                className="flex flex-wrap gap-1.5"
              >
                {OPENING_HOURS_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => setOpeningHoursDraft({ value: template.value, dirty: true })}
                    className={SMALL_BUTTON}
                  >
                    {template.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="영업시간 지우기"
                  onClick={() => setOpeningHoursDraft({ value: '', dirty: true })}
                  className={SMALL_BUTTON}
                >
                  지우기
                </button>
              </div>
              <textarea
                id={openingHoursInputId}
                rows={3}
                maxLength={2000}
                value={openingHours}
                onChange={(event) =>
                  setOpeningHoursDraft({ value: event.target.value, dirty: true })
                }
                placeholder="예: 월–금 09:00–18:00, 토요일 휴무"
                className="min-h-20 rounded-m border border-line bg-surface-2 px-3 py-2 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface"
              />
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
                if (onSavePhone && phone.trim() !== place.phone) await onSavePhone(phone.trim())
                if (onSaveOpeningHours && openingHoursDraft.dirty) {
                  if (openingHours !== place.opening_hours) {
                    await onSaveOpeningHours(openingHours)
                  }
                  setOpeningHoursDraft({ value: openingHours.trim(), dirty: false })
                }
              }, '저장했어요.')
            }
            className="flex min-h-10 w-fit items-center rounded-m bg-brand px-4 text-[15px] font-semibold text-white transition-opacity duration-[120ms] hover:opacity-90"
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
              className="flex min-h-8 items-center rounded-full border border-line px-3 text-sm"
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
              className="flex min-h-8 items-center rounded-full px-3 text-sm text-fg-2 underline underline-offset-4"
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
        <p role="status" className="text-sm text-fg-2">
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
