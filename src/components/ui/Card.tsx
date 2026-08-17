import type React from 'react'
import { cn } from '../../utils'

/**
 * Hairline + Inset-Highlight an der Oberkante (nach ../wealth): der 1px-Rahmen trennt
 * die Karte von der Seite, die aufgehellte Oberkante lässt sie darüber liegen statt
 * darin zu kleben. Dazu ein weicher Schatten (--card-shadow) – zusammen der
 * Unterschied zwischen flachem div und einer Karte, die eine eigene Ebene besetzt.
 */
export const cardSurface = 'card-elevation rounded-sm border border-surfaceBorder bg-panel'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(cardSurface, 'p-4', className)} {...props} />
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 space-y-1', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold text-content', className)} {...props} />
}

/** Hinweistext unter dem Titel – erklärt, was die Karte tut. */
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-3', className)} {...props} />
}

/**
 * Einstellungszeile: Beschriftung links, Bedienelement rechts. Spart die Zeile, die
 * ein gestapeltes Label kostet, und gibt der Karte eine Kante zum Scannen statt
 * vieler Kästen. Auf schmalen Breiten bricht die Zeile um.
 */
export function SettingRow({
  label,
  description,
  htmlFor,
  align = 'center',
  children,
  className,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  htmlFor?: string
  align?: 'center' | 'start'
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap justify-between gap-x-4 gap-y-2', align === 'center' ? 'items-center' : 'items-start', className)}>
      <div className="min-w-0 space-y-0.5">
        {htmlFor
          ? <label htmlFor={htmlFor} className="text-sm font-semibold text-content/70">{label}</label>
          : <p className="text-sm font-semibold text-content/70">{label}</p>}
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">{children}</div>
    </div>
  )
}
