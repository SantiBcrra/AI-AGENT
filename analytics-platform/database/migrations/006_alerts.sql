-- ============================================================
-- MÓDULO 6: ALERTAS, NOTIFICACIONES Y EMAILS DE GSC
-- Sistema de alertas automáticas + captura de emails de Google
-- ============================================================


-- ── 6A. Emails capturados de Google Search Console ─────────

CREATE TABLE gsc_email_alerts (
  id              SERIAL PRIMARY KEY,
  site_id         INT REFERENCES sites(id) ON DELETE SET NULL,

  -- Datos del email original
  gmail_message_id TEXT UNIQUE,       -- ID de Gmail (evita duplicados)
  sender          TEXT NOT NULL,      -- 'search-console-noreply@google.com'
  subject         TEXT NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL,
  raw_body        TEXT,               -- cuerpo original del email

  -- Parseado por Claude
  alert_type      TEXT,
    -- 'coverage'        → problemas de cobertura
    -- 'manual_action'   → acción manual de Google
    -- 'security'        → problema de seguridad
    -- 'sitemap'         → error en sitemap
    -- 'mobile'          → problema de usabilidad móvil
    -- 'core_update'     → actualización de algoritmo
    -- 'rich_result'     → error en resultado enriquecido
    -- 'performance'     → caída de tráfico inusual
    -- 'other'           → otro tipo

  severity        TEXT DEFAULT 'medium', -- 'critical' | 'high' | 'medium' | 'low' | 'info'
  summary         TEXT,               -- resumen generado por Claude (1-2 oraciones)
  affected_urls   JSONB DEFAULT '[]', -- URLs mencionadas en el email
  action_required TEXT,               -- acción recomendada por Claude
  deadline        DATE,               -- fecha límite si aplica

  -- Estado de gestión
  status          TEXT DEFAULT 'unread', -- 'unread' | 'read' | 'in_progress' | 'resolved' | 'ignored'
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,               -- notas del administrador

  parsed_at       TIMESTAMPTZ,        -- cuando se procesó con Claude
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_alerts_site     ON gsc_email_alerts(site_id);
CREATE INDEX idx_email_alerts_status   ON gsc_email_alerts(site_id, status);
CREATE INDEX idx_email_alerts_severity ON gsc_email_alerts(severity, status);
CREATE INDEX idx_email_alerts_date     ON gsc_email_alerts(received_at);


-- ── 6B. Alertas del sistema (generadas internamente) ───────

CREATE TABLE system_alerts (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  alert_type      TEXT NOT NULL,
    -- Tráfico propio:
    --   'traffic_drop'       → caída de visitas > umbral
    --   'traffic_spike'      → pico inusual de visitas
    --   'bot_surge'          → aumento repentino de bots
    --   'conversion_drop'    → caída en conversiones
    -- GSC:
    --   'gsc_position_drop'  → caída de posición en keyword importante
    --   'gsc_ctr_drop'       → caída de CTR en página importante
    --   'gsc_impressions_drop'→ caída de impresiones
    --   'rich_result_error'  → nuevo error en rich result
    --   'indexing_issue'     → URL importante no indexada
    --   'sitemap_error'      → error en sitemap
    --   'security_issue'     → problema de seguridad detectado
    --   'manual_action'      → acción manual aplicada
    -- Sistema:
    --   'gsc_fetch_error'    → no se pudo obtener datos de GSC
    --   'tracking_anomaly'   → anomalía en datos de tracking

  severity        TEXT NOT NULL DEFAULT 'medium',
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  context_data    JSONB DEFAULT '{}',  -- datos que generaron la alerta

  -- Umbral que disparó la alerta
  threshold_value NUMERIC,            -- valor del umbral configurado
  actual_value    NUMERIC,            -- valor real que lo superó
  change_pct      NUMERIC,            -- porcentaje de cambio

  -- Estado
  status          TEXT DEFAULT 'active', -- 'active' | 'acknowledged' | 'resolved'
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,

  -- Notificaciones enviadas
  email_sent      BOOLEAN DEFAULT false,
  email_sent_at   TIMESTAMPTZ,

  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_alerts_site     ON system_alerts(site_id, triggered_at);
CREATE INDEX idx_system_alerts_status   ON system_alerts(site_id, status);
CREATE INDEX idx_system_alerts_severity ON system_alerts(severity, status);


-- ── 6C. Configuración de alertas por sitio ─────────────────

CREATE TABLE alert_config (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL,

  is_enabled      BOOLEAN DEFAULT true,
  threshold_pct   NUMERIC DEFAULT 20,   -- % de cambio para disparar alerta
  threshold_abs   NUMERIC,              -- valor absoluto alternativo
  comparison_days INT DEFAULT 7,        -- comparar contra N días anteriores

  -- A quién notificar
  notify_emails   JSONB DEFAULT '[]',   -- ["admin@empresa.com", "cliente@email.com"]
  notify_slack    TEXT,                 -- webhook URL de Slack

  UNIQUE(site_id, alert_type)
);

CREATE INDEX idx_alert_config_site ON alert_config(site_id);
