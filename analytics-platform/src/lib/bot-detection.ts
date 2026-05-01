// ============================================================
// Bot Detection — 4 capas en cascada
// Cada capa agrega un score. Total >= 60 = bot.
// ============================================================

import { isbot } from 'isbot'
import {
  checkRateLimit,
  isHoneypotBot,
  markHoneypotBot,
} from './redis'
import type {
  BotDetectionResult,
  LayerResult,
  TrackingPayload,
} from '@/types/collect'

// ── Listas de firmas conocidas ─────────────────────────────

// Crawlers buenos — guardar en BD como 'bot_crawler', no descartar
const GOOD_CRAWLERS = [
  'googlebot', 'google-inspectiontool', 'adsbot-google',
  'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
  'yandexbot', 'sogou', 'exabot', 'ia_archiver',
  'applebot', 'facebot',
]

// SEO tools — guardar como 'bot_seo_tool'
const SEO_TOOLS = [
  'ahrefsbot', 'semrushbot', 'dotbot', 'rogerbot', 'mj12bot',
  'majesticbot', 'screaming frog', 'seokicks', 'serpstatbot',
  'linkdexbot', 'blexbot', 'seznambot',
]

// Bots genéricos maliciosos o scrapers
const BAD_BOTS = [
  'python-requests', 'python-urllib', 'scrapy', 'curl/', 'wget/',
  'httpclient', 'okhttp', 'go-http-client', 'java/', 'libwww-perl',
  'lwp-trivial', 'libcurl', 'petalbot', 'bytespider',
]

// Headless browsers — alto score
const HEADLESS = [
  'headlesschrome', 'phantomjs', 'selenium', 'puppeteer',
  'playwright', 'webdriver', 'nightmarejs', 'zombie.js',
]

// Monitores de uptime — guardar como 'bot_generic'
const MONITORS = [
  'pingdom', 'uptimerobot', 'statuscake', 'newrelic',
  'site24x7', 'freshping', 'hetrixtools',
]

// Rangos CIDR de datacenters conocidos (AWS, GCP, Azure, DO, Vultr)
// Lista parcial — en producción usar ipinfo.io/lite o similar
const DATACENTER_CIDRS = [
  // AWS us-east
  [0x03000000, 0x03FFFFFF],  // 3.0.0.0/8
  [0x34000000, 0x34FFFFFF],  // 52.0.0.0/8
  [0x35000000, 0x35FFFFFF],  // 54.0.0.0/8
  // GCP
  [0x22C40000, 0x22C4FFFF],  // 34.196.0.0/16
  [0x68C40000, 0x68C4FFFF],  // 104.196.0.0/14
  // DigitalOcean
  [0x86000000, 0x860FFFFF],  // 134.0.0.0/12
  // Vultr
  [0x2D4C0000, 0x2D4CFFFF],  // 45.76.0.0/16
] as const

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0
}

function isDatacenterIp(ip: string): boolean {
  if (!ip || ip === '127.0.0.1' || ip === '::1') return false
  try {
    const n = ipToInt(ip)
    return DATACENTER_CIDRS.some(([lo, hi]) => n >= lo && n <= hi)
  } catch {
    return false
  }
}

// ── Capa 1: User-Agent ─────────────────────────────────────

function layerUserAgent(ua: string): LayerResult & { botType?: string } {
  if (!ua || ua.length < 10) {
    return { score: 50, isBot: true, detail: 'empty_ua' }
  }

  const lower = ua.toLowerCase()

  // Usar isbot (librería) como primer filtro
  if (isbot(ua)) {
    // Clasificar más finamente
    if (GOOD_CRAWLERS.some(s => lower.includes(s)))
      return { score: 70, isBot: true, detail: 'good_crawler', botType: 'bot_crawler' }
    if (SEO_TOOLS.some(s => lower.includes(s)))
      return { score: 70, isBot: true, detail: 'seo_tool', botType: 'bot_seo_tool' }
    return { score: 60, isBot: true, detail: 'isbot_match', botType: 'bot_generic' }
  }

  // Nuestras listas extra
  if (HEADLESS.some(s => lower.includes(s)))
    return { score: 90, isBot: true, detail: 'headless_browser', botType: 'bot_confirmed' }
  if (BAD_BOTS.some(s => lower.includes(s)))
    return { score: 80, isBot: true, detail: 'bad_bot_ua', botType: 'bot_generic' }
  if (MONITORS.some(s => lower.includes(s)))
    return { score: 65, isBot: true, detail: 'monitor_tool', botType: 'bot_generic' }
  if (SEO_TOOLS.some(s => lower.includes(s)))
    return { score: 70, isBot: true, detail: 'seo_tool', botType: 'bot_seo_tool' }

  // UA sospechosa pero no confirmada
  if (ua.length < 20) return { score: 25, isBot: false, detail: 'short_ua' }

  return { score: 0, isBot: false, detail: null }
}

// ── Capa 2: IP ─────────────────────────────────────────────

async function layerIp(
  ip: string
): Promise<LayerResult & { isDatacenter: boolean }> {
  // Honeypot previo
  if (await isHoneypotBot(ip)) {
    return { score: 100, isBot: true, detail: 'honeypot_ip', isDatacenter: false }
  }

  if (isDatacenterIp(ip)) {
    return { score: 35, isBot: false, detail: 'datacenter_ip', isDatacenter: true }
  }

  return { score: 0, isBot: false, detail: null, isDatacenter: false }
}

