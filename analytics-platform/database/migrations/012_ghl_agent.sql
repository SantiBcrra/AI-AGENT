-- ============================================================
-- MÓDULO 12: AGENTE IA — INTEGRACIÓN GoHighLevel (GHL)
-- Tablas para el sistema autónomo de CRO/SEO en sitios GHL
-- ============================================================

-- ── 12A. Configuración GHL por sitio ─────────────────────────
-- Vincula cada site del analytics con su ubicación en GHL
CREATE TABLE ghl_sites (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,

  -- Credenciales GHL
  location_id     TEXT NOT NULL,        -- GHL Location ID (obligatorio)
  api_key         TEXT NOT NULL,        -- API Key o Access Token (OAuth2)
  api_version     TEXT DEFAULT '2021-07-28',

  -- Límites de seguridad del agente
  max_changes_per_day    INT NOT NULL DEFAULT 5,
  max_changes_per_page   INT NOT NULL DEFAULT 2,  -- por semana
  cooldown_hours         INT NOT NULL DEFAULT 24, -- horas entre cambios en la misma página

  -- Control
  agent_enabled   BOOLEAN NOT NULL DEFAULT true,
  dry_run         BOOLEAN NOT NULL DEFAULT false, -- true = solo simula, no aplica cambios

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ghl_sites_site ON ghl_sites(site_id);

-- ── 12B. Caché de páginas/funnels descubiertos en GHL ─────────
CREATE TABLE ghl_pages (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Identificadores GHL
  ghl_funnel_id   TEXT,                 -- ID del funnel en GHL
  ghl_page_id     TEXT NOT NULL,        -- ID único de la página en GHL
  ghl_page_type   TEXT NOT NULL DEFAULT 'funnel',
    -- 'funnel' | 'website' | 'blog' | 'landing'

  -- Contenido actual (snapshot en caché)
  title           TEXT,
  meta_title      TEXT,
  meta_description TEXT,
  path            TEXT,                 -- URL path (/landing/oferta)
  full_url        TEXT,                 -- URL completa
  head_code       TEXT,                 -- código en <head> actual
  body_code       TEXT,                 -- código en <body> actual

  -- Estado
  last_synced_at  TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(site_id, ghl_page_id)
);

CREATE INDEX idx_ghl_pages_site     ON ghl_pages(site_id);
CREATE INDEX idx_ghl_pages_path     ON ghl_pages(site_id, path);

-- ── 12C. Backups antes de cada cambio ────────────────────────
CREATE TABLE ghl_page_backups (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ghl_page_id     TEXT NOT NULL,

  -- Snapshot completo de lo que había ANTES del cambio
  backup_data     JSONB NOT NULL,
    -- { title, meta_title, meta_description, head_code, body_code, ... }

  -- Por qué se hizo el backup
  reason          TEXT,                 -- "before: update_meta_title"
  change_id       BIGINT,               -- FK a ghl_changes (se actualiza después)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ghl_backups_page   ON ghl_page_backups(ghl_page_id, created_at);
CREATE INDEX idx_ghl_backups_site   ON ghl_page_backups(site_id, created_at);

-- ── 12D. Log de todos los cambios aplicados ──────────────────
CREATE TABLE ghl_changes (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ghl_page_id     TEXT NOT NULL,

  -- Qué se cambió
  action_type     TEXT NOT NULL,
    -- 'update_meta_title'     → título SEO
    -- 'update_meta_desc'      → meta description
    -- 'inject_schema'         → JSON-LD schema markup
    -- 'inject_head_script'    → código en <head>
    -- 'inject_body_script'    → código en <body>
    -- 'update_page_title'     → H1/título visible
    -- 'update_cta_text'       → texto de botón CTA
    -- 'patch_html_section'    → sección HTML reemplazada

  strategy        TEXT NOT NULL,
    -- 'direct_api' | 'script_injection' | 'html_patch' | 'fallback'

  -- Contexto de la decisión
  trigger_metric  TEXT,                 -- 'gsc_ctr' | 'bounce_rate' | 'scroll_depth' | ...
  trigger_value   NUMERIC,              -- valor que disparó el cambio (ej: 0.008 para CTR)
  trigger_threshold NUMERIC,            -- umbral que se superó
  reason          TEXT NOT NULL,        -- explicación legible del por qué
  expected_impact TEXT,                 -- "Mejorar CTR en 15-30%"

  -- Datos del cambio
  payload         JSONB NOT NULL,       -- lo que se envió a la API
  previous_value  TEXT,                 -- valor anterior (para rollback)
  new_value       TEXT,                 -- valor nuevo aplicado

  -- Estado
  status          TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'applied' | 'failed' | 'rolled_back' | 'dry_run'
  applied_at      TIMESTAMPTZ,
  error_message   TEXT,

  -- Backup asociado
  backup_id       BIGINT REFERENCES ghl_page_backups(id),

  -- Evaluación post-cambio (se rellena después por el learning loop)
  evaluated_at    TIMESTAMPTZ,
  metric_before   NUMERIC,
  metric_after    NUMERIC,
  metric_delta    NUMERIC,              -- cambio porcentual
  was_effective   BOOLEAN,              -- true si mejoró, false si empeoró

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ghl_changes_site       ON ghl_changes(site_id, created_at);
CREATE INDEX idx_ghl_changes_page       ON ghl_changes(ghl_page_id, created_at);
CREATE INDEX idx_ghl_changes_type       ON ghl_changes(action_type, status);
CREATE INDEX idx_ghl_changes_pending    ON ghl_changes(site_id, created_at) WHERE status = 'pending';
CREATE INDEX idx_ghl_changes_evaluate   ON ghl_changes(applied_at) WHERE status = 'applied' AND evaluated_at IS NULL;

-- ── 12E. Historial de estrategias y su efectividad ────────────
-- El "learning loop" actualiza esto para que el agente aprenda qué funciona
CREATE TABLE ghl_strategy_scores (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  action_type     TEXT NOT NULL,        -- mismo enum que ghl_changes.action_type
  trigger_metric  TEXT NOT NULL,        -- qué métrica triggerea esta acción

  -- Estadísticas acumuladas
  total_applied   INT NOT NULL DEFAULT 0,
  total_effective INT NOT NULL DEFAULT 0,  -- mejoraron la métrica
  total_failed    INT NOT NULL DEFAULT 0,  -- empeoraron o sin efecto
  avg_metric_delta NUMERIC DEFAULT 0,      -- promedio de mejora porcentual

  -- Control de confianza: no usar estrategias sin datos suficientes
  confidence_score NUMERIC DEFAULT 0,     -- 0-1, sube con éxitos, baja con fallos

  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(site_id, action_type, trigger_metric)
);

CREATE INDEX idx_ghl_strategy_site ON ghl_strategy_scores(site_id, confidence_score DESC);

-- ── 12F. Cola de cambios pendientes de aprobación ─────────────
-- Para cambios de alto impacto que requieren revisión humana
CREATE TABLE ghl_change_queue (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ghl_page_id     TEXT NOT NULL,

  action_type     TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'medium',
  reason          TEXT NOT NULL,
  expected_impact TEXT,
  payload         JSONB NOT NULL,
  trigger_metric  TEXT,
  trigger_value   NUMERIC,

  -- Estado de la cola
  status          TEXT NOT NULL DEFAULT 'queued',
    -- 'queued' | 'approved' | 'rejected' | 'applied' | 'expired'
  approved_by     TEXT,                 -- email del usuario que aprobó
  approved_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  -- Resultado si fue aplicado
  applied_change_id BIGINT REFERENCES ghl_changes(id),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ghl_queue_site    ON ghl_change_queue(site_id, status, created_at);
CREATE INDEX idx_ghl_queue_queued  ON ghl_change_queue(created_at) WHERE status = 'queued';

-- ── 12G. Vista: resumen de actividad del agente por sitio ────
CREATE VIEW ghl_agent_summary AS
SELECT
  gs.site_id,
  s.domain,
  gs.agent_enabled,
  gs.dry_run,
  gs.max_changes_per_day,

  -- Cambios últimas 24h
  COUNT(gc.id) FILTER (
    WHERE gc.created_at >= NOW() - INTERVAL '24 hours'
    AND gc.status IN ('applied', 'dry_run')
  ) AS changes_today,

  -- Cambios últimos 7 días
  COUNT(gc.id) FILTER (
    WHERE gc.created_at >= NOW() - INTERVAL '7 days'
    AND gc.status IN ('applied', 'dry_run')
  ) AS changes_7d,

  -- Efectividad global
  COUNT(gc.id) FILTER (WHERE gc.was_effective = true) AS effective_changes,
  COUNT(gc.id) FILTER (WHERE gc.was_effective = false) AS ineffective_changes,

  -- Último cambio
  MAX(gc.applied_at) AS last_change_at

FROM ghl_sites gs
JOIN sites s ON s.id = gs.site_id
LEFT JOIN ghl_changes gc ON gc.site_id = gs.site_id
GROUP BY gs.site_id, s.domain, gs.agent_enabled, gs.dry_run, gs.max_changes_per_day;

COMMENT ON TABLE ghl_sites          IS 'Config del agente GHL por sitio. Un sitio = una Location en GHL.';
COMMENT ON TABLE ghl_pages          IS 'Caché de páginas/funnels descubiertos en GHL. Se sincroniza antes de cada análisis.';
COMMENT ON TABLE ghl_page_backups   IS 'Snapshot del estado previo al cambio. Permite rollback completo.';
COMMENT ON TABLE ghl_changes        IS 'Registro de cada cambio aplicado por el agente. Fuente de verdad del audit trail.';
COMMENT ON TABLE ghl_strategy_scores IS 'Scores acumulados de efectividad por estrategia. Alimenta el learning loop.';
COMMENT ON TABLE ghl_change_queue   IS 'Cola de cambios pendientes de aprobación manual para acciones de alto impacto.';
