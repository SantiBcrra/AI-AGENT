// ============================================================
// Tipos del payload que envía el script de tracking
// ============================================================

export interface TrackingPayload {
  // Identificación del sitio
  sid: string           // tracking_id del sitio (ej: "trk_a1b2c3d4")
  session_token: string // token de sesión generado en el browser

  // Evento
  event: string         // 'pageview' | 'engagement' | 'scroll' | 'exit' | custom
  url: string
  path: string
  query_string?: string
  title?: string

  // Referrer y UTM
  ref?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string

  // Entorno del browser
  ua: string            // userAgent completo
  lang?: string         // navigator.language
  screen?: string       // "1920x1080"
  viewport?: string     // "1440x900"
  tz_offset?: number    // minutos desde UTC

  // Señales anti-bot del browser (del script JS)
  bot_signals?: {
    bot_score: number
    interacted: boolean
    mouse_points: number
    webdriver: boolean
    no_plugins: boolean
    no_languages: boolean
    instant_load: boolean
    honeypot: boolean
    canvas_fp: string
    load_ms: number
  }

  // Métricas del evento
  scroll_depth?: number   // % (solo eventos scroll/engagement)
  duration_ms?: number    // ms en la página (solo engagement/exit)
  load_time_ms?: number   // tiempo de carga

  // Datos extra para eventos custom
  properties?: Record<string, unknown>

  ts: number              // timestamp del cliente (ms)
}

// Resultado del procesamiento completo
export interface ProcessedEvent {
  siteId: number
  sessionId: bigint
  eventType: string
  payload: TrackingPayload
  botResult: BotDetectionResult
  geoResult: GeoResult
  deviceResult: DeviceResult
}

// Resultado de detección de bot
export interface BotDetectionResult {
  isBot: boolean
  score: number         // 0-100
  visitType: string
  reason: string | null
  layers: {
    ua: LayerResult
    ip: LayerResult
    rate: LayerResult
    js: LayerResult
    behavior: LayerResult
  }
}

export interface LayerResult {
  score: number
  isBot: boolean
  detail: string | null
}

// Resultado de geolocalización
export interface GeoResult {
  countryCode: string | null
  countryName: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  isVpn: boolean
  isProxy: boolean
  isDatacenter: boolean
}

// Resultado de parseo de UserAgent
export interface DeviceResult {
  browser: string | null
  browserVersion: string | null
  engine: string | null
  os: string | null
  osVersion: string | null
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  deviceBrand: string | null
}
