'use client'

// FR-003 / SC-001 — 사용자 결정은 정확히 3지점이다.
//   ① 검색어 입력(디바운스 300ms 뒤 자동 검색) ② 결과 선택 ③ 카테고리 확정
// 카테고리 버튼을 누르는 순간 보관함에 담긴다 — 확인 대화상자를 끼우면 결정이 4지점이 된다.

import { useEffect, useRef, useState } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/map/provider'
import { PlaceError, placeErrorMessage } from '@/lib/place/api'
import type { PlaceCategory } from '@/lib/place/category'
import type { NormalizedPlace } from '@/lib/place/search-proxy'

export const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 5

export interface PlaceDraft {
  category: PlaceCategory
  name: string
  address: string
  road_address: string
  lat: number
  lng: number
  /** 검색 결과는 naver, 지도에서 직접 찍은 곳은 manual (FR-016) */
  provider: 'naver' | 'manual'
  provider_link: string | null
}

export interface PlaceSearchBoxProps {
  onSave: (draft: PlaceDraft) => Promise<void>
  /** 중복일 때 "담아둔 곳 보기" — 덮어쓰지 않고 기존 항목으로 데려간다 (PRD 엣지케이스) */
  onShowExisting?: (placeId: string) => void
  /** 0건일 때 지도에서 직접 찍기로 넘어간다 (FR-016 — 막다른 안내 금지) */
  onPickOnMap?: () => void
  /** 카테고리 확정 칩(강조)을 펼친 순간 — 캔버스가 미리보기 시트를 닫는다 (L-09) */
  onEditorOpen?: () => void
}

interface Failure {
  message: string
  kind: 'search' | 'save'
  existingPlaceId?: string
}

const CATEGORY_ITEM = 'flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium transition-opacity duration-[120ms] hover:opacity-90'

