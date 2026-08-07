'use client'

// FR-006 — 미리보기 한 컴포넌트, 두 얼굴.
//   card  = 데스크톱 호버 (썸네일·이름·카테고리·메모 첫 줄, fade 120ms)
//   sheet = 모바일 탭 / 데스크톱 클릭 (사진·이름·카테고리·메모 편집·행동 버튼)
// 둘 다 라우트가 아니다 — 캔버스(뎁스 1) 위의 뎁스 2 표면이다 (SC-003).
// 썸네일은 캔버스가 열릴 때 이미 받아 뒀다(lib/photo/prefetch.ts) — 여기서 네트워크를 타지 않는다.

import { useId, useState } from 'react'
import { CATEGORY_LABEL } from '@/lib/map/provider'
import { PhotoError, photoErrorMessage, photoPublicUrl } from '@/lib/photo/upload'
import { coverPhoto, type PlaceRow } from '@/lib/trips/bundle'

export interface PreviewCardProps {
  place: PlaceRow
  variant: 'card' | 'sheet'
  onAddPhoto?: (file: File) => Promise<void> | void
  onSetCover?: (photoId: string) => Promise<void> | void
  onSaveMemo?: (memo: string) => Promise<void> | void
  onClose?: () => void
}

export function PreviewCard({
  place,
  variant,
  onAddPhoto,
  onSetCover,
  onSaveMemo,
  onClose,
}: PreviewCardProps) {
  const fileInputId = useId()
  const memoInputId = useId()
  const [memo, setMemo] = useState(place.memo)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

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
              className="rounded-full px-2 py-0.5 text-xs text-background"
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

      {sheet && place.photos.length > 1 && onSetCover && (
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
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => onSetCover(photo.id), '대표 사진을 바꿨어요.')}
                  className="flex min-h-8 items-center rounded-full border border-black/15 px-2 text-xs dark:border-white/20"
                >
                  대표로 두기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {sheet && onSaveMemo && (
        <div className="flex flex-col gap-2">
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
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => onSaveMemo(memo), '메모를 저장했어요.')}
            className="flex min-h-11 w-fit items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity duration-[120ms] hover:opacity-90"
          >
            메모 저장하기
          </button>
        </div>
      )}

      {sheet && (photoButton !== null || place.provider_link !== null) && (
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
        </div>
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
