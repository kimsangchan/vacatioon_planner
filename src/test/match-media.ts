// jsdom 에는 matchMedia 가 없다 — 반응형 분기를 쓰는 컴포넌트가 mount 에서 죽는다.
// 테스트가 화면 폭을 정해 데스크톱/모바일 경로를 **둘 다** 밟을 수 있게 최소 구현을 끼운다.
//
// 앱 코드에 `typeof window.matchMedia === 'function'` 가드를 두지 않는 이유:
// 그러면 테스트에서 데스크톱 경로가 영영 안 돌아 패널 상세가 검증되지 않는다.

export function installMatchMedia(width: number): void {
  const listeners = new Set<() => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
      return {
        media: query,
        matches: width >= min,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        addListener: (cb: () => void) => listeners.add(cb),
        removeListener: (cb: () => void) => listeners.delete(cb),
        dispatchEvent: () => true,
        onchange: null,
      }
    },
  })
}