// ── Capa 3: Rate limiting ──────────────────────────────────

async function layerRate(ip: string): Promise<LayerResult> {
  // > 60 requests/min desde la misma IP = bot
  const { count, exceeded } = await checkRateLimit(ip, 60, 60)
  if (exceeded) {
    return {
      score: 40,
      isBot: false,  // sospechoso pero no confirmado
      detail: `rate_exceeded:${count}`,
    }
  }
  return { score: 0, isBot: false, detail: null }
}

// ── Capa 4: Señales del browser (JavaScript) ───────────────

function layerJs(signals: TrackingPayload['bot_signals']): LayerResult {
  if (!signals) {
    // No hay señales JS = el script no corrió o fue bloqueado
    return { score: 10, isBot: false, detail: 'no_js_signals' }
  }

  let score = 0
  const reasons: string[] = []

  if (signals.honeypot) {
    score += 60
    reasons.push('honeypot_click')
  }
  if (signals.webdriver) {
    score += 40
    reasons.push('webdriver')
  }
  if (signals.no_plugins && signals.no_languages) {
    score += 20
    reasons.push('no_browser_features')
  }
  if (signals.instant_load && signals.load_ms < 50) {
    score += 10
    reasons.push('instant_load')
  }

  // Ya tiene señales del cliente — usar su score parcialmente
  score = Math.max(score, Math.round(signals.bot_score * 0.5))

  return {
    score,
    isBot: score >= 60,
    detail: reasons.length ? reasons.join(',') : null,
  }
}

// ── Capa 5: Comportamiento de sesión ──────────────────────

function layerBehavior(signals: TrackingPayload['bot_signals']): LayerResult {
  if (!signals) return { score: 0, isBot: false, detail: null }

  let score = 0
  const reasons: string[] = []

  // Cargó la página y envió el evento en < 100ms sin interacción
  if (signals.load_ms < 100 && !signals.interacted) {
    score += 15
    reasons.push('no_interaction_fast')
  }

  // Tiene señales JS humanas — reducir score
  if (signals.mouse_points > 5) score = Math.max(0, score - 10)
  if (signals.interacted) score = Math.max(0, score - 5)

  return {
    score,
    isBot: false,
    detail: reasons.length ? reasons.join(',') : null,
  }
}

// ── Clasificación final ────────────────────────────────────

function classifyVisitType(
  totalScore: number,
  uaResult: ReturnType<typeof layerUserAgent>,
  jsResult: LayerResult,
  signals: TrackingPayload['bot_signals']
): string {
  // Bot identificado por UA
  if (uaResult.botType) return uaResult.botType

  // Honeypot activado = confirmado
  if (jsResult.detail?.includes('honeypot') || signals?.honeypot)
    return 'bot_confirmed'

  // Webdriver detectado
  if (jsResult.detail?.includes('webdriver'))
    return 'bot_confirmed'

  // Por score
  if (totalScore >= 80) return 'bot_confirmed'
  if (totalScore >= 60) return 'bot_generic'
  if (totalScore >= 40) return 'suspicious'

  // Humano — distinguir con/sin interacción
  if (signals?.interacted || (signals?.mouse_points ?? 0) > 3)
    return 'human'

  return 'likely_human'
}

// ── Función principal exportada ────────────────────────────

export async function detectBot(
  payload: TrackingPayload,
  ip: string
): Promise<BotDetectionResult> {
  // Registrar clic en honeypot si aplica
  if (payload.bot_signals?.honeypot) {
    await markHoneypotBot(ip)
  }

  // Ejecutar capas — rate e IP en paralelo (ambas usan Redis/async)
  const [uaResult, ipResult, rateResult] = await Promise.all([
    Promise.resolve(layerUserAgent(payload.ua)),
    layerIp(ip),
    layerRate(ip),
  ])

  const jsResult       = layerJs(payload.bot_signals)
  const behaviorResult = layerBehavior(payload.bot_signals)

  // Score total acumulado
  const totalScore = Math.min(
    100,
    uaResult.score +
    ipResult.score +
    rateResult.score +
    jsResult.score +
    behaviorResult.score
  )

  const visitType = classifyVisitType(
    totalScore,
    uaResult,
    jsResult,
    payload.bot_signals
  )

  const isBot = totalScore >= 60

  // Razón principal (primera capa que contribuyó con score alto)
  const reason =
    uaResult.detail ??
    ipResult.detail ??
    jsResult.detail ??
    rateResult.detail ??
    behaviorResult.detail ??
    null

  return {
    isBot,
    score: totalScore,
    visitType,
    reason,
    layers: {
      ua:       { score: uaResult.score,       isBot: uaResult.isBot,       detail: uaResult.detail },
      ip:       { score: ipResult.score,        isBot: ipResult.isBot,        detail: ipResult.detail },
      rate:     { score: rateResult.score,      isBot: rateResult.isBot,      detail: rateResult.detail },
      js:       { score: jsResult.score,        isBot: jsResult.isBot,        detail: jsResult.detail },
      behavior: { score: behaviorResult.score,  isBot: behaviorResult.isBot,  detail: behaviorResult.detail },
    },
  }
}
