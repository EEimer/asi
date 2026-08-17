import { useEffect, type RefObject } from 'react'

/* Lag wortgleich in BrowseView und SummariesView. Die beiden Lade-Funktionen
   selbst bleiben getrennt — sie tun genug Unterschiedliches (Feed setzt zusätzlich
   die Summarized-Map und einen Fehlertext), als dass ein gemeinsamer Loader mehr
   verstecken als sparen würde. */

const ROOT_MARGIN = '200px'

export function useInfiniteScroll(
  sentinelRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Muss stabil sein (useCallback), sonst wird der Observer bei jedem Render neu gesetzt. */
  onLoadMore: () => void,
) {
  useEffect(() => {
    if (!enabled) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) onLoadMore()
    }, { rootMargin: ROOT_MARGIN })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinelRef, enabled, onLoadMore])
}
