/**
 * Bauform-Skalen 1:1 aus ../wealth (client/components/ui/controlSizes.ts).
 *
 * Drei Standard-Höhen für alle interaktiven Controls (Button, Input, Badge-as-Button,
 * SegmentedControl). `md` ist der Anker: Formularzeilen und die Toolbar-Zeile ausserhalb
 * der Cards müssen exakt fluchten.
 *
 * Spezialfälle dürfen per className abweichen – aber bewusst, nicht aus Versehen.
 */
export const controlHeight = {
  /** 24px – steht direkt neben einem <Label> und darf dessen Zeile nicht aufblaehen. */
  inline: 'h-6',
  xs: 'h-7', // 28px – Icon-Chips, Badge-as-Button, Inline-Aktionen in Tabellen
  sm: 'h-8', // 32px – kompakte Toolbars innerhalb von Cards
  md: 'h-10', // 40px – Standard: Formularzeile + Toolbar ausserhalb der Cards
} as const

export type ControlSize = keyof typeof controlHeight

/** Quadratische Icon-Buttons: Breite = Höhe. Gleiche Stufen wie controlHeight. */
export const controlWidth = {
  inline: 'w-6',
  xs: 'w-7',
  sm: 'w-8',
  md: 'w-10',
} as const

/** Icon-Grösse passend zur Control-Höhe. */
export const controlIconSize = {
  inline: 'h-3 w-3',
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
} as const

/** Horizontales Padding + Schriftgrad passend zur Control-Höhe. */
export const controlPadding = {
  inline: 'px-1.5 text-[10px]',
  xs: 'px-2 text-xs',
  sm: 'px-3 text-xs',
  md: 'px-4 text-sm',
} as const

/**
 * Spinner-Durchmesser in px. Eigene Skala, weil Spinner auch ausserhalb von Controls
 * stehen (zentrierte Ladezustaende, Overlays).
 */
export const spinnerSize = {
  xs: 12,
  sm: 16, // Standard: in Buttons und inline neben Text
  md: 20, // zentrierte Ladezustaende in Karten
  lg: 24, // Seiten- und Sektions-Ladezustaende
  xl: 32,
} as const

export type SpinnerSize = keyof typeof spinnerSize

/**
 * Innenabstand des Segment-Rahmens je Grösse – muss zur Position der aktiven Pille passen.
 * Steht hier und nicht bei der Komponente, weil ein Konstanten-Export neben einer
 * Komponente Fast Refresh bricht.
 */
export const segmentedRootPadding: Record<ControlSize, string> = {
  inline: 'p-0.5',
  xs: 'p-0.5',
  sm: 'p-1',
  md: 'p-1',
}

/**
 * Vertikale Lage der aktiven Pille. Muss zu segmentedRootPadding passen: die Pille
 * sitzt absolut im Track und soll genau in dessen Innenfläche stehen.
 *
 * top+bottom statt einer Höhe (vorher `top-1 h-[calc(100%-0.5rem)]`): so ergibt sich
 * die Höhe aus dem Track selbst und kann bei einer anderen Grösse nicht danebenliegen.
 */
export const segmentedPillInset: Record<ControlSize, string> = {
  inline: 'top-0.5 bottom-0.5',
  xs: 'top-0.5 bottom-0.5',
  sm: 'top-1 bottom-1',
  md: 'top-1 bottom-1',
}

/**
 * Eigenes Padding statt controlPadding: ein Segment ist kein Button. Die Schrift
 * bleibt in allen Grössen klein (text-xs), nur die Box wächst mit der Höhe.
 */
export const segmentedItemPadding: Record<ControlSize, string> = {
  inline: 'px-1.5 text-[10px]',
  xs: 'px-1.5 text-[11px]',
  sm: 'px-2 text-xs',
  md: 'px-2.5 text-xs',
}