export function PlaceSearchBox({
  onSave,
  onShowExisting,
  onPickOnMap,
  onEditorOpen,
}: PlaceSearchBoxProps) {
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [results, setResults] = useState<NormalizedPlace[] | null>(null)
  const [picked, setPicked] = useState<NormalizedPlace | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [saving, setSaving] = useState(false)
  // 늦게 도착한 응답이 최신 결과를 덮지 않게 한다
  const runRef = useRef(0)

  // 두 글자 미만이면 서버를 부르지 않는다 — 400(validation/query-too-short)을 미리 막는다
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return

    async function search(q: string) {
      const run = ++runRef.current
      try {
        const response = await fetch(`/api/place-search?q=${encodeURIComponent(q)}`, {
          headers: { accept: 'application/json' },
        })
        if (run !== runRef.current) return

        if (!response.ok) {
          const problem = (await response.json().catch(() => null)) as { detail?: string } | null
          setResults(null)
          setPicked(null)
          setNote(null)
          setFailure({
            kind: 'search',
            message: problem?.detail ?? '검색을 처리하지 못했어요. 잠시 뒤에 다시 해 주세요.',
          })
          return
        }

        const places = (await response.json()) as NormalizedPlace[]
        if (run !== runRef.current) return

        setFailure(null)
        setPicked(null)
        setResults(places.slice(0, MAX_RESULTS))
        setNote(
          places.length === 0
            ? '찾은 곳이 없어요. 다른 이름으로 찾아보거나, 지도를 길게 눌러 직접 찍을 수 있어요.'
            : null,
        )
      } catch {
        if (run !== runRef.current) return
        setResults(null)
        setNote(null)
        setFailure({
          kind: 'search',
          message: '검색 서버에 닿지 못했어요. 잠시 뒤에 다시 검색해 주세요.',
        })
      }
    }

    const timer = setTimeout(() => {
      void search(trimmed)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, attempt])

  function changeQuery(value: string) {
    setQuery(value)
    if (value.trim().length < MIN_QUERY_LENGTH) {
      runRef.current += 1 // 짧아진 뒤 도착한 응답은 버린다
      setResults(null)
      setPicked(null)
    }
  }

  function retry() {
    setFailure(null)
    setAttempt((value) => value + 1)
  }

  async function confirmCategory(category: PlaceCategory) {
    if (!picked || saving) return
    setSaving(true)
    setFailure(null)
    try {
      await onSave({
        category,
        name: picked.name,
        address: picked.address,
        road_address: picked.roadAddress,
        lat: picked.lat,
        lng: picked.lng,
        provider: 'naver',
        provider_link: picked.providerLink,
      })
      setPicked(null)
      setResults(null)
      setQuery('')
      setNote(`${picked.name}을(를) 보관함에 담았어요.`)
    } catch (error) {
      const placeError = error instanceof PlaceError ? error : new PlaceError('unknown')
      setNote(null)
      setFailure({
        kind: 'save',
        message: placeErrorMessage(placeError.code),
        existingPlaceId: placeError.existingPlaceId,
      })
    } finally {
      setSaving(false)
    }
  }

  const existingPlaceId = failure?.existingPlaceId
  // 0건은 막다른 길이 아니다 — 지도에서 직접 찍는 길로 이어 준다 (FR-016 / L-06)
  const noResults = results !== null && results.length === 0

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="place-search" className="text-sm font-medium">
        장소 검색
      </label>
      {/* 지우는 버튼은 입력 안에 얹는다. type=search 의 네이티브 X 는 브라우저마다 있거나 없어서
          모바일에서는 기대할 수 없다 — 직접 둔다. 적은 게 없으면 내지 않는다 */}
      <div className="relative flex">
        <input
          id="place-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="가고 싶은 곳 이름을 적어 주세요"
          onChange={(event) => changeQuery(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent pr-12 pl-4 text-base outline-none focus:border-foreground [&::-webkit-search-cancel-button]:hidden dark:border-white/20"
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              changeQuery('')
              setNote(null)
              setFailure(null)
              document.getElementById('place-search')?.focus()
            }}
            className="absolute inset-y-0 right-1 flex w-10 items-center justify-center text-black/45 dark:text-white/45"
          >
            <span aria-hidden>✕</span>
          </button>
        )}
      </div>

      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((place) => {
            const active = picked?.name === place.name && picked?.lat === place.lat
            return (
              <li key={`${place.name}-${place.lat}-${place.lng}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(place)
                    setFailure(null)
                    setNote(null)
                    onEditorOpen?.()
                  }}
                  className={`flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-black/5 dark:hover:bg-white/10 ${
                    active ? 'bg-black/5 dark:bg-white/10' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 text-base font-medium">
                    {place.name}
                    <span
                      // 옆의 truncate 형제가 자리를 다 가져가면 이 배지가 최소 너비까지 눌려
                      // "스팟" 같은 두 글자가 세로로 접힌다 — 줄이지도 말고 접지도 마라
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-background"
                      style={{ background: `var(--pin-${place.categoryHint})` }}
                    >
                      {CATEGORY_LABEL[place.categoryHint]}
                    </span>
                  </span>
                  <span className="text-sm text-black/60 dark:text-white/60">
                    {place.roadAddress || place.address}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {picked && (
        <div className="flex flex-col gap-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
          <p className="text-sm text-black/60 dark:text-white/60">
            {picked.name} — 어디에 담을까요?
          </p>
          <div className="flex gap-2">
            {CATEGORY_ORDER.map((category) => {
              const suggested = category === picked.categoryHint
              return (
                <button
                  key={category}
                  type="button"
                  data-suggested={suggested ? 'true' : undefined}
                  autoFocus={suggested}
                  disabled={saving}
                  onClick={() => void confirmCategory(category)}
                  className={
                    suggested
                      ? `${CATEGORY_ITEM} bg-foreground text-background`
                      : `${CATEGORY_ITEM} border border-black/15 dark:border-white/20`
                  }
                >
                  {CATEGORY_LABEL[category]}으로 담기
                </button>
              )
            })}
          </div>
        </div>
      )}

      {note && (
        <p role="status" className="text-sm text-black/60 dark:text-white/60">
          {note}
        </p>
      )}

      {noResults && onPickOnMap && (
        <button
          type="button"
          onClick={onPickOnMap}
          className="flex min-h-8 w-fit items-center rounded-full border border-black/15 px-3 text-sm dark:border-white/20"
        >
          지도에 직접 찍기
        </button>
      )}

      {failure && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm" data-kind={failure.kind}>
          <p>{failure.message}</p>
          {failure.kind === 'search' && (
            <button
              type="button"
              onClick={retry}
              className="flex min-h-8 items-center rounded-full border border-black/15 px-3 dark:border-white/20"
            >
              다시 검색하기
            </button>
          )}
          {failure.kind === 'save' && existingPlaceId && onShowExisting && (
            <button
              type="button"
              onClick={() => onShowExisting(existingPlaceId)}
              className="flex min-h-8 items-center rounded-full border border-black/15 px-3 dark:border-white/20"
            >
              담아둔 곳 보기
            </button>
          )}
        </div>
      )}
    </div>
  )
}
