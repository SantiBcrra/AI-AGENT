// ============================================================
// Conexión a Redis — rate limiting y cache de sesiones
// 64MB disponibles en el servidor
// ============================================================

import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var _redis: Redis | undefined
}

function createRedis(): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    db: 0,
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: true,
  })

  client.on('error', (err: Error) => {
    // No crashear si Redis no está disponible
    console.error('[Redis] Connection error:', err.message)
  })

  return client
}

export const redis: Redis =
  global._redis ?? (global._redis = createRedis())

// ── Rate limiting ──────────────────────────────────────────

/**
 * Incrementa y verifica si una IP superó el límite.
 * Retorna: { count, exceeded }
 */
export async function checkRateLimit(
  ip: string,
  limit = 60,
  windowSec = 60
): Promise<{ count: number; exceeded: boolean }> {
  const key = `rl:${ip}`
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSec)
    return { count, exceeded: count > limit }
  } catch {
    // Si Redis falla, permitir el request (fail open)
    return { count: 0, exceeded: false }
  }
}

// ── Cache de sesión ────────────────────────────────────────

const SESSION_TTL = 30 * 60  // 30 minutos de inactividad

interface CachedSession {
  id: string         // bigint como string
  siteId: number
  fingerprint: string
  startedAt: number
  pagesVisited: number
}

export async function getSession(
  token: string
): Promise<CachedSession | null> {
  try {
    const raw = await redis.get(`sess:${token}`)
    return raw ? (JSON.parse(raw) as CachedSession) : null
  } catch {
    return null
  }
}

export async function setSession(
  token: string,
  session: CachedSession
): Promise<void> {
  try {
    await redis.setex(`sess:${token}`, SESSION_TTL, JSON.stringify(session))
  } catch {
    // fail silently
  }
}

export async function touchSession(token: string): Promise<void> {
  try {
    await redis.expire(`sess:${token}`, SESSION_TTL)
  } catch {
    // fail silently
  }
}

// ── Cache de sitios ────────────────────────────────────────
// Evita consultar la BD en cada request para obtener el site_id

interface CachedSite {
  id: number
  clientId: number
  domain: string
}

export async function getCachedSite(
  trackingId: string
): Promise<CachedSite | null> {
  try {
    const raw = await redis.get(`site:${trackingId}`)
    return raw ? (JSON.parse(raw) as CachedSite) : null
  } catch {
    return null
  }
}

export async function setCachedSite(
  trackingId: string,
  site: CachedSite
): Promise<void> {
  try {
    // Cache de 1 hora — los sitios no cambian frecuentemente
    await redis.setex(`site:${trackingId}`, 3600, JSON.stringify(site))
  } catch {
    // fail silently
  }
}

// ── Honeypot: marcar IPs como bot confirmado ───────────────

export async function markHoneypotBot(ip: string): Promise<void> {
  try {
    // Bloquear esta IP por 24 horas
    await redis.setex(`honeypot:${ip}`, 86400, '1')
  } catch {
    // fail silently
  }
}

export async function isHoneypotBot(ip: string): Promise<boolean> {
  try {
    return (await redis.exists(`honeypot:${ip}`)) === 1
  } catch {
    return false
  }
}
