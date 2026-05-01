// ============================================================
// POST /api/collect
// Endpoint principal de colección de eventos
//
// Flujo:
//   1. Validar payload
//   2. Identificar el sitio por tracking_id
//   3. Detectar bot (4 capas)
//   4. Geolocalizar IP
//   5. Parsear UserAgent
//   6. Resolver o crear sesión
//   7. Guardar evento en BD
//   8. Responder 204 (sin cuerpo — más rápido)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { detectBot }         from '@/lib/bot-detection'
import { lookupIp, extractIp } from '@/lib/geoip'
import { parseUserAgent }    from '@/lib/ua-parser'
import { getSiteByTrackingId, resolveSession } from '@/lib/session-manager'
import { touchSession }      from '@/lib/redis'
import { withTransaction }   from '@/lib/db'
import type { TrackingPayload } from '@/types/collect'
import type { PoolClient } from 'pg'

// Permite llamadas desde cualquier dominio (el script está en sitios de clientes)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control':                'no-store',
}

// ── CORS preflight ─────────────────────────────────────────
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ── Colección principal ────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── 1. Parsear body ──────────────────────────────────────
  let payload: TrackingPayload

  try {
    payload = await req.json() as TrackingPayload
  } catch {
    return new NextResponse(null, { status: 400, headers: CORS_HEADERS })
  }

  // ── 2. Validaciones mínimas ──────────────────────────────
  if (!payload.sid || !payload.session_token || !payload.url || !payload.event) {
    return new NextResponse(null, { status: 400, headers: CORS_HEADERS })
  }

  // Validar que el evento sea un string simple (evitar injection)
  if (typeof payload.event !== 'string' || payload.event.length > 64) {
    return new NextResponse(null, { status: 400, headers: CORS_HEADERS })
  }

  // Sanitizar path: solo guardar el path, nunca datos sensibles
  const safePath = sanitizePath(payload.path ?? payload.url)

  // ── 3. Identificar el sitio ──────────────────────────────
  const site = await getSiteByTrackingId(payload.sid)
  if (!site) {
    // tracking_id inválido o sitio desactivado — rechazar silenciosamente
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  // ── 4. Extraer IP del request ────────────────────────────
  const ip = extractIp(req.headers)

  // ── 5. Detección de bot (capas 1-4) ─────────────────────
  // GeoIP y UA parsing en paralelo con la detección de bot
  const [botResult, geoResult, deviceResult] = await Promise.all([
    detectBot(payload, ip),
    lookupIp(ip),
    Promise.resolve(parseUserAgent(payload.ua ?? '')),
  ])

  // ── 6. Resolver sesión ───────────────────────────────────
  let sessionId: bigint
  try {
    sessionId = await resolveSession(
      payload,
      ip,
      site.id,
      botResult,
      geoResult,
      deviceResult
    )
  } catch (err) {
    console.error('[collect] Session error:', err)
    return new NextResponse(null, { status: 500, headers: CORS_HEADERS })
  }

  // ── 7. Guardar evento ────────────────────────────────────
  try {
    await withTransaction(async (client: PoolClient) => {
      // 7a. Upsert de la página en el catálogo
      await client.query(
        'SELECT upsert_page($1, $2, $3)',
        [site.id, safePath, payload.title ?? null]
      )

      // 7b. Insertar el evento
      await client.query(`
        INSERT INTO events (
          site_id, session_id, event_type,
          url, path, query_string, page_title,
          scroll_depth, duration_ms, load_time_ms,
          js_bot_score, js_webdriver, js_no_plugins,
          js_instant_load, js_interacted, js_mouse_points,
          js_canvas_fp, properties
        ) VALUES (
          $1,  $2,  $3,
          $4,  $5,  $6,  $7,
          $8,  $9,  $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18
        )
      `, [
        site.id,
        sessionId,
        payload.event,
        truncate(payload.url, 2048),
        safePath,
        payload.query_string ? truncate(payload.query_string, 512) : null,
        payload.title ? truncate(payload.title, 512) : null,
        payload.scroll_depth ?? null,
        payload.duration_ms ?? null,
        payload.load_time_ms ?? null,
        payload.bot_signals?.bot_score ?? 0,
        payload.bot_signals?.webdriver ?? false,
        payload.bot_signals?.no_plugins ?? false,
        payload.bot_signals?.instant_load ?? false,
        payload.bot_signals?.interacted ?? false,
        payload.bot_signals?.mouse_points ?? 0,
        payload.bot_signals?.canvas_fp ? truncate(payload.bot_signals.canvas_fp, 64) : null,
        sanitizeProperties(payload.properties),
      ])

      // 7c. Log de decisión de bot (solo en primera visita / cuando hay score)
      if (botResult.score > 0) {
        await client.query(`
          INSERT INTO bot_score_log (
            session_id, layer_ua, layer_ip, layer_rate, layer_js,
            layer_behavior, final_score, final_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING
        `, [
          sessionId,
          JSON.stringify(botResult.layers.ua),
          JSON.stringify(botResult.layers.ip),
          JSON.stringify(botResult.layers.rate),
          JSON.stringify(botResult.layers.js),
          JSON.stringify(botResult.layers.behavior),
          botResult.score,
          botResult.visitType,
        ])
      }
    })

    // 7d. Refrescar TTL de la sesión en Redis
    await touchSession(payload.session_token)

  } catch (err) {
    console.error('[collect] DB insert error:', err)
    // Responder 204 igualmente — el cliente no debe reintentar
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  // ── 8. Respuesta sin cuerpo (más rápido para el cliente) ─
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ── Helpers de sanitización ────────────────────────────────

function sanitizePath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, 'https://placeholder.com')
    // Solo el pathname — sin query ni hash (pueden tener datos sensibles)
    return url.pathname.slice(0, 1024) || '/'
  } catch {
    return '/'
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) : str
}

function sanitizeProperties(
  props: Record<string, unknown> | undefined
): string {
  if (!props || typeof props !== 'object') return '{}'

  // Limitar a 20 keys y valores simples (string | number | boolean)
  const safe: Record<string, unknown> = {}
  let count = 0

  for (const [key, value] of Object.entries(props)) {
    if (count >= 20) break
    if (typeof key !== 'string' || key.length > 64) continue

    const type = typeof value
    if (type === 'string')  safe[key] = (value as string).slice(0, 256)
    else if (type === 'number' || type === 'boolean') safe[key] = value
    count++
  }

  return JSON.stringify(safe)
}
