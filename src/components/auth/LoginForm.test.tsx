/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LoginForm } from './LoginForm'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

afterEach(cleanup)

function typeInto(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('LoginForm — 6자리 코드 입력이 기본 플로우 (FR-001, 결정 #13)', () => {
  it('asks for the code right after sending it, and signs in with it', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined)
    const verifyCode = vi.fn().mockResolvedValue(undefined)
    const onSignedIn = vi.fn()

    render(<LoginForm requestCode={requestCode} verifyCode={verifyCode} onSignedIn={onSignedIn} />)

    typeInto('이메일 주소', 't4-form@example.com')
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }))

    await screen.findByLabelText('6자리 인증 코드')
    expect(requestCode).toHaveBeenCalledWith('t4-form@example.com')
    expect(screen.getByText(/메일의 링크로도 열려요/)).toBeTruthy()

    typeInto('6자리 인증 코드', '123456')
    fireEvent.click(screen.getByRole('button', { name: '코드 확인하기' }))

    await waitFor(() => expect(verifyCode).toHaveBeenCalledWith('t4-form@example.com', '123456'))
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled())
  })

  it('offers a next action when the code does not match (SPEC §UI 규칙)', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined)
    const verifyCode = vi.fn().mockRejectedValue(new Error('Token has expired or is invalid'))

    render(<LoginForm requestCode={requestCode} verifyCode={verifyCode} onSignedIn={vi.fn()} />)

    typeInto('이메일 주소', 't4-form@example.com')
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }))
    await screen.findByLabelText('6자리 인증 코드')

    typeInto('6자리 인증 코드', '000000')
    fireEvent.click(screen.getByRole('button', { name: '코드 확인하기' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('코드')
    expect(screen.getByRole('button', { name: '코드 다시 받기' })).toBeTruthy()
  })

  it('offers a retry when the mail could not be sent', async () => {
    const requestCode = vi.fn().mockRejectedValue(new Error('rate limited'))

    render(<LoginForm requestCode={requestCode} verifyCode={vi.fn()} onSignedIn={vi.fn()} />)

    typeInto('이메일 주소', 't4-form@example.com')
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent!.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeTruthy()
    expect(screen.queryByLabelText('6자리 인증 코드')).toBeNull()
  })
})
