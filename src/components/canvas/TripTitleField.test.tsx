/** @vitest-environment jsdom */
// FR-002 — 이름은 캔버스 헤더에서 고친다. 새 여행은 이름 없이 시작하므로(결정 #27),
// 이름을 붙이는 자리가 목록이 아니라 여기다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TripError } from '@/lib/trips/api'
import { TripTitleField } from './TripTitleField'

afterEach(cleanup)

function renderField(props: Partial<Parameters<typeof TripTitleField>[0]> = {}) {
  const onRename = vi.fn().mockResolvedValue(undefined)
  const onOpen = vi.fn()
  render(<TripTitleField name="제목 없는 여행" onRename={onRename} onOpen={onOpen} {...props} />)
  return { onRename, onOpen }
}

const openEditor = () => fireEvent.click(screen.getByRole('button', { name: /이름 고치기/ }))

describe('TripTitleField — 이름 고치기 (FR-002)', () => {
  it('평소에는 이름만 보여준다 — 폼은 열려 있지 않다', () => {
    renderField()
    expect(screen.getByRole('heading', { name: '제목 없는 여행' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('누르면 그 자리에서 고친다 (모달 금지 · T-04)', () => {
    renderField()
    openEditor()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('제목 없는 여행')
  })

  it('고쳐서 저장한다', async () => {
    const { onRename } = renderField()
    openEditor()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '제주 3일' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이름 저장하기' }))
    })

    expect(onRename).toHaveBeenCalledWith('제주 3일')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('그만두면 원래 이름으로 돌아간다', () => {
    const { onRename } = renderField()
    openEditor()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '지울 이름' } })
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '제목 없는 여행' })).toBeTruthy()
  })

  it('빈 이름은 저장하지 않고 다음 행동을 알려준다 (막다른 에러 금지)', async () => {
    const { onRename } = renderField()
    openEditor()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이름 저장하기' }))
    })

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('여행 이름을 적어 주세요')
  })

  it('저장이 실패하면 문구로 알리고 폼을 열어 둔다', async () => {
    const onRename = vi.fn().mockRejectedValue(new TripError('unknown'))
    renderField({ onRename })
    openEditor()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '제주 3일' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이름 저장하기' }))
    })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('열 때 알린다 — 헤더의 다른 편집기와 동시에 열리지 않게 (강조 CTA 1개 · L-09)', () => {
    const { onOpen } = renderField()
    openEditor()
    expect(onOpen).toHaveBeenCalled()
  })

  // 반대 방향도 닫혀야 한다: 이름을 고치는 중에 기간 편집기를 열면 강조 CTA 가 둘이 된다 (L-09)
  it('닫기 신호가 오면 스스로 닫는다', () => {
    const { rerender } = render(<TripTitleField name="제목 없는 여행" onRename={vi.fn()} closeSignal={0} />)
    fireEvent.click(screen.getByRole('button', { name: /이름 고치기/ }))
    expect(screen.getByRole('textbox')).toBeTruthy()

    rerender(<TripTitleField name="제목 없는 여행" onRename={vi.fn()} closeSignal={1} />)

    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
