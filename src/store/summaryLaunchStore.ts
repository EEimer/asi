import { create } from 'zustand'
import type { SummaryDetail } from '../../shared/types'

/**
 * Die Link-/Custom-Prompt-Buttons stehen in der Kopfzeile und damit ausserhalb des
 * BrowseView. Damit die Feed-Liste einen dort gestarteten Lauf trotzdem sofort als
 * Platzhalterkarte zeigt – statt bis zum naechsten Feed-Refresh zu warten –, legt die
 * Kopfzeile ihn hier ab; BrowseView haengt ihn oben an und leert die Queue.
 *
 * Queue statt eines einzelnen Werts: BrowseView ist beim Start womoeglich gar nicht
 * gemountet (Lauf aus Settings o.ae.), und dann duerfen mehrere Starts nicht bis auf
 * den letzten verloren gehen.
 */
export interface SummaryLaunch {
  videoId: string
  summaryId: string
  url: string
  detail?: SummaryDetail
}

interface SummaryLaunchStore {
  pending: SummaryLaunch[]
  announce: (launch: SummaryLaunch) => void
  /** Uebernommen – die Queue leeren, damit ein Lauf nur einmal eine Karte erzeugt. */
  consume: () => void
}

export const useSummaryLaunch = create<SummaryLaunchStore>(set => ({
  pending: [],
  announce: launch => set(s => ({ pending: [...s.pending, launch] })),
  consume: () => set(s => (s.pending.length === 0 ? s : { pending: [] })),
}))
