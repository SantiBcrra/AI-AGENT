-- ============================================================
-- 013 — Completar módulo GHL si solo existía ghl_sites
-- (p. ej. migración 012 interrumpida o aplicada a medias)
-- Idempotente en índices: IF NOT EXISTS
-- ============================================================

-- ── 12B. Caché de páginas GHL ────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_pages (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ghl_funnel_id   TEXT,
  ghl_page_id     TEXT NOT NULL,
  ghl_page_type   TEXT NOT NULL DEFAULT 'funnel',
  title           TEXT,
  meta_title      TEXT,
  meta_description TEXT,
  path            TEXT,
  full_url        TEXT,
  head_code       TEXT,
  body_code       TEXT,
  last_synced_at  TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, ghl_page_id)
);

CREATE INDEX IF NOT EXISTS idx_ghl_pages_site ON ghl_pages(site_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pages_path ON ghl_pages(site_id, path);

-- ── 12C. Backups ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_page_backups (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ghl_page_id     TEXT NOT NULL,
  backup_data     JSONB NOT NULL,
  reason          TEXT,
  change_id       BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_backups_page ON ghl_page_backups(ghl_page_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ghl_backups_site ON ghl_page_backups(site_id, created_at);

-- ── 12D. Log de cambios ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_changes (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ghl_page_id     TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  strategy        TEXT NOT NULL,
  trigger_metric  TEXT,
  trigger_value   NUMERIC,
  trigger_threshold NUMERIC,
  reason          TEXT NOT NULL,
  expected_impact TEXT,
  payload         JSONB NOT NULL,
  previous_value  TEXT,
  new_value       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  applied_at      TIMESTAMPTZ,
  error_message   TEXT,
  backup_id       BIGINT REFERENCES ghl_page_backups(id),
  evaluated_at    TIMESTAMPTZ,
  metric_before   NUMERIC,
  metric_after    NUMERIC,
  metric_delta    NUMERIC,
  was_effective   BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_changes_site ON ghl_changes(site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ghl_changes_page ON ghl_changes(ghl_page_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ghl_changes_type ON ghl_changes(action_type, status);
CREATE INDEX IF NOT EXISTS idx_ghl_changes_pending ON ghl_changes(site_id, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ghl_changes_evaluate ON ghl_changes(applied_at) WHERE status = 'applied' AND evaluated_at IS NULL;

-- ── 12E. Estrategias ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_strategy_scores (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
  trigger_metric  TEXT NOT NULL,
  total_applied   INT NOT NULL DEFAULT 0,
  total_effective INT NOT NULL DEFAULT 0,
  total_failed    INT NOT NULL DEFAULT 0,
  avg_metric_delta NUMERIC DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, action_type, trigger_metric)
);

CREATE INDEX IF NOT EXISTS idx_ghl_strategy_site ON ghl_strategy_scores(site_id, confidence_score DESC);

-- ── 12F. Cola de aprobación ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_change_queue (
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
  status          TEXT NOT NULL DEFAULT 'queued',
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  applied_change_id BIGINT REFERENCES ghl_changes(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_queue_site ON ghl_change_queue(site_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_ghl_queue_queued ON ghl_change_queue(created_at) WHERE status = 'queued';

-- ── 12G. Vista resumen ───────────────────────────────────────
DROP VIEW IF EXISTS ghl_agent_summary;
CREATE VIEW ghl_agent_summary AS
SELECT
  gs.site_id,
  s.domain,
  gs.agent_enabled,
  gs.dry_run,
  gs.max_changes_per_day,
  COUNT(gc.id) FILTER (
    WHERE gc.created_at >= NOW() - INTERVAL '24 hours'
    AND gc.status IN ('applied', 'dry_run')
  ) AS changes_today,
  COUNT(gc.id) FILTER (
    WHERE gc.created_at >= NOW() - INTERVAL '7 days'
    AND gc.status IN ('applied', 'dry_run')
  ) AS changes_7d,
  COUNT(gc.id) FILTER (WHERE gc.was_effective = true) AS effective_changes,
  COUNT(gc.id) FILTER (WHERE gc.was_effective = false) AS ineffective_changes,
  MAX(gc.applied_at) AS last_change_at
FROM ghl_sites gs
JOIN sites s ON s.id = gs.site_id
LEFT JOIN ghl_changes gc ON gc.site_id = gs.site_id
GROUP BY gs.site_id, s.domain, gs.agent_enabled, gs.dry_run, gs.max_changes_per_day;

COMMENT ON TABLE ghl_sites IS 'Config del agente GHL por sitio. Un sitio = una Location en GHL.';
COMMENT ON TABLE ghl_pages IS 'Caché de páginas/funnels descubiertos en GHL. Se sincroniza antes de cada análisis.';
COMMENT ON TABLE ghl_page_backups IS 'Snapshot del estado previo al cambio. Permite rollback completo.';
COMMENT ON TABLE ghl_changes IS 'Registro de cada cambio aplicado por el agente. Fuente de verdad del audit trail.';
COMMENT ON TABLE ghl_strategy_scores IS 'Scores acumulados de efectividad por estrategia. Alimenta el learning loop.';
COMMENT ON TABLE ghl_change_queue IS 'Cola de cambios pendientes de aprobación manual para acciones de alto impacto.';
