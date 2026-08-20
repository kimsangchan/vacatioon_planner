/** @vitest-environment node */
// 공유 링크 (결정 #3·#46). 링크에는 hex 만 싣는다 — 주소창의 백슬래시는 복사하다 흘린다.

import { describe, expect, it, vi } from 'vitest'
import { disableShare, enableShare, isShareToken, shareUrl, toBytea, toHex } from './api'

describe('토큰 표기', () => {
  it('PostgREST 의 bytea 접두사를 벗겨 낸다', () => {
    expect(toHex('\\x9f2c00112233445566778899aabbccdd')).toBe('9f2c00112233445566778899aabbccdd')
  })

  it('이미 hex 면 그대로 둔다 — 두 번 벗기지 않는다', () => {
    expect(toHex('9f2c00112233445566778899aabbccdd')).toBe('9f2c00112233445566778899aabbccdd')
  })

  it('RPC 로 되돌릴 땐 접두사를 다시 붙인다', () => {
    expect(toBytea('9f2c')).toBe('\\x9f2c')
  })

  it('16바이트(hex 32자)만 통과시킨다 — 서버에 묻기 전에 거른다', () => {
    expect(isShareToken('9f2c00112233445566778899aabbccdd')).toBe(true)
    expect(isShareToken('9F2C00112233445566778899AABBCCDD')).toBe(false) // 대문자는 우리가 안 만든다
    expect(isShareToken('9f2c')).toBe(false)
    expect(isShareToken('../../etc/passwd')).toBe(false)
  })

  it('주소는 /s/<hex> 다 — 라우트 뎁스를 늘리지 않는다', () => {
    expect(shareUrl('https://a.app', 'abc')).toBe('https://a.app/s/abc')
  })
})

describe('링크 켜기·끄기', () => {
  it('켜면 서버가 만든 토큰을 hex 로 돌려준다 — 클라이언트가 만들지 않는다', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: '\\xdeadbeef', error: null })

    await expect(enableShare({ rpc } as never, 't1')).resolves.toBe('deadbeef')
    expect(rpc).toHaveBeenCalledWith('enable_share', { trip_id: 't1' })
  })

  it('끄기는 값을 돌려주지 않는다', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })

    await expect(disableShare({ rpc } as never, 't1')).resolves.toBeUndefined()
  })

  it('실패는 삼키지 않는다 — 링크가 안 켜졌는데 켜졌다고 보이면 안 된다', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('nope') })

    await expect(enableShare({ rpc } as never, 't1')).rejects.toThrow('nope')
  })
})
