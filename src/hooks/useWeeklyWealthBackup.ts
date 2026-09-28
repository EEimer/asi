import { useEffect } from 'react'
import { runWealthBackupIfDue } from '../api/endpoints'
import { useToast } from '../store/toastStore'

/**
 * Sichert beim ersten Oeffnen einer neuen Woche die Wealth-Datenbank in den Documents-Ordner.
 * Ob wirklich etwas zu tun ist, entscheidet der Server (server/services/wealthBackup.ts) — hier
 * faellt nur der Anstoss und der Toast an.
 *
 * Das Modul-Flag statt eines Refs, weil StrictMode den Effekt im Dev zweimal faehrt und ein Ref
 * dabei neu angelegt wird. Der Server faengt den Doppelklopfer zwar ohnehin ab, aber ein zweiter
 * Aufruf pro Seitenaufruf ist schlicht ueberfluessig.
 */
let alreadyChecked = false

export function useWeeklyWealthBackup(): void {
  const addToast = useToast((s) => s.addToast)

  useEffect(() => {
    if (alreadyChecked) return
    alreadyChecked = true

    void (async () => {
      try {
        const result = await runWealthBackupIfDue()
        if (result.ran) addToast(`Datenbank-Backup gespeichert: ${result.filename}`, 'success', 5000)
      } catch (e) {
        // Nicht verschlucken: ein stiller Fehlschlag hiesse monatelang keine Sicherung, ohne dass es auffaellt.
        addToast(`Datenbank-Backup fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`, 'error', 8000)
      }
    })()
  }, [addToast])
}
