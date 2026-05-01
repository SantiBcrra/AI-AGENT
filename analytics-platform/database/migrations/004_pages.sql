-- ============================================================
-- MÓDULO 4: PÁGINAS Y MÉTRICAS AGREGADAS
-- Resumen pre-calculado por página para consultas rápidas
-- Se actualiza con cron job cada hora
-- ============================================================

-- Catálogo de páginas del sitio
CREATE TABLE pages (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path            TEXT NOT NULL,              -- /productos/zapatos
  title           TEXT,                       -- último título visto
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, path)
);

CREATE INDEX idx_pages_site ON pages(site_id);

-- Métricas agregadas por página y día (para el dashboard)
-- Se inserta/actualiza diariamente con cron job
CREATE TABLE page_stats_daily (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id         INT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  stat_date       DATE NOT NULL,

  -- Tráfico propio (tracking script)
  pageviews       INT NOT NULL DEFAULT 0,     -- total incluyendo bots
  unique_visits   INT NOT NULL DEFAULT 0,     -- sesiones únicas humanas
  sessions        INT NOT NULL DEFAULT 0,     -- total de sesiones humanas
  bounces         INT NOT NULL DEFAULT 0,     -- sesiones de 1 sola página
  exits           INT NOT NULL DEFAULT 0,     -- cantidad de salidas desde esta página

  -- Engagement
  avg_duration_sec     NUMERIC(8,2) DEFAULT 0,
  avg_scroll_depth_pct NUMERIC(5,2) DEFAULT 0,
  interactions         INT NOT NULL DEFAULT 0,  -- clicks, forms, conversions

  -- Dispositivos
  desktop_visits  INT NOT NULL DEFAULT 0,
  mobile_visits   INT NOT NULL DEFAULT 0,
  tablet_visits   INT NOT NULL DEFAULT 0,

  -- Datos de GSC para esta URL (se unen al agregar)
  gsc_clicks      INT DEFAULT 0,
  gsc_impressions INT DEFAULT 0,
  gsc_ctr         NUMERIC(6,4) DEFAULT 0,     -- 0.0000 a 1.0000
  gsc_position    NUMERIC(6,2) DEFAULT 0,

  UNIQUE(site_id, page_id, stat_date)
);

CREATE INDEX idx_page_stats_site_date ON page_stats_daily(site_id, stat_date);
CREATE INDEX idx_page_stats_page_date ON page_stats_daily(page_id, stat_date);

COMMENT ON TABLE page_stats_daily IS 'Agregados diarios pre-calculados. Actualizar con cron job nocturno para performance del dashboard.';
