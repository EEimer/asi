/**
 * Retry + Concurrency-Kontrolle für externe API-Calls (OpenAI / Anthropic).
 *
 * Zwei Mechanismen greifen ineinander:
 *  1. Ein globaler Semaphore begrenzt, wie viele API-Calls gleichzeitig laufen.
 *     Das ist der eigentliche Schutz gegen TPM-Limits, wenn mehrere Videos
 *     parallel verarbeitet werden.
 *  2. Wenn trotzdem ein 429 (oder 5xx / Netzwerkfehler) kommt, wird der Call
 *     mit exponentiellem Backoff + Jitter wiederholt.
 */

export const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 60_000

export type RetryNotifier = (info: {
  attempt: number
  maxAttempts: number
  delayMs: number
  reason: string
}) => void

/** Fehler, der nach Ausschöpfen aller Versuche geworfen wird. */
export class RetryExhaustedError extends Error {
  readonly attempts: number
  readonly lastError: unknown

  constructor(message: string, attempts: number, lastError: unknown) {
    super(message)
    this.name = 'RetryExhaustedError'
    this.attempts = attempts
    this.lastError = lastError
  }
}

/** Fehler eines API-Calls inkl. HTTP-Status und Headern, damit retry entscheiden kann. */
export class ApiCallError extends Error {
  readonly status: number
  readonly body: string
  readonly retryAfterHeader?: string | null

  constructor(message: string, status: number, body: string, retryAfterHeader?: string | null) {
    super(message)
    this.name = 'ApiCallError'
    this.status = status
    this.body = body
    this.retryAfterHeader = retryAfterHeader
  }
}

// ---------------------------------------------------------------------------
// Semaphore
// ---------------------------------------------------------------------------

class Semaphore {
  private limit: number
  private active = 0
  private queue: Array<() => void> = []

  constructor(limit: number) {
    this.limit = Math.max(1, limit)
  }

  setLimit(limit: number) {
    const next = Math.max(1, Math.floor(limit) || 1)
    if (next === this.limit) return
    this.limit = next
    this.drain()
  }

  getLimit(): number {
    return this.limit
  }

  /** Anzahl der Calls, die gerade auf einen freien Slot warten. */
  getQueueLength(): number {
    return this.queue.length
  }

  private drain() {
    while (this.active < this.limit && this.queue.length > 0) {
      const next = this.queue.shift()!
      this.active++
      next()
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) {
      this.active++
    } else {
      await new Promise<void>(resolve => this.queue.push(resolve))
    }
    try {
      return await fn()
    } finally {
      this.active--
      this.drain()
    }
  }
}

const semaphore = new Semaphore(1)

/** Wird beim Start und bei jeder Settings-Änderung aufgerufen. */
export function setApiConcurrency(limit: number) {
  semaphore.setLimit(limit)
}

export function getApiConcurrency(): number {
  return semaphore.getLimit()
}

export function getQueueLength(): number {
  return semaphore.getQueueLength()
}

// ---------------------------------------------------------------------------
// Retry-Logik
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * OpenAI schreibt die exakte Wartezeit in die Fehlermeldung:
 *   "Please try again in 5.874s"  /  "try again in 1.2ms"  /  "try again in 1m30s"
 * Diese Angabe ist präziser als jeder geratene Backoff, also nutzen wir sie.
 */
export function parseRetryAfterFromBody(body: string): number | null {
  if (!body) return null

  const combined = body.match(/try again in\s+(?:(\d+(?:\.\d+)?)m(?!s))?\s*(\d+(?:\.\d+)?)s/i)
  if (combined) {
    const minutes = combined[1] ? parseFloat(combined[1]) : 0
    const seconds = parseFloat(combined[2])
    return Math.round((minutes * 60 + seconds) * 1000)
  }

  const ms = body.match(/try again in\s+(\d+(?:\.\d+)?)ms/i)
  if (ms) return Math.round(parseFloat(ms[1]))

  const s = body.match(/try again in\s+(\d+(?:\.\d+)?)s/i)
  if (s) return Math.round(parseFloat(s[1]) * 1000)

  const minOnly = body.match(/try again in\s+(\d+(?:\.\d+)?)m(?!s)/i)
  if (minOnly) return Math.round(parseFloat(minOnly[1]) * 60_000)

  return null
}

