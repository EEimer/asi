import { cn } from '../../utils'

/**
 * Platzhalter-Balken für Ladezustände. Die Optik kommt aus `.skeleton-shimmer`
 * (index.css), die Grösse per className.
 *
 * Warum statt eines Spinners: ein Skelett zeigt, WAS gleich kommt und wie viel.
 * Der Spinner sagt nur „warte" und lässt die Seite danach springen, weil das
 * Layout erst mit den Daten entsteht.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-sm', className)} />
}

/** Eine Karte im Listenlayout: Thumbnail links, zwei Textzeilen rechts. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('card-elevation flex gap-4 rounded-sm border border-surfaceBorder bg-panel p-4', className)}>
      <Skeleton className="h-[100px] w-44 shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  )
}

/** Mehrere Karten untereinander – der Abstand ist derselbe wie in der echten Liste. */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}
