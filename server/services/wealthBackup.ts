/**
 * Woechentliche Sicherung der Wealth-Datenbank auf diesen Rechner.
 *
 * Wealth (imer.at) sichert sich taeglich selbst — aber auf denselben Server. Diese Kopie liegt
 * bewusst woanders: im Documents-Ordner. Gegenstelle ist `GET /api/db/pull` von wealth
 * (server/src/api/dbSync.ts), die vor dem Login-Gate haengt und statt einer Sitzung den Token
 * aus DB_PULL_TOKEN erwartet — hier als WEALTH_DB_TOKEN in der .env.
 *
 * Ausgeloest wird nicht per Cron, sondern beim ersten Oeffnen der Oberflaeche in einer neuen
 * ISO-Woche (die beginnt montags). Laeuft der Rechner eine Woche nicht, faellt diese Woche aus —
 * so gewollt, ein verpasster Montag soll nicht spaeter nachfeuern.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import db from '../db/database'
import type { WealthBackupResult, WealthBackupStatus } from '../../shared/types'

const WEALTH_URL = (process.env.WEALTH_URL ?? 'https://imer.at').replace(/\/+$/, '')
const WEALTH_DB_TOKEN = (process.env.WEALTH_DB_TOKEN ?? '').trim()
/* Die Rauten und das grosse A gehoeren zu den echten Ordnernamen (neben ~/Documents/#Unwichtig).
   Der Pfad steht bewusst hier und nicht in der .env: dort wuerde die Raute als Kommentarzeichen
   gelesen und der Wert still nach "/Users/ee/Documents/" abgeschnitten. */
const BACKUP_DIR = process.env.WEALTH_BACKUP_DIR ?? join(homedir(), 'Documents', '#Wichtig', '#Aktuell', '#PrivateWealthBackup')

/** Alles juenger als das bleibt woechentlich liegen; aelteres wird auf eine Datei je Monat geduennt. */
const KEEP_ALL_DAYS = 28
const FILE_PATTERN = /^wealth_(\d{4})-(\d{2})-(\d{2})\.zip$/
/** Eine echte DB ist ein paar MB gross. Alles darunter ist eine Fehlerseite, kein Backup. */
const MIN_PLAUSIBLE_BYTES = 100 * 1024

let inFlight: Promise<WealthBackupResult> | null = null

const readState = (key: string): string | null => {
  const row = db.query('SELECT value FROM app_state WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

const writeState = (key: string, value: string) => { db.query('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run(key, value) }

/**
 * ISO-Wochenschluessel wie "2026-W35". Der Donnerstag der Woche entscheidet, zu welchem Jahr sie
 * gehoert — sonst faellt der Jahreswechsel auseinander und die Woche um Neujahr laeuft doppelt.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const localDateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const isConfigured = (): boolean => WEALTH_DB_TOKEN.length > 0

const listBackups = (): string[] => {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR).filter((name) => FILE_PATTERN.test(name)).sort()
}

/**
 * Behaelt jede Datei der letzten vier Wochen und davor nur die jeweils neueste je Monat.
 * Die neueste Datei ueberhaupt bleibt in jedem Fall liegen — auch wenn die Uhr des Rechners spinnt.
 */
export function planRetention(filenames: string[], today: Date): string[] {
  const sorted = [...filenames].filter((n) => FILE_PATTERN.test(n)).sort()
  if (sorted.length <= 1) return []
  const newest = sorted[sorted.length - 1]
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - KEEP_ALL_DAYS)
  const newestPerMonth = new Map<string, string>()
  for (const name of sorted) newestPerMonth.set(name.slice(7, 14), name) // "wealth_YYYY-MM"

  const remove: string[] = []
  for (const name of sorted) {
    if (name === newest) continue
    const [, y, m, d] = FILE_PATTERN.exec(name)!
    if (new Date(Number(y), Number(m) - 1, Number(d)) >= cutoff) continue // juenger als vier Wochen
    if (newestPerMonth.get(name.slice(7, 14)) === name) continue // der Monatsvertreter
    remove.push(name)
  }
  return remove
}

async function downloadDatabaseZip(): Promise<Uint8Array> {
  const res = await fetch(`${WEALTH_URL}/api/db/pull`, { headers: { 'X-Db-Token': WEALTH_DB_TOKEN } })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Wealth lehnt den Token ab — WEALTH_DB_TOKEN stimmt nicht mit DB_PULL_TOKEN überein.')
    if (res.status === 404) throw new Error('Wealth kennt die Route nicht — ist DB_PULL_TOKEN dort gesetzt und der Stand deployt?')
    throw new Error(`Wealth antwortet mit HTTP ${res.status}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  // Bei falscher Gegenstelle kommt JSON oder HTML mit Status 200 zurueck; ein ZIP faengt mit "PK" an.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Antwort ist kein ZIP — falsche Adresse oder eine Fehlerseite.')
  if (bytes.length < MIN_PLAUSIBLE_BYTES) throw new Error(`ZIP ist mit ${bytes.length} Bytes zu klein, um die Datenbank zu sein.`)
  return bytes
}

async function performBackup(): Promise<WealthBackupResult> {
  if (!isConfigured()) return { ran: false, skippedReason: 'not-configured' }
  const now = new Date()
  const bytes = await downloadDatabaseZip()

  mkdirSync(BACKUP_DIR, { recursive: true })
  const filename = `wealth_${localDateKey(now)}.zip`
  const target = join(BACKUP_DIR, filename), partial = `${target}.part`
  // Erst vollstaendig danebenlegen, dann umbenennen: ein Abbruch kann so die letzte gute Kopie nicht anfassen.
  writeFileSync(partial, bytes)
  renameSync(partial, target)

  const removed = planRetention(listBackups(), now)
  for (const name of removed) {
    try { unlinkSync(join(BACKUP_DIR, name)) } catch { /* schon weg oder gesperrt — kein Grund, den Lauf zu versenken */ }
  }

  writeState('wealth_backup_last_run', now.toISOString())
  writeState('wealth_backup_last_week', isoWeekKey(now))
  writeState('wealth_backup_last_file', filename)
  return { ran: true, filename, bytes: bytes.length, removed }
}

/** Manuell ausgeloest: laeuft immer, egal welche Woche. */
export function runWealthBackup(): Promise<WealthBackupResult> {
  if (inFlight) return inFlight
  inFlight = performBackup().finally(() => { inFlight = null })
  return inFlight
}

/** Beim Oeffnen der Oberflaeche: laeuft nur, wenn diese ISO-Woche noch keine Sicherung hat. */
export function runWealthBackupIfDue(): Promise<WealthBackupResult> {
  if (!isConfigured()) return Promise.resolve({ ran: false, skippedReason: 'not-configured' })
  if (inFlight) return Promise.resolve({ ran: false, skippedReason: 'in-progress' })
  if (readState('wealth_backup_last_week') === isoWeekKey(new Date())) return Promise.resolve({ ran: false, skippedReason: 'not-due' })
  return runWealthBackup()
}

export function getWealthBackupStatus(): WealthBackupStatus {
  const files = listBackups()
  return {
    configured: isConfigured(),
    directory: BACKUP_DIR,
    lastRunAt: readState('wealth_backup_last_run'),
    lastFilename: readState('wealth_backup_last_file'),
    fileCount: files.length,
    totalBytes: files.reduce((sum, name) => sum + (existsSync(join(BACKUP_DIR, name)) ? statSync(join(BACKUP_DIR, name)).size : 0), 0),
    due: isConfigured() && readState('wealth_backup_last_week') !== isoWeekKey(new Date()),
  }
}