/** Retry-After Header: entweder Sekunden oder ein HTTP-Datum. */
export function parseRetryAfterHeader(header: string | null | undefined): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000))
  const date = Date.parse(header)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return null
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiCallError) {
    // 429 = Rate Limit, 5xx = Serverseitig. 408/409 = Timeout/Conflict.
    return error.status === 429 || error.status === 408 || error.status === 409 || error.status >= 500
  }
  // Netzwerkfehler (fetch failed, ECONNRESET, Timeouts) sind ebenfalls transient.
  if (error instanceof Error) {
    return /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|terminated/i.test(
      error.message,
    )
  }
  return false
}

/**
 * Wartezeit für den nächsten Versuch.
 * Bevorzugt die vom Server genannte Zeit, sonst exponentieller Backoff.
 * In beiden Fällen kommt Jitter dazu, damit parallele Calls nicht im
 * Gleichtakt zurückkommen und sofort wieder ins Limit laufen.
 */
export function computeDelay(attempt: number, error: unknown): number {
  let base: number | null = null

  if (error instanceof ApiCallError) {
    base = parseRetryAfterHeader(error.retryAfterHeader) ?? parseRetryAfterFromBody(error.body)
    if (base !== null) {
      // Kleiner Puffer, weil das Rate-Limit-Fenster serverseitig gleitet.
      base = base + 500
    }
  }

  if (base === null) {
    base = BASE_DELAY_MS * Math.pow(2, attempt - 1)
  }

  // Full Jitter im Bereich [0.5x, 1.5x]
  const jittered = base * (0.5 + Math.random())
  return Math.min(MAX_DELAY_MS, Math.max(250, Math.round(jittered)))
}

function describe(error: unknown): string {
  if (error instanceof ApiCallError) {
    if (error.status === 429) return 'Rate Limit (429)'
    return `HTTP ${error.status}`
  }
  return error instanceof Error ? error.message.slice(0, 120) : 'Unbekannter Fehler'
}

/**
 * Führt fn aus: erst durch den Concurrency-Gate, dann mit Retry.
 * Der Semaphore-Slot wird über alle Versuche gehalten — sonst würden beim
 * Warten neue Calls nachrücken und das Limit erneut sprengen.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { label?: string; onRetry?: RetryNotifier; maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  const label = options.label ?? 'API'

  return semaphore.run(async () => {
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error

        if (!isRetryable(error) || attempt === maxAttempts) break

        const delayMs = computeDelay(attempt, error)
        const reason = describe(error)
        console.warn(
          `[retry] ${label}: ${reason} — Versuch ${attempt}/${maxAttempts} fehlgeschlagen, warte ${(delayMs / 1000).toFixed(1)}s`,
        )
        options.onRetry?.({ attempt, maxAttempts, delayMs, reason })
        await sleep(delayMs)
      }
    }

    if (isRetryable(lastError)) {
      throw new RetryExhaustedError(
        `${label}: nach ${maxAttempts} Versuchen aufgegeben — ${describe(lastError)}`,
        maxAttempts,
        lastError,
      )
    }
    throw lastError
  })
}

/**
 * fetch-Wrapper, der Fehlerantworten in ApiCallError übersetzt,
 * damit withRetry Status und Retry-After auswerten kann.
 */
export async function fetchOrThrow(
  url: string,
  init: RequestInit,
  errorPrefix: string,
): Promise<Response> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.text()
    throw new ApiCallError(
      `${errorPrefix} ${response.status}: ${body.slice(0, 300)}`,
      response.status,
      body,
      response.headers.get('retry-after'),
    )
  }
  return response
}
