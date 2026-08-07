import { describe, expect, it } from 'vitest'
import { TripError, toTripError, tripErrorMessage } from './api'

describe('toTripError — PostgREST 오류 → 계약 코드 (docs/design/05 E-02)', () => {
  it('maps the create_trip date-range guard', () => {
    const error = toTripError({
      code: 'P0001',
      message: 'validation/date-range: end_date must not precede start_date',
    })

    expect(error).toBeInstanceOf(TripError)
    expect(error.code).toBe('validation/date-range')
  })

  it('maps a repeated client-generated UUID to a duplicate (05 §멱등성)', () => {
    expect(
      toTripError({ code: '23505', message: 'duplicate key value violates unique constraint "trips_pkey"' }).code,
    ).toBe('conflict/duplicate')
  })

  it('falls back to unknown so the UI still offers a next step', () => {
    expect(toTripError({ code: '08006', message: 'connection failure' }).code).toBe('unknown')
  })
})

describe('tripErrorMessage — 사용자 문구 (SPEC §UI 규칙: 해요체)', () => {
  it('explains the date range in plain Korean', () => {
    const message = tripErrorMessage('validation/date-range')

    expect(message).toContain('끝나는 날')
    expect(message.endsWith('요.') || message.endsWith('요!')).toBe(true)
  })

  it('always has something to say', () => {
    expect(tripErrorMessage('unknown').length).toBeGreaterThan(0)
    expect(tripErrorMessage('conflict/duplicate').length).toBeGreaterThan(0)
    expect(tripErrorMessage('not-found').length).toBeGreaterThan(0)
  })
})
