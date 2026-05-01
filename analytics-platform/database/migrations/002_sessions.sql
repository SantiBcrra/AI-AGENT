-- ============================================================
-- MÓDULO 2: SESIONES DE VISITANTES
-- Una sesión agrupa todos los eventos de un visitante
-- en una visita continua (sin cookies, fingerprint anónimo)
-- ============================================================

CREATE TABLE sessions (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Identificación anónima (sin PII, GDPR-compliant)
  fingerprint     TEXT NOT NULL,      -- hash(ip + ua + lang + screen + date)
  session_token   TEXT NOT NULL,      -- token único por sesión (expira en 30min inactividad)

  -- Origen del tráfico
  referrer        TEXT,               -- URL completa de referencia
  referrer_domain TEXT,               -- dominio limpio (google.com, facebook.com, etc.)
  source          TEXT,               -- 'google' | 'bing' | 'direct' | 'referral' | 'social' | 'email'
  medium          TEXT,               -- 'organic' | 'cpc' | 'referral' | 'none'
  campaign        TEXT,               -- utm_campaign
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_content     TEXT,
  utm_term        TEXT,

  -- Dispositivo y entorno
  browser         TEXT,               -- 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Brave'
  browser_version TEXT,               -- '120.0'
  engine          TEXT,               -- 'Blink' | 'Gecko' | 'WebKit'
  os              TEXT,               -- 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS'
  os_version      TEXT,               -- '10' | '14.2' | etc.
  device_type     TEXT,               -- 'desktop' | 'mobile' | 'tablet'
  device_brand    TEXT,               -- 'Apple' | 'Samsung' | 'Xiaomi'
  screen_width    INT,
  screen_height   INT,
  viewport_width  INT,
  viewport_height INT,
  language        TEXT,               -- 'es-AR' | 'en-US'
  timezone_offset INT,                -- minutos respecto a UTC

  -- Geolocalización (por IP, sin pedir permiso al usuario)
  ip_hash         TEXT,               -- hash del IP (no guardamos IP real)
  country_code    TEXT,               -- 'AR' | 'MX' | 'ES'
  country_name    TEXT,
  region          TEXT,
  city            TEXT,
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  is_vpn          BOOLEAN DEFAULT false,
  is_proxy        BOOLEAN DEFAULT false,

  -- Clasificación de bot (resultado de las 4 capas de detección)
  bot_score       INT NOT NULL DEFAULT 0,       -- 0-100
  visit_type      TEXT NOT NULL DEFAULT 'unknown',
    -- 'human' | 'likely_human' | 'suspicious' |
    -- 'bot_crawler' | 'bot_seo_tool' | 'bot_generic' | 'bot_confirmed'
  bot_reason      TEXT,               -- 'webdriver' | 'datacenter_ip' | 'honeypot' | etc.
  is_bot          BOOLEAN GENERATED ALWAYS AS (bot_score >= 60) STORED,

  -- Métricas de la sesión (se actualizan en tiempo real)
  pages_visited   INT NOT NULL DEFAULT 0,
  total_events    INT NOT NULL DEFAULT 0,
  duration_sec    INT,                -- segundos totales en el sitio
  max_scroll_pct  INT DEFAULT 0,      -- profundidad máxima de scroll alcanzada
  did_interact    BOOLEAN DEFAULT false, -- movió mouse o tocó pantalla
  did_convert     BOOLEAN DEFAULT false, -- completó algún evento de conversión

  -- Timestamps
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ         -- cuando se detecta fin de sesión
);

-- Índices para queries analíticos frecuentes
CREATE INDEX idx_sessions_site_date      ON sessions(site_id, started_at);
CREATE INDEX idx_sessions_visit_type     ON sessions(site_id, visit_type, started_at);
CREATE INDEX idx_sessions_source         ON sessions(site_id, source, medium);
CREATE INDEX idx_sessions_country        ON sessions(site_id, country_code);
CREATE INDEX idx_sessions_device         ON sessions(site_id, device_type);
CREATE INDEX idx_sessions_fingerprint    ON sessions(fingerprint, site_id);
CREATE INDEX idx_sessions_not_bot        ON sessions(site_id, started_at) WHERE is_bot = false;

COMMENT ON TABLE sessions IS 'Una sesión = una visita continua. Expira tras 30min de inactividad. Sin cookies ni PII.';
COMMENT ON COLUMN sessions.fingerprint  IS 'hash(sha256) de ip+ua+lang+screen+date. Anónimo y no reversible.';
COMMENT ON COLUMN sessions.bot_score    IS '0=humano confirmado, 100=bot confirmado. Ver tabla bot_score_log para detalles.';
