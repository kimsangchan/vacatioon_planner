'use client'

// FR-016 — 검색으로 못 찾는 곳은 지도에서 직접 찍는다 (E-04 provider=manual·provider_link null).
// 좌표는 롱프레스(데스크톱: 우클릭)가 이미 확정했으므로, 여기서 묻는 건 이름과 카테고리뿐이다.
// 검색 0건 안내의 "지도를 길게 눌러…"가 이 폼으로 이어진다 (막다른 에러 금지 — L-06).

import { useId, useState } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER, type LatLng } from '@/lib/map/provider'
import { PlaceError, placeErrorMessage } from '@/lib/place/api'
import type { PlaceCategory } from '@/lib/place/category'
import type { PlaceDraft } from './PlaceSearchBox'

export interface ManualPlaceFormProps {
  latLng: LatLng
  onSubmit: (draft: PlaceDraft) => Promise<void>
  onCancel: () => void
}

const CATEGORY_ITEM =
  'flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium transition-opacity duration-[120ms] hover:opacity-90'

export function ManualPlaceForm({ latLng, onSubmit, onCancel }: ManualPlaceFormProps) {
  const nameInputId = useId()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<PlaceCategory>('spot')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const trimmed = name.trim()

  async function save() {
    if (trimmed === '' || saving) return
    setSaving(true)
    setFailure(null)
    try {
      await onSubmit({
        category,
        name: trimmed,
        address: '',
        road_address: '',
        lat: latLng.lat,
        lng: latLng.lng,
        provider: 'manual',
        provider_link: null,
        phone: '',
        category_label: '',
      })
    } catch (error) {
      const placeError = error instanceof PlaceError ? error : new PlaceError('unknown')
      setFailure(placeErrorMessage(placeError.code))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="manual-place-form"
      className="flex flex-col gap-3 rounded-2xl border border-line p-3"
    >
      <p className="text-sm text-fg-2">
        {latLng.lat}, {latLng.lng} 자리예요.
      </p>

      <label htmlFor={nameInputId} className="text-sm font-medium">
        장소 이름
      </label>
      <input
        id={nameInputId}
        type="text"
        value={name}
        autoComplete="off"
        autoFocus
        placeholder="여기를 뭐라고 부를까요?"
        onChange={(event) => setName(event.target.value)}
        className="min-h-12 rounded-m border border-line bg-surface-2 px-4 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface"
      />

      <div className="flex gap-2">
        {CATEGORY_ORDER.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={item === category}
            onClick={() => setCategory(item)}
            className={
              item === category
                ? `${CATEGORY_ITEM} border border-transparent text-white`
                : `${CATEGORY_ITEM} border border-line`
            }
            style={item === category ? { background: `var(--pin-${item})` } : undefined}
          >
            {CATEGORY_LABEL[item]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={trimmed === '' || saving}
          onClick={() => void save()}
          className="flex min-h-12 flex-1 items-center justify-center rounded-l bg-brand px-4 text-[17px] font-bold text-white transition-opacity duration-[120ms] hover:opacity-90 disabled:opacity-40"
        >
          이 자리에 담기
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-11 items-center rounded-full border border-line px-4 text-sm"
        >
          그만두기
        </button>
      </div>

      {failure && (
        <p role="alert" className="text-sm">
          {failure}
        </p>
      )}
    </div>
  )
}
