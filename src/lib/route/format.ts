// 이동시간·거리 표기 (결정 #45). 초·미터로 받아 사람이 읽는 말로 바꾼다.

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`
  // 소수 한 자리면 충분하다 — 100m 단위보다 정밀한 값은 추정치에 어울리지 않는다
  return `${(meters / 1000).toFixed(1)}km`
}
