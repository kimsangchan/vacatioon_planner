// 금액 표시·입력 (결정 #17 — 원 단위 정수). 저장도 계산도 정수로만 하고,
// 콤마는 화면에서만 붙인다. 소수·통화 기호는 만들지 않는다 (MVP 는 KRW 고정).

const MAX_DIGITS = 9 // 999,999,999원 — integer 컬럼 상한 안쪽

export function formatAmount(amount: number): string {
  return amount.toLocaleString('ko-KR')
}

export function formatWon(amount: number): string {
  return `${formatAmount(amount)}원`
}

// 숫자 키패드로 들어온 문자열을 원 단위 정수로. 빈 입력은 "미입력"(null)이며 0원과 다르다.
// 부호·소수점·콤마는 자릿수만 남기고 버린다 — 음수 금액이 만들어질 길을 두지 않는다.
export function parseAmountInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS)
  return digits === '' ? null : Number.parseInt(digits, 10)
}

// 입력창에 되돌려 줄 값 — 사용자가 치는 동안에도 천 단위가 보이게 한다
export function formatAmountInput(raw: string): string {
  const amount = parseAmountInput(raw)
  return amount === null ? '' : formatAmount(amount)
}
