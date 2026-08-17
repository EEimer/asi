import type React from 'react'
import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils'
import { controlHeight, controlPadding } from './controlSizes'

/**
 * Eingabefelder nach ../wealth (`components/ui/input.tsx`).
 *
 * Die Höhe kommt aus `controlHeight`, nicht aus vertikalem Padding – sonst ergibt
 * sich die Höhe aus der Schriftgrösse und ein Input neben einem Button fluchtet
 * nicht mehr. Genau das war hier vorher der Fall: 42 Controls mit 11 verschiedenen
 * Klassen-Strings, dabei `py-2`, `py-2.5` und `py-1.5` nebeneinander.
 *
 * Abweichung von wealth: Fokusring ist `ring-2` wie beim Button. wealth nutzt hier
 * `ring-1`, das eigene UI-Review nennt das als Fehler („die Ringe fluchten nicht").
 *
 * Disabled trägt im Dark allein die Schrift: `muted` statt `content`, Fläche bleibt
 * der normale Track. Jede Abweichung der Fläche zieht dort Aufmerksamkeit an, statt
 * sie wegzunehmen.
 */
const fieldBase = 'w-full rounded-sm border border-surfaceBorder bg-inputBg text-content placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:bg-content/[0.04] disabled:text-muted dark:disabled:bg-inputBg'

const inputVariants = cva(fieldBase, {
  variants: {
    size: {
      inline: `${controlHeight.inline} ${controlPadding.inline}`,
      xs: `${controlHeight.xs} ${controlPadding.xs}`,
      sm: `${controlHeight.sm} px-3 text-xs`,
      md: `${controlHeight.md} px-3 text-sm`,
    },
  },
  defaultVariants: { size: 'md' },
})

type InputSize = VariantProps<typeof inputVariants>['size']

export const Input = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: InputSize }
>(({ className, size, ...props }, ref) => (
  <input ref={ref} className={cn(inputVariants({ size }), className)} {...props} />
))
Input.displayName = 'Input'

/** Mehrzeilig: keine Control-Höhe, dafür eine Mindesthöhe und eigenes Padding. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-[90px] px-3 py-2 text-sm', className)} {...props} />
))
Textarea.displayName = 'Textarea'

/**
 * Natives <select> statt Radix: asi braucht <optgroup> (Modell-Stufen), das Radix
 * nur über eigene Gruppen-Komponenten nachbaut. Die Optik kommt aus derselben
 * Basisklasse, damit Select, Input und Button in einer Zeile fluchten.
 *
 * `appearance-none` + eigenes Chevron, sonst zeichnet das Betriebssystem seinen
 * eigenen Pfeil auf hellem Grund mitten in ein dunkles Feld.
 */
const selectVariants = cva(
  `${fieldBase} appearance-none cursor-pointer bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9`,
  {
    variants: {
      size: {
        inline: `${controlHeight.inline} ${controlPadding.inline}`,
        xs: `${controlHeight.xs} ${controlPadding.xs}`,
        sm: `${controlHeight.sm} px-3 text-xs`,
        md: `${controlHeight.md} px-3 text-sm`,
      },
    },
    defaultVariants: { size: 'md' },
  },
)

type SelectSize = VariantProps<typeof selectVariants>['size']

export const Select = forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: SelectSize }
>(({ className, size, children, ...props }, ref) => (
  <select ref={ref} className={cn(selectVariants({ size }), 'select-chevron', className)} {...props}>
    {children}
  </select>
))
Select.displayName = 'Select'

/** Feldbeschriftung. Eine Stufe leiser als der Wert darunter. */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-xs font-medium text-muted', className)} {...props} />
}
