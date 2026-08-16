import type React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils'

/**
 * Statuspillen (nach ../wealth, auf die hier genutzten Varianten gekürzt).
 *
 * Zwei Achsen: `variant` = Farbton, `bgStyle` = wie kräftig die Fläche ist.
 * `strong` ist der Normalfall (getönte Fläche, farbige Schrift), `filled` die
 * deckende Variante. Damit gibt es keine Stelle mehr, an der eine Pille ihre
 * drei Ebenen (Rahmen/Fläche/Schrift) selbst zusammenstellt.
 */
const badgeVariants = cva('inline-flex items-center gap-1 border font-medium leading-none', {
  variants: {
    variant: {
      primary: '',
      accent: '',
      success: '',
      danger: '',
      warning: '',
      secondary: '',
      sky: '',
    },
    bgStyle: {
      filled: '',
      strong: '',
      transparent: '',
    },
    size: {
      /** Inline-Pille im Fliesstext/in Tabellenzellen – keine feste Control-Höhe. */
      xs: 'min-h-4 rounded-sm px-1.5 py-0.5 text-[10px]',
      sm: 'min-h-5 rounded-sm px-2 py-0.5 text-xs',
    },
  },
  compoundVariants: [
    { variant: 'primary', bgStyle: 'filled', class: 'border-primary bg-primary text-white' },
    { variant: 'primary', bgStyle: 'strong', class: 'border-primary/40 bg-primary/15 text-primary' },
    { variant: 'primary', bgStyle: 'transparent', class: 'border-primary/60 bg-transparent text-primary' },
    { variant: 'accent', bgStyle: 'filled', class: 'border-accent bg-accent text-white dark:text-bg' },
    { variant: 'accent', bgStyle: 'strong', class: 'border-accent/40 bg-accent/15 text-accent' },
    { variant: 'accent', bgStyle: 'transparent', class: 'border-accent/60 bg-transparent text-accent' },
    { variant: 'success', bgStyle: 'filled', class: 'border-success bg-success text-white dark:text-bg' },
    { variant: 'success', bgStyle: 'strong', class: 'border-success/40 bg-success/15 text-success' },
    { variant: 'success', bgStyle: 'transparent', class: 'border-success/40 bg-transparent text-success' },
    { variant: 'danger', bgStyle: 'filled', class: 'border-danger bg-danger text-white dark:text-bg' },
    { variant: 'danger', bgStyle: 'strong', class: 'border-danger/40 bg-danger/15 text-danger' },
    { variant: 'danger', bgStyle: 'transparent', class: 'border-danger/40 bg-transparent text-danger' },
    { variant: 'warning', bgStyle: 'filled', class: 'border-warning bg-warning text-white dark:text-bg' },
    { variant: 'warning', bgStyle: 'strong', class: 'border-warning/40 bg-warning/15 text-warning' },
    { variant: 'warning', bgStyle: 'transparent', class: 'border-warning/40 bg-transparent text-warning' },
    { variant: 'secondary', bgStyle: 'filled', class: 'border-secondary bg-secondary text-white dark:text-bg' },
    { variant: 'secondary', bgStyle: 'strong', class: 'border-surfaceBorder bg-inputBg text-muted' },
    { variant: 'secondary', bgStyle: 'transparent', class: 'border-secondary/40 bg-transparent text-muted' },
    { variant: 'sky', bgStyle: 'filled', class: 'border-sky bg-sky text-white' },
    { variant: 'sky', bgStyle: 'strong', class: 'border-sky/40 bg-sky/15 text-sky' },
    { variant: 'sky', bgStyle: 'transparent', class: 'border-sky/40 bg-transparent text-sky' },
  ],
  defaultVariants: { variant: 'secondary', bgStyle: 'strong', size: 'sm' },
})

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, bgStyle, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, bgStyle, size }), className)} {...props} />
}
