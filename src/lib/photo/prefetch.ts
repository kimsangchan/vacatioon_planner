// FR-006 / SC-002 — 호버에서 카드까지 400ms 를 지키려면 그때 네트워크를 타면 안 된다.
// 캔버스가 열릴 때 Trip Bundle 의 썸네일을 미리 받아 두고, 화면을 떠날 때 링크를 걷어낸다.

export function prefetchThumbnails(urls: string[]): () => void {
  if (typeof document === 'undefined') return () => undefined

  const seen = new Set<string>()
  for (const link of Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]'),
  )) {
    seen.add(link.href)
    const raw = link.getAttribute('href')
    if (raw) seen.add(raw)
  }

  const added: HTMLLinkElement[] = []
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)

    const link = document.createElement('link')
    link.setAttribute('rel', 'prefetch')
    link.setAttribute('as', 'image')
    link.setAttribute('href', url)
    document.head.appendChild(link)
    added.push(link)
  }

  return () => {
    for (const link of added) link.remove()
  }
}
