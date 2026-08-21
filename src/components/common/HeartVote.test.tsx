/** @vitest-environment jsdom */
// 하트 (결정 #59) — 묻는 것은 하나이고, **누가 눌렀는지**가 한 줄에 들어간다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HEART_COMPACT_CLASS, HEART_TAP_CLASS, HeartVote, heartedByLabel } from './HeartVote'

afterEach(cleanup)

describe('heartedByLabel — 누가 가고 싶어하나', () => {
  it('아무도 안 눌렀으면 아무 말도 안 한다', () => {
    expect(heartedByLabel(0, [])).toBe('')
  })

  it('이름을 적은 사람은 이름으로 부른다', () => {
    expect(heartedByLabel(2, ['민수', '지현'])).toBe('민수·지현 가고 싶어해요')
  })

  it('이름을 안 적은 사람은 수로 맺는다', () => {
    expect(heartedByLabel(3, ['민수'])).toBe('민수 외 2명이 가고 싶어해요')
  })

  it('아무도 이름을 안 적었으면 수만 말한다 — 이름을 강요하지 않는다', () => {
    expect(heartedByLabel(2, [])).toBe('2명이 가고 싶어해요')
  })
})

describe('HeartVote', () => {
  it('누르면 켜지고 다시 누르면 꺼진다 — 지우는 버튼을 따로 두지 않는다', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <HeartVote label="흑돼지집" hearts={0} mine={false} names={[]} onToggle={onToggle} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '흑돼지집 가고 싶어요' }))
    expect(onToggle).toHaveBeenCalledWith(true)

    rerender(<HeartVote label="흑돼지집" hearts={1} mine names={['민수']} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: '흑돼지집 가고 싶어요 취소' }))
    expect(onToggle).toHaveBeenLastCalledWith(false)
  })

  it('기본은 손가락 크기다 (#54 와 같은 교훈)', () => {
    render(<HeartVote label="흑돼지집" hearts={0} mine={false} names={[]} onToggle={vi.fn()} />)

    expect(screen.getByRole('button').className).toContain(HEART_TAP_CLASS)
  })

  it('마우스 전용 자리는 compact 로 줄인다 — 말풍선이 길어지면 안 된다 (#52)', () => {
    render(
      <HeartVote label="흑돼지집" hearts={0} mine={false} names={[]} size="compact" onToggle={vi.fn()} />,
    )

    expect(screen.getByRole('button').className).toContain(HEART_COMPACT_CLASS)
  })

  it('누른 사람을 한 줄로 읽어 준다', () => {
    render(<HeartVote label="흑돼지집" hearts={3} mine names={['민수', '지현']} onToggle={vi.fn()} />)

    expect(screen.getByText('민수·지현 외 1명이 가고 싶어해요')).toBeTruthy()
  })

  it('읽기 전용은 누를 것이 없다', () => {
    render(<HeartVote label="흑돼지집" hearts={1} mine={false} names={['민수']} />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: /민수 가고 싶어해요/ })).toBeTruthy()
  })
})
