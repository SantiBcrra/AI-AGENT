// ============================================================
// Session Manager — crea o reutiliza sesiones
// Sin cookies: fingerprint anónimo + token de sesión
// ============================================================

import crypto from 'crypto'
import { queryOne, withTransaction } from './db'
import { getSession, setSession, getCachedSite, setCachedSite } from './redis'
import { parseUserAgent } from './ua-parser'
import { lookupIp } from './geoip'
import type { TrackingPayload, BotDetectionResult, GeoResult, DeviceResult } from '@/types/collect'
import type { PoolClient } from 'pg'

interface Site {
  id: number
  client_id: number
  domain: string
}

interface SessionRow {
  id: string   // bigint llega como string desde pg
}

// ── Obtener site por tracking_id ───────────────────────────

export async function getSiteByTrackingId(trackingId: string): Promise<Site | null> {
  // 1. Intentar desde cache Redis
  const cached = await getCachedSite(trackingId)
  if (cached) {
    return { id: cached.id, client_id: cached.clientId, domain: cached.domain }
  }

  // 2. Consultar BD
  const site = await queryOne<Site>(
    'SELECT id, client_id, domain FROM sites WHERE tracking_id = $1 AND is_active = true',
    [trackingId]
  )

  if (site) {
    await setCachedSite(trackingId, {
      id: site.id,
      clientId: site.client_id,
      domain: site.domain,
    })
  }

  return site
}

// ── Generar fingerprint anónimo ────────────────────────────
// hash(ip + ua + language + screen + date)
// El "date" hace que el fingerprint cambie cada día (privacidad)

export function buildFingerprint(
  ip: string,
  ua: string,
  language: string,
  screen: string
): string {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const raw   = [ip, ua, language, screen, today].join('|')
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

// ── Detectar source/medium desde referrer y UTMs ───────────

function classifyTrafficSource(payload: TrackingPayload): {
  source: string
  medium: string
} {
  // UTMs tienen prioridad
  if (payload.utm_source) {
    return {
      source: payload.utm_source.toLowerCase(),
      medium: (payload.utm_medium ?? 'unknown').toLowerCase(),
    }
  }

  const ref = payload.ref ?? ''
  if (!ref) return { source: 'direct', medium: 'none' }

  try {
    const refDomain = new URL(ref).hostname.replace(/^www\./, '')

    // Buscadores orgánicos
    const searchEngines: Record<string, string> = {
      'google.com': 'google', 'google.': 'google',
      'bing.com': 'bing',
      'yahoo.com': 'yahoo',
      'duckduckgo.com': 'duckduckgo',
      'yandex.': 'yandex',
      'baidu.com': 'baidu',
      'ecosia.org': 'ecosia',
      'brave.com': 'brave',
      'search.yahoo.com': 'yahoo',
    }

    for (const [domain, name] of Object.entries(searchEngines)) {
      if (refDomain.includes(domain)) {
        return { source: name, medium: 'organic' }
      }
    }

    // Redes sociales
    const socialNetworks: Record<string, string> = {
      'facebook.com': 'facebook', 'fb.com': 'facebook',
      'instagram.com': 'instagram',
      'twitter.com': 'twitter', 'x.com': 'twitter',
      'linkedin.com': 'linkedin',
      'youtube.com': 'youtube',
      'tiktok.com': 'tiktok',
      'pinterest.com': 'pinterest',
      'reddit.com': 'reddit',
      'whatsapp.com': 'whatsapp',
      't.me': 'telegram',
    }

    for (const [domain, name] of Object.entries(socialNetworks)) {
      if (refDomain.includes(domain)) {
        return { source: name, medium: 'social' }
      }
    }

    // Email clients
    const emailClients = ['mail.', 'outlook.', 'gmail.', 'yahoo.mail']
    if (emailClients.some(e => refDomain.includes(e))) {
      return { source: refDomain, medium: 'email' }
    }

    // Referral genérico
    return { source: refDomain, medium: 'referral' }

  } catch {
    return { source: 'direct', medium: 'none' }
  }
}

// ── Crear o recuperar sesión ───────────────────────────────

export async function resolveSession(
  payload: TrackingPayload,
  ip: string,
  siteId: number,
  botResult: BotDetectionResult,
  geoResult: GeoResult,
  deviceResult: DeviceResult
): Promise<bigint> {
  // 1. Buscar sesión activa en Redis
  const cached = await getSession(payload.session_token)
  if (cached && cached.siteId === siteId) {
    return BigInt(cached.id)
  }

  // 2. No existe — crear nueva sesión en BD
  const fingerprint = buildFingerprint(
    ip,
    payload.ua,
    payload.lang ?? '',
    payload.screen ?? ''
  )

  const ipHash   = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)
  const refUrl   = payload.ref ?? null
  const refDomain = refUrl ? (() => {
    try { return new URL(refUrl).hostname.replace(/^www\./, '') } catch { return null }
  })() : null

  const { source, medium } = classifyTrafficSource(payload)

  // Parsear screen
  const [screenW, screenH] = (payload.screen ?? '').split('x').map(Number)
  const [vpW, vpH]         = (payload.viewport ?? '').split('x').map(Number)

  const session = await withTransaction(async (client: PoolClient) => {
    const row = await client.query<SessionRow>(`
      INSERT INTO sessions (
        site_id, fingerprint, session_token,
        referrer, referrer_domain, source, medium,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        browser, browser_version, engine,
        os, os_version, device_type, device_brand,
        screen_width, screen_height, viewport_width, viewport_height,
        language, timezone_offset,
        ip_hash, country_code, country_name, region, city,
        latitude, longitude, is_vpn, is_proxy,
        bot_score, visit_type, bot_reason
      ) VALUES (
        $1,  $2,  $3,
        $4,  $5,  $6,  $7,
        $8,  $9,  $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25,
        $26, $27, $28, $29, $30,
        $31, $32, $33, $34,
        $35, $36, $37
      )
      RETURNING id
    `, [
      siteId, fingerprint, payload.session_token,
      refUrl, refDomain, source, medium,
      payload.utm_source ?? null,
      payload.utm_medium ?? null,
      payload.utm_campaign ?? null,
      payload.utm_content ?? null,
      payload.utm_term ?? null,
      deviceResult.browser, deviceResult.browserVersion, deviceResult.engine,
      deviceResult.os, deviceResult.osVersion, deviceResult.deviceType, deviceResult.deviceBrand,
      isNaN(screenW) ? null : screenW,
      isNaN(screenH) ? null : screenH,
      isNaN(vpW) ? null : vpW,
      isNaN(vpH) ? null : vpH,
      payload.lang ?? null,
      payload.tz_offset ?? null,
      ipHash,
      geoResult.countryCode, geoResult.countryName,
      geoResult.region, geoResult.city,
      geoResult.latitude, geoResult.longitude,
      geoResult.isVpn, geoResult.isProxy,
      botResult.score, botResult.visitType, botResult.reason,
    ])
    return row.rows[0]
  })

  const sessionId = BigInt(session.id)

  // 3. Guardar en Redis para los próximos eventos de esta sesión
  await setSession(payload.session_token, {
    id: session.id,
    siteId,
    fingerprint,
    startedAt: Date.now(),
    pagesVisited: 0,
  })

  return sessionId
}
