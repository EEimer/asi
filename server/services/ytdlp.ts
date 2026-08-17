import { existsSync } from 'fs'

/* Gemeinsame yt-dlp-Basis für youtube.ts und xcom.ts. Beide hatten vorher eine
   eigene Kopie der Binary-Suche, und nur youtube.ts eine Variante mit Deadline. */

export const YT_DLP = (() => {
  const candidates = [
    process.env.YT_DLP_PATH,
    `${process.env.HOME}/Library/Python/3.14/bin/yt-dlp`,
    `${process.env.HOME}/Library/Python/3.13/bin/yt-dlp`,
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return 'yt-dlp'
})()

// Harte Obergrenze für einen yt-dlp-Aufruf.
//
// `proc.kill()` allein genügt nicht: mit `--js-runtimes deno:…` startet yt-dlp
// einen Deno-Subprozess, der die stdout-Pipe erbt. Stirbt nur yt-dlp, bleibt die
// Pipe durch das Enkelkind offen und `new Response(proc.stdout).text()` wartet
// ewig auf EOF. Darum wird zusätzlich gegen eine Deadline gerannt und das
// Leseergebnis notfalls verworfen.
//
// Ebenso wichtig: stdout UND stderr werden gelesen. Wird stderr nur geöffnet und
// nie geleert, blockiert yt-dlp beim Schreiben, sobald der Pipe-Puffer (~64 KB)
// voll ist — und `await proc.exited` kehrt nie zurück.
export async function runYtDlp(
  args: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })

  const collect = (async () => {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    await proc.exited
    return { exitCode: proc.exitCode ?? -1, stdout, stderr }
  })()

  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`yt-dlp timeout nach ${Math.round(timeoutMs / 1000)}s`)),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([collect, deadline])
  } finally {
    clearTimeout(timer)
    if (proc.exitCode === null) proc.kill('SIGKILL')
  }
}
