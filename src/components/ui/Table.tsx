import type React from 'react'
import { cn } from '../../utils'

/**
 * Micro-Label: benennt eine Spalte oder eine Zahl, konkurriert aber nicht mit ihr.
 * Deshalb `text-dim` und nicht `text-muted`.
 */
export const microLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-dim'

export function Table({ children, className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    // tabular-nums fuer die ganze Tabelle: mit proportionalen Ziffern haben 1 und 8
    // verschiedene Breiten, dadurch springen die Spalten beim Scrollen sichtbar.
    <table className={cn('w-full border-collapse text-left text-[13px] tabular-nums', className)} {...props}>
      {children}
    </table>
  )
}

/** Spaltenköpfe sind Micro-Labels: klein, gesperrt, auf text-dim. */
export function TableHeader({ children, className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn(microLabelClass, className)} {...props}>{children}</thead>
}

export function TableHeaderRow({ children, className, withBorder = false, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { withBorder?: boolean }) {
  return <tr className={cn(withBorder && 'border-b border-surfaceBorder', className)} {...props}>{children}</tr>
}

export function TableHeaderCell({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('py-2', className)} {...props}>{children}</th>
}

export function TableBody({ children, className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('text-content/70', className)} {...props}>{children}</tbody>
}

export function TableRow({
  children,
  className,
  isLast = false,
  isTotal = false,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { isLast?: boolean; isTotal?: boolean }) {
  return (
    <tr
      className={cn(
        // Zeilentrenner auf --border-soft: innerhalb einer Karte darf die Linie leiser
        // sein als die Kontur der Karte selbst, sonst zerfaellt die Tabelle in Kaesten.
        !isLast && !isTotal && 'border-b border-surfaceBorderSoft',
        isTotal && 'border-t-2 border-surfaceBorder font-semibold text-content',
        'row-interactive',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TableCell({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('py-3', className)} {...props}>{children}</td>
}

/**
 * Platzhalter für eine leere Zelle: Halbgeviertstrich in --text-faint. Kein
 * Geviertstrich und kein --text-muted – der Strich soll erkennbar sein, aber nicht
 * dieselbe Präsenz haben wie ein echter Wert daneben.
 */
export function EmptyCell({ className }: { className?: string }) {
  return <span className={cn('text-faint', className)}>–</span>
}
