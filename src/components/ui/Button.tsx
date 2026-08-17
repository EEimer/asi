import type React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils'
import { Spinner } from './Spinner'
import { controlHeight, controlPadding, controlWidth } from './controlSizes'

/**
 * Eine Achse (nach ../wealth `.cursor/rules/design-rules.mdc`): `variant` bestimmt
 * die Farbe, `outline` die Füllung, `size` die Höhe. Die Farben kommen ausschliesslich
 * aus den Theme-Tokens; -hover ist eine Ableitung daraus (siehe tailwind.config.js).
 *
 * Bewusst OHNE die dark:shadow-Glows aus wealths button.tsx: dort steht pro Screen
 * eine gefüllte Primary-CTA, hier stünden sie in einer Liste sechsfach untereinander –
 * derselbe Glow ergibt dann eine Leuchtreklame statt einer Betonung.
 *
 * Abweichung von wealth: `dark:text-bg` auf den gefüllten Varianten. Im Dark sind
 * success/danger/warning/accent/secondary die HELLEN Palettenwerte (#4ED9A4,
 * #F08A8A, #A78BFA) – weisse Schrift darauf liegt bei ~2:1. Primary trägt Weiss
 * in beiden Themes.
 */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        inline: `${controlHeight.inline} ${controlPadding.inline}`,
        xs: `${controlHeight.xs} ${controlPadding.xs}`,
        sm: `${controlHeight.sm} ${controlPadding.sm}`,
        md: `${controlHeight.md} ${controlPadding.md}`,
      },
      variant: {
        primary: '',
        secondary: '',
        accent: '',
        danger: '',
        warning: '',
        success: '',
        ghost: '',
        cancel: '',
      },
      outline: { true: '', false: '' },
      /** Quadratisch: Breite = Höhe, kein horizontales Padding. */
      iconOnly: { true: 'px-0', false: '' },
      /** Füllt die Breite des Containers – für gestapelte Aktionsspalten. */
      block: { true: 'w-full', false: '' },
    },
    compoundVariants: [
      { size: 'inline', iconOnly: true, class: controlWidth.inline },
      { size: 'xs', iconOnly: true, class: controlWidth.xs },
      { size: 'sm', iconOnly: true, class: controlWidth.sm },
      { size: 'md', iconOnly: true, class: controlWidth.md },

      { variant: 'primary', outline: false, class: 'border-primary bg-primary text-white hoverable:border-primary-hover hoverable:bg-primary-hover' },
      { variant: 'primary', outline: true, class: 'border-primary bg-panel text-primary hoverable:bg-primary-soft' },
      { variant: 'secondary', outline: false, class: 'border-secondary bg-secondary text-white dark:text-bg hoverable:border-secondary-hover hoverable:bg-secondary-hover' },
      { variant: 'secondary', outline: true, class: 'border-secondary bg-panel text-secondary hoverable:bg-secondary-soft' },
      { variant: 'accent', outline: false, class: 'border-accent bg-accent text-white dark:text-bg hoverable:border-accent-hover hoverable:bg-accent-hover' },
      { variant: 'accent', outline: true, class: 'border-accent bg-panel text-accent hoverable:bg-accent-soft' },
      { variant: 'danger', outline: false, class: 'border-danger bg-danger text-white dark:text-bg hoverable:border-danger-hover hoverable:bg-danger-hover focus-visible:ring-danger/40' },
      { variant: 'danger', outline: true, class: 'border-danger bg-panel text-danger hoverable:bg-danger-soft focus-visible:ring-danger/40' },
      { variant: 'warning', outline: false, class: 'border-warning bg-warning text-white dark:text-bg hoverable:border-warning-hover hoverable:bg-warning-hover focus-visible:ring-warning/40' },
      { variant: 'warning', outline: true, class: 'border-warning bg-panel text-warning hoverable:bg-warning-soft focus-visible:ring-warning/40' },
      { variant: 'success', outline: false, class: 'border-success bg-success text-white dark:text-bg hoverable:border-success-hover hoverable:bg-success-hover focus-visible:ring-success/40' },
      { variant: 'success', outline: true, class: 'border-success bg-panel text-success hoverable:bg-success-soft focus-visible:ring-success/40' },

      // Neutrale Varianten: kein eigener Farbton, nur Deckkraft auf der Textfarbe –
      // dadurch in Light und Dark automatisch richtig herum.
      { variant: 'ghost', class: 'border-transparent bg-transparent text-content hoverable:bg-content/10' },
      { variant: 'cancel', outline: false, class: 'border-secondary/50 bg-secondary/50 text-white dark:text-bg hoverable:bg-secondary/70' },
      { variant: 'cancel', outline: true, class: 'border-surfaceBorder bg-panel text-content hoverable:bg-content/10' },
    ],
    defaultVariants: {
      variant: 'primary',
      outline: false,
      size: 'md',
      iconOnly: false,
      block: false,
    },
  },
)

type ButtonVariantProps = VariantProps<typeof buttonVariants>
export type ButtonVariant = NonNullable<ButtonVariantProps['variant']> | 'outline'

/**
 * Für `<a>` und react-router `<Link>`, die als Button auftreten. Ohne das müssten
 * Link-Buttons ihre Klassen wieder von Hand zusammensetzen – genau die Stelle, an
 * der die Bauformen frueher auseinanderliefen.
 */
/* eslint-disable-next-line react-refresh/only-export-components --
   buttonClasses gehoert neben die cva-Definition: eine zweite Datei muesste die
   Variantentabelle importieren oder duplizieren. Kostet nur Fast Refresh hier. */
export function buttonClasses(
  opts: Omit<ButtonVariantProps, 'variant'> & { variant?: ButtonVariant } = {},
  className?: string,
): string {
  const { variant, outline, ...rest } = opts
  const isOutlineAlias = variant === 'outline'
  return cn(
    buttonVariants({
      ...rest,
      variant: isOutlineAlias ? 'primary' : (variant ?? 'primary'),
      outline: isOutlineAlias ? true : (outline ?? false),
    }),
    className,
  )
}

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>
  & Omit<ButtonVariantProps, 'variant'>
  & {
    /** `outline` ist ein Alias für variant="primary" outline. */
    variant?: ButtonVariant
    loading?: boolean
  }

export function Button({ className, outline, size, iconOnly, block, children, type, variant, loading, disabled, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={buttonClasses({ variant, outline, size, iconOnly, block }, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Spinner className="shrink-0" />
          {/* Icon-children weglassen, sonst wird der Button breiter als im Idle-Zustand */}
          {typeof children === 'string' || typeof children === 'number' ? children : null}
        </>
      ) : (
        children
      )}
    </button>
  )
}
