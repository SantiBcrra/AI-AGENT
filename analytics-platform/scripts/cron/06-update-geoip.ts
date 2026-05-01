#!/usr/bin/env tsx
// ============================================================
// CRON 06 — Actualización de base de datos GeoLite2
// Horario: 1er día de cada mes a las 04:00 (0 4 1 * *)
// MaxMind actualiza GeoLite2 cada martes
// Requiere: MAXMIND_LICENSE_KEY en .env (gratis en maxmind.com)
// ============================================================

import 'dotenv/config'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { pipeline } from 'stream/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const log = (msg: string) => console.log(`[GEOIP] ${new Date().toISOString()} ${msg}`)

const DATA_DIR  = path.join(process.cwd(), 'data')
const DB_PATH   = path.join(DATA_DIR, 'GeoLite2-City.mmdb')
const TMP_PATH  = path.join(DATA_DIR, 'GeoLite2-City.tar.gz')

async function main() {
  log('=== Updating MaxMind GeoLite2 database ===')

  const licenseKey = process.env.MAXMIND_LICENSE_KEY
  if (!licenseKey) {
    log('ERROR: MAXMIND_LICENSE_KEY not set in .env')
    log('Register free at: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data')
    process.exit(1)
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

  const downloadUrl = `https://download.maxmind.com/app/geoip_download` +
    `?edition_id=GeoLite2-City&license_key=${licenseKey}&suffix=tar.gz`

  log('Downloading GeoLite2-City.mmdb...')

  const res = await fetch(downloadUrl)
  if (!res.ok) {
    log(`ERROR: Download failed (${res.status})`)
    process.exit(1)
  }

  // Guardar tar.gz
  const fileStream = createWriteStream(TMP_PATH)
  await pipeline(res.body as any, fileStream)
  log('Download complete, extracting...')

  // Extraer el .mmdb del tar.gz
  await execAsync(`tar -xzf "${TMP_PATH}" -C "${DATA_DIR}" --wildcards "*.mmdb" --strip-components=1`)
  await execAsync(`rm -f "${TMP_PATH}"`)

  log(`✓ GeoLite2-City.mmdb updated at ${DB_PATH}`)

  // Invalidar el reader cacheado (se recargará en el próximo request)
  // (En producción, reiniciar el proceso de Next.js o usar el global cache)
  log('=== GeoIP update completed ===')
  process.exit(0)
}

main().catch(err => {
  console.error('[GEOIP] Fatal error:', err)
  process.exit(1)
})
