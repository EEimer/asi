/**
 * Marken-Zeichen von ASI. Deckungsgleich mit public/assets/favicon/favicon.svg –
 * bei Aenderungen beide Dateien ziehen.
 *
 * Prompt-Winkel in Graphit, darunter eine weisse Zeile: oben die Eingabe, darunter
 * das Destillat. Bewusst weit weg vom Schwester-Projekt Wealth (Indigo-Kachel,
 * weisses P): anderer Farbkreis-Sektor UND umgekehrte Polaritaet.
 *
 * Die Kachel bringt Grund und Radius selbst mit – deshalb keine Hintergrundfarbe
 * von aussen setzen, sonst liegt ein Rechteck hinter den runden Ecken.
 */
export default function BrandMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="ASI">
      <defs>
        <linearGradient id="asiBrandTile" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#3FD9A2" />
          <stop offset="1" stopColor="#0C7C59" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#asiBrandTile)" />
      <rect x="4" y="4" width="504" height="504" rx="108" fill="none" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="8" />
      <path d="M134 148 L240 250 L134 352" fill="none" stroke="#12161F" strokeWidth="70" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="270" y="314" width="152" height="76" rx="38" fill="#FFFFFF" />
    </svg>
  )
}
