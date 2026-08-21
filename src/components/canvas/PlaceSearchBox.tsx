'use client'

// FR-003 / SC-001 — 사용자 결정은 정확히 3지점이다.
//   ① 검색어 입력(디바운스 300ms 뒤 자동 검색) ② 결과 선택 ③ 카테고리 확정
// 카테고리 버튼을 누르는 순간 보관함에 담긴다 — 확인 대화상자를 끼우면 결정이 4지점이 된다.

import { useCallback, useEffect, useRef, useState } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER, type LatLng } from '@/lib/map/provider'
import { distanceMeters } from '@/lib/geo/distance'
import { formatDistance } from '@/lib/route/format'
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
  /** 있으면 카드에서 바로 걸 수 있다. 영업시간은 저장한 뒤 사용자가 직접 적는다. */
  phone: string
  lat: number
  lng: number
  /** 검색 결과는 naver, 지도에서 직접 찍은 곳은 manual (FR-016) */
  provider: 'naver' | 'manual'
  provider_link: string | null
  /** 네이버 업종 원문 — "한식>국수" (결정 #62). 직접 찍은 곳은 빈 문자열 */
  category_label: string
}

export interface PlaceSearchBoxProps {
  onSave: (draft: PlaceDraft) => Promise<void>
  /** 중복일 때 "담아둔 곳 보기" — 덮어쓰지 않고 기존 항목으로 데려간다 (PRD 엣지케이스) */
  onShowExisting?: (placeId: string) => void
  /** 0건일 때 지도에서 직접 찍기로 넘어간다 (FR-016 — 막다른 안내 금지) */
  onPickOnMap?: () => void
  /** 카테고리 확정 칩(강조)을 펼친 순간 — 캔버스가 미리보기 시트를 닫는다 (L-09) */
  onEditorOpen?: () => void
  /**
   * 지금 보고 있는 지도의 한가운데. 검색을 **거는 순간** 한 번 읽어 결과를 가까운 순으로 세운다
   * (사용자 지적: "전혀 상관없는 지역이 나오던데").
   * 지도가 움직일 때마다 다시 읽지 않는 이유: 고르는 중에 목록 순서가 저 혼자 바뀌면 못 고른다.
   *
   * **넘길 때 함수를 고정하라**(`useCallback`). 매 렌더 새로 만들면 검색이 다시 걸린다.
   */
  getCenter?: () => LatLng | null
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
  getCenter,
}: PlaceSearchBoxProps) {
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [results, setResults] = useState<NormalizedPlace[] | null>(null)
  // 결과와 함께 굳혀 둔 기준점 — 이걸로 거리를 재고 순서를 세운다
  const [origin, setOrigin] = useState<LatLng | null>(null)
  const [picked, setPicked] = useState<NormalizedPlace | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [saving, setSaving] = useState(false)
  // 늦게 도착한 응답이 최신 결과를 덮지 않게 한다
  const runRef = useRef(0)

  // 검색은 두 갈래로 걸린다 — 타이핑 뒤 300ms 자동, 또는 검색 버튼·엔터로 즉시.
  // 두 갈래가 같은 함수를 타야 "버튼을 눌렀는데 다른 결과"가 안 생긴다
  const search = useCallback(async (q: string) => {
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
      setOrigin(getCenter?.() ?? null)
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
  }, [getCenter])

  // 두 글자 미만이면 서버를 부르지 않는다 — 400(validation/query-too-short)을 미리 막는다
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return

    const timer = setTimeout(() => {
      void search(trimmed)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, attempt, search])

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
        category_label: picked.categoryLabel,
        phone: picked.phone,
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

  // 네이버 지역검색은 좌표로 걸러 주지 않는다 — 받은 5건을 **여기서** 지도 부근 순으로 세운다
  const ranked =
    results === null
      ? null
      : origin === null
        ? results.map((place) => ({ place, meters: null as number | null }))
        : results
            .map((place) => ({
              place,
              meters: distanceMeters(origin, { lat: place.lat, lng: place.lng }),
            }))
            .sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0))

  const existingPlaceId = failure?.existingPlaceId
  // 0건은 막다른 길이 아니다 — 지도에서 직접 찍는 길로 이어 준다 (FR-016 / L-06)
  const noResults = results !== null && results.length === 0

  return (
    <div className="flex flex-col gap-3">
      {/* 라벨이 한 줄을 통째로 먹고 있었다 — 좁은 패널에서 그 한 줄이 아깝다 (사용자 지적).
          아이콘을 입력 안으로 넣고 라벨은 스크린리더에만 남긴다: 돋보기는 만국 공통이라 뜻이 샌다 */}
      <label htmlFor="place-search" className="sr-only">
        장소 검색
      </label>
      {/* 지우는 버튼은 입력 안에 얹는다. type=search 의 네이티브 X 는 브라우저마다 있거나 없어서
          모바일에서는 기대할 수 없다 — 직접 둔다. 적은 게 없으면 내지 않는다 */}
      {/* role=search 로 감싸는 이유: 모바일 키보드의 '검색' 키(=submit)가 곧 이 버튼이다.
          자동 검색(300ms)은 그대로 두고, 누르면 기다리지 않고 건다 */}
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = query.trim()
          if (trimmed.length < MIN_QUERY_LENGTH) return
          void search(trimmed)
        }}
        className="flex gap-2"
      >
      <div className="relative flex flex-1">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-fg-4"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20" />
          </svg>
        </span>
        <input
          id="place-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="가고 싶은 곳 이름을 적어 주세요"
          onChange={(event) => changeQuery(event.target.value)}
          className="min-h-12 w-full rounded-m border border-line bg-surface-2 pr-12 pl-11 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface [&::-webkit-search-cancel-button]:hidden"
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
            className="absolute inset-y-0 right-1 flex w-10 items-center justify-center text-fg-3"
          >
            <span aria-hidden>✕</span>
          </button>
        )}
      </div>
        <button
          type="submit"
          aria-label="검색"
          disabled={query.trim().length < MIN_QUERY_LENGTH}
          className="min-h-12 shrink-0 rounded-m border border-line px-4 text-sm font-medium text-fg-2 transition-colors duration-120 hover:bg-surface-2 disabled:opacity-40"
        >
          검색
        </button>
      </form>

      {/* 고르고 나면 목록을 접는다 — 결과 다섯 줄이 그대로 남으면 아래의 "어디에 담을까요"가
          화면 밖으로 밀려 정작 담지를 못한다 (사용자 지적). 고른 것은 아래 카드가 이름으로 되짚어 준다 */}
      {ranked && ranked.length > 0 && !picked && (
        <ul className="flex flex-col gap-1">
          {ranked.map(({ place, meters }) => {
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
                  className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-m px-3 py-2.5 text-left transition-colors duration-120 hover:bg-surface-2"
                >
                  <span className="flex items-center gap-2 text-base font-medium">
                    {place.name}
                    <span
                      // 옆의 truncate 형제가 자리를 다 가져가면 이 배지가 최소 너비까지 눌려
                      // "스팟" 같은 두 글자가 세로로 접힌다 — 줄이지도 말고 접지도 마라
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-white"
                      style={{ background: `var(--pin-${place.categoryHint})` }}
                    >
                      {CATEGORY_LABEL[place.categoryHint]}
                    </span>
                  </span>
                  <span className="flex w-full items-baseline gap-2 text-sm text-fg-2">
                    <span className="min-w-0 flex-1 truncate">
                      {place.roadAddress || place.address}
                    </span>
                    {/* 엉뚱한 지역이 섞여 와도 숫자가 먼저 말한다 (사용자 지적) */}
                    {meters !== null && (
                      <span className="tabular shrink-0 text-[12px] text-fg-3">
                        {formatDistance(meters)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {picked && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 text-sm text-fg-2">
              <span className="font-medium text-fg">{picked.name}</span> — 어디에 담을까요?
            </p>
            {results && results.length > 1 && (
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="min-h-8 shrink-0 rounded-s px-2 text-[13px] font-medium text-fg-3 transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
              >
                다시 고르기
              </button>
            )}
          </div>
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
                      ? `${CATEGORY_ITEM} bg-brand text-white`
                      : `${CATEGORY_ITEM} border border-line`
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
        <p role="status" className="text-sm text-fg-2">
          {note}
        </p>
      )}

      {noResults && onPickOnMap && (
        <button
          type="button"
          onClick={onPickOnMap}
          className="flex min-h-8 w-fit items-center rounded-full border border-line px-3 text-sm"
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
              className="flex min-h-8 items-center rounded-full border border-line px-3"
            >
              다시 검색하기
            </button>
          )}
          {failure.kind === 'save' && existingPlaceId && onShowExisting && (
            <button
              type="button"
              onClick={() => onShowExisting(existingPlaceId)}
              className="flex min-h-8 items-center rounded-full border border-line px-3"
            >
              담아둔 곳 보기
            </button>
          )}
        </div>
      )}
    </div>
  )
}
