// RFC 9457 Problem JSON — Route Handler 공통 에러 표현 (05 §규약).
// 규칙: 다섯 멤버(type/title/status/detail/instance)만 기본으로 싣고, 스택트레이스·업스트림
// 원문은 절대 넣지 않는다. 확장 멤버(예: E-03 의 cached[])는 extensions 로만 붙인다.

export const PROBLEM_CONTENT_TYPE = 'application/problem+json'

export interface ProblemInput {
  type: string // 상대 URI 참조 — 05 의 어휘 그대로 (예: 'search/quota-exceeded')
  title: string
  status: number
  detail: string
  instance: string
  extensions?: Record<string, unknown>
}

export type ProblemBody = {
  type: string
  title: string
  status: number
  detail: string
  instance: string
} & Record<string, unknown>

export function problemBody({ extensions, ...core }: ProblemInput): ProblemBody {
  // 확장을 먼저 펼친다 — 핵심 다섯 멤버는 무슨 일이 있어도 덮이지 않는다
  return { ...extensions, ...core }
}

export function problemResponse(input: ProblemInput): Response {
  return new Response(JSON.stringify(problemBody(input)), {
    status: input.status,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  })
}

// instance = 문제가 난 그 요청. 오리진은 빼고 경로+쿼리만 남긴다
export function requestInstance(request: Request): string {
  const { pathname, search } = new URL(request.url)
  return `${pathname}${search}`
}
