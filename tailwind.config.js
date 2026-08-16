/**
 * Farb- und Radius-System 1:1 aus ../wealth (tailwind.config.js) übernommen.
 *
 * Ableitungen statt neuer Tokens: zu jedem semantischen Token entstehen automatisch
 *   bg-<token>          – die Farbe selbst, mit Opacity-Modifier (bg-primary/15)
 *   bg-<token>-hover    – der Hover-Schritt. Mischt mit --hover-mix (schwarz im Light,
 *                         weiss im Dark), ist also in beiden Themes „kräftiger".
 *   bg-<token>-soft     – deckende, dezente Variante auf Panel-Grund. Ersetzt
 *                         bg-<token>/12 dort, wo Transparenz stört (überlappende Layer).
 * Für Transparenz braucht es nichts Zusätzliches – das leistet der /<alpha-value>-Slot.
 */
import plugin from 'tailwindcss/plugin'

function derived(cssVar) {
  return {
    DEFAULT: `rgb(var(${cssVar}) / <alpha-value>)`,
    hover: `color-mix(in srgb, rgb(var(${cssVar})), var(--hover-mix) 15%)`,
    soft: `color-mix(in srgb, rgb(var(${cssVar})) 12%, rgb(var(--panel)))`,
  }
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      /* Wealth kennt genau eine Kantenweichheit. Hier hängen deshalb alle vier
         gebräuchlichen Stufen an --radius statt nur rounded-sm: die bestehenden
         rounded-lg/-xl im Code bekommen so dieselbe Kante, ohne dass jede
         Fundstelle umgeschrieben werden muss. rounded-inner ist eine Stufe weicher,
         für Elemente in einem gerundeten Container (Pille im SegmentedControl). */
      borderRadius: {
        sm: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius)',
        xl: 'var(--radius)',
        inner: 'var(--radius-inner)',
      },
      colors: {
        primary: derived('--primary'),
        secondary: derived('--secondary'),
        accent: derived('--accent'),
        tertiary: derived('--tertiary'),
        danger: derived('--danger'),
        success: derived('--success'),
        warning: derived('--warning'),
        pink: derived('--pink'),
        sky: derived('--sky'),
        panel: derived('--panel'),
        inputBg: derived('--input-bg'),
        /* Zeilen-, Item- und Karten-Hover. Eine Klasse, in beiden Themes korrekt. */
        rowHover: 'rgb(var(--row-hover) / <alpha-value>)',
        bg: 'rgb(var(--bg) / <alpha-value>)',
        sidebar: 'rgb(var(--bg-sidebar) / <alpha-value>)',
        content: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        /* Dritte Textstufe unter muted – Micro-Labels, Zeitstempel, leere Zellen. */
        dim: 'rgb(var(--text-dim) / <alpha-value>)',
        /* Noch eine Stufe leiser als dim – ausschliesslich Platzhalterstriche. */
        faint: 'rgb(var(--text-faint) / <alpha-value>)',
        /* Akzent als Text auf getoenter Akzentflaeche (aktiver Nav-Tab) – --primary
           traegt dort nicht, der Kontrast zur eigenen 16%-Flaeche ist zu gering. */
        accentText: 'rgb(var(--accent-text) / <alpha-value>)',
        surfaceBorder: 'rgb(var(--border) / <alpha-value>)',
        /* Leiser als surfaceBorder – ausschliesslich Zeilentrenner in Tabellen. */
        surfaceBorderSoft: 'rgb(var(--border-soft) / <alpha-value>)',
      },
    },
  },
  plugins: [
    /* `hoverable:` statt `hover:enabled:`.
       CSS `:enabled` matcht ausschliesslich Formularelemente (button, input, select,
       textarea, …). Ein <a> ist NIE :enabled – auf Link-Buttons (buttonClasses an
       <a>/<Link>) fiel der Hover damit komplett aus, obwohl die Klasse dranstand.
       `:not(:disabled)` trifft beides: es schliesst deaktivierte Buttons aus und
       laesst Anker durch. */
    plugin(({ addVariant }) => {
      addVariant('hoverable', '&:not(:disabled):hover')
    }),
  ],
}
