'use client'

// 목록 화면의 상태 보유자. 진입 모달 없이 인라인으로 폼을 펼치고,
// 강조 CTA 는 화면에 항상 하나만 남긴다 (SPEC §UI 규칙).

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createTrip, type TripSummary } from '@/lib/trips/api'
import { NewTripForm, type NewTripDraft } from './NewTripForm'
import { TripList } from './TripList'

export interface TripsPanelProps {
  trips: TripSummary[]
  onCreate?: (draft: NewTripDraft) => Promise<void>
}

async function saveTrip(draft: NewTripDraft): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  // PK 는 클라이언트가 만든다 — 재시도해도 한 행 (05 §멱등성)
  await createTrip(supabase, { id: crypto.randomUUID(), ...draft })
}

export function TripsPanel({ trips, onCreate }: TripsPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const save = onCreate ?? saveTrip

  async function handleCreate(draft: NewTripDraft) {
    await save(draft)
    setOpen(false)
    router.refresh()
  }

  return (
    <section className="flex flex-col gap-6">
      {open && <NewTripForm onCreate={handleCreate} onCancel={() => setOpen(false)} />}

      {!open && trips.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center justify-center self-start rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          새 여행 만들기
        </button>
      )}

      {(!open || trips.length > 0) && <TripList trips={trips} onCreateFirst={() => setOpen(true)} />}
    </section>
  )
}
