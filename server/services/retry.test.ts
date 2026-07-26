import assert from 'node:assert'
import {
  ApiCallError,
  RetryExhaustedError,
  computeDelay,
  getApiConcurrency,
  parseRetryAfterFromBody,
  parseRetryAfterHeader,
  setApiConcurrency,
  withRetry,
} from './retry'

let passed = 0
function ok(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ok  ${name}`) })
    .catch((e) => { console.error(`  FAIL ${name}: ${e.message}`); process.exitCode = 1 })
}

// Die echte Fehlermeldung des Users
const REAL_BODY = `{ "error": { "message": "Rate limit reached for gpt-4o in organization org-YWBXOSYUY77ARDIhUBheOjG0 on tokens per min (TPM): Limit 30000, Used 16990, Requested 15947. Please try again in 5.874s. Visit https://platform.openai.com/account/rate-limits to learn more.", "type": "tokens" } }`

await ok('parst die echte OpenAI-Fehlermeldung (5.874s)', () => {
  assert.strictEqual(parseRetryAfterFromBody(REAL_BODY), 5874)
})

await ok('parst ms / s / m / m+s Varianten', () => {
  assert.strictEqual(parseRetryAfterFromBody('Please try again in 1.2ms'), 1)
  assert.strictEqual(parseRetryAfterFromBody('Please try again in 20s'), 20_000)
  assert.strictEqual(parseRetryAfterFromBody('Please try again in 2m'), 120_000)
  assert.strictEqual(parseRetryAfterFromBody('Please try again in 1m30s'), 90_000)
  assert.strictEqual(parseRetryAfterFromBody('kein hinweis hier'), null)
})

await ok('parst Retry-After Header', () => {
  assert.strictEqual(parseRetryAfterHeader('3'), 3000)
  assert.strictEqual(parseRetryAfterHeader(null), null)
})

await ok('Delay nutzt Server-Angabe + Jitter, nie unter 250ms', () => {
  const err = new ApiCallError('x', 429, REAL_BODY, null)
  for (let i = 0; i < 200; i++) {
    const d = computeDelay(1, err)
    // base = 5874 + 500 = 6374, Jitter [0.5x, 1.5x]
    assert.ok(d >= 250 && d <= 9561, `delay ${d} ausserhalb erwartetem Bereich`)
  }
})

await ok('Backoff waechst exponentiell ohne Server-Angabe', () => {
  const err = new ApiCallError('x', 500, 'boom', null)
  const avg = (attempt: number) => {
    let sum = 0
    for (let i = 0; i < 400; i++) sum += computeDelay(attempt, err)
    return sum / 400
  }
  const a1 = avg(1), a2 = avg(2), a3 = avg(3)
  assert.ok(a2 > a1 * 1.5, `Versuch 2 (${a2|0}ms) sollte deutlich groesser als 1 (${a1|0}ms) sein`)
  assert.ok(a3 > a2 * 1.5, `Versuch 3 (${a3|0}ms) sollte deutlich groesser als 2 (${a2|0}ms) sein`)
})

await ok('Jitter erzeugt unterschiedliche Delays (kein Gleichtakt)', () => {
  const err = new ApiCallError('x', 429, REAL_BODY, null)
  const set = new Set(Array.from({ length: 50 }, () => computeDelay(1, err)))
  assert.ok(set.size > 40, `nur ${set.size} verschiedene Delays — Jitter greift nicht`)
})

await ok('429 wird wiederholt und gelingt beim 3. Versuch', async () => {
  let calls = 0
  const notified: number[] = []
  const result = await withRetry(async () => {
    calls++
    if (calls < 3) throw new ApiCallError('rate', 429, 'Please try again in 0.01s', null)
    return 'fertig'
  }, { label: 'test', onRetry: ({ attempt }) => notified.push(attempt) })
  assert.strictEqual(result, 'fertig')
  assert.strictEqual(calls, 3)
  assert.deepStrictEqual(notified, [1, 2])
})

await ok('gibt nach genau 5 Versuchen auf', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(async () => {
      calls++
      throw new ApiCallError('rate', 429, 'Please try again in 0.01s', null)
    }, { label: 'test' }),
    (e: any) => e instanceof RetryExhaustedError && e.attempts === 5,
  )
  assert.strictEqual(calls, 5)
})

await ok('401 wird NICHT wiederholt (kein transienter Fehler)', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => {
    calls++
    throw new ApiCallError('bad key', 401, 'invalid api key', null)
  }, { label: 'test' }))
  assert.strictEqual(calls, 1)
})

await ok('Netzwerkfehler wird wiederholt', async () => {
  let calls = 0
  const r = await withRetry(async () => {
    calls++
    if (calls < 2) throw new TypeError('fetch failed')
    return 'ok'
  }, { label: 'test' })
  assert.strictEqual(r, 'ok')
  assert.strictEqual(calls, 2)
})

await ok('Concurrency 1: Calls laufen strikt seriell', async () => {
  setApiConcurrency(1)
  assert.strictEqual(getApiConcurrency(), 1)
  let active = 0, maxActive = 0
  await Promise.all(Array.from({ length: 8 }, () => withRetry(async () => {
    active++; maxActive = Math.max(maxActive, active)
    await new Promise(r => setTimeout(r, 15))
    active--
  })))
  assert.strictEqual(maxActive, 1, `maxActive war ${maxActive}, erwartet 1`)
})

await ok('Concurrency 3: nie mehr als 3 gleichzeitig', async () => {
  setApiConcurrency(3)
  let active = 0, maxActive = 0
  await Promise.all(Array.from({ length: 20 }, () => withRetry(async () => {
    active++; maxActive = Math.max(maxActive, active)
    await new Promise(r => setTimeout(r, 10))
    active--
  })))
  assert.ok(maxActive <= 3, `maxActive war ${maxActive}, erwartet <= 3`)
  assert.strictEqual(maxActive, 3, 'Limit sollte auch wirklich ausgeschoepft werden')
})

await ok('Slot wird auch beim Warten gehalten (kein Nachruecken waehrend Retry)', async () => {
  setApiConcurrency(1)
  let active = 0, maxActive = 0
  let firstCalls = 0
  await Promise.all([
    withRetry(async () => {
      active++; maxActive = Math.max(maxActive, active)
      firstCalls++
      await new Promise(r => setTimeout(r, 5))
      active--
      if (firstCalls < 2) throw new ApiCallError('rate', 429, 'Please try again in 0.05s', null)
    }),
    withRetry(async () => {
      active++; maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 5))
      active--
    }),
  ])
  assert.strictEqual(maxActive, 1, `maxActive war ${maxActive} — zweiter Call ist waehrend des Backoffs reingerutscht`)
})

await ok('Limit-Erhoehung zur Laufzeit weckt wartende Calls', async () => {
  setApiConcurrency(1)
  let done = 0
  const tasks = Array.from({ length: 4 }, () => withRetry(async () => {
    await new Promise(r => setTimeout(r, 20))
    done++
  }))
  setApiConcurrency(4)
  await Promise.all(tasks)
  assert.strictEqual(done, 4)
})

console.log(`\n${passed} Tests bestanden.`)
