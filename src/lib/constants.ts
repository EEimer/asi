/* Taktrate aller Status-Poller (Browse, Zusammenfassungen, Detail, X).
   Lag vorher als nackte 3000 in vier Views. */
export const POLL_INTERVAL_MS = 3000

/* Anhängen einer weiteren Seite ohne Duplikate — beide Listenansichten
   hatten dafür eine eigene, identische Schleife. */
export function appendUnique<T extends { id: string }>(prev: T[], incoming: T[]): T[] {
  const seen = new Set(prev.map(item => item.id))
  return [...prev, ...incoming.filter(item => !seen.has(item.id))]
}
