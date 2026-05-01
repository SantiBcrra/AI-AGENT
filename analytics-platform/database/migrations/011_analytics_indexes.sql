-- ============================================================
-- MÓDULO 11: ÍNDICES DE PERFORMANCE PARA ANALYTICS
-- Optimiza las queries de las nuevas rutas API:
--   - /api/dashboard/[siteId]/pages
--   - /api/dashboard/[siteId]/pages/[pageId]
--   - /api/dashboard/[siteId]/reports
-- ============================================================

-- ── Click aggregation: queries frecuentes sobre events.properties ──

-- Índice para consultas de clicks por path y tipo de evento
-- Usado en: /pages/[pageId] → click heat aggregation
CREATE INDEX IF NOT EXISTS idx_events_click_path
  ON events(site_id, path, event_type, created_at)
  WHERE event_type IN ('click', 'outbound', 'download', 'video');

-- Índice para consultas de video por path
CREATE INDEX IF NOT EXISTS idx_events_video
  ON events(site_id, path, created_at)
  WHERE event_type = 'video';

-- Índice GIN mejorado: schema_types en pageviews
-- Usado en: /pages/[pageId] → structured data detection
CREATE INDEX IF NOT EXISTS idx_events_schema_types
  ON events USING GIN ((properties->'schema_types'))
  WHERE event_type = 'pageview' AND properties ? 'schema_types';

-- ── Page stats daily: queries de rango de fechas ──────────────────

-- Índice cubriente para la query principal de /pages
-- Evita heap fetches en la mayoría de los casos
CREATE INDEX IF NOT EXISTS idx_page_stats_covering
  ON page_stats_daily(
    site_id,
    stat_date,
    page_id,
    pageviews,
    unique_visits,
    sessions,
    bounces,
    avg_duration_sec,
    avg_scroll_depth_pct,
    interactions,
    gsc_clicks,
    gsc_impressions,
    gsc_ctr,
    gsc_position
  );

-- ── AI recommendations: queries de estado por URL ────────────────

-- Índice para buscar recomendaciones por URL afectada
-- Usado en: /pages/[pageId] → recommendations
CREATE INDEX IF NOT EXISTS idx_ai_recs_affected_urls
  ON ai_recommendations USING GIN(affected_urls)
  WHERE status = 'pending';

-- ── AI reports: queries por tipo y fecha ──────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_reports_type_date
  ON ai_reports(site_id, report_type, period_start DESC);

-- ── Sessions: queries de pageviews por path ───────────────────────
-- Usado en: /pages/[pageId] → sources (tráfico hacia la página)
CREATE INDEX IF NOT EXISTS idx_events_pageview_path
  ON events(site_id, path, created_at)
  WHERE event_type = 'pageview';

COMMENT ON INDEX idx_events_click_path     IS 'Click/outbound/download/video events by path — usado en heat-like aggregation';
COMMENT ON INDEX idx_events_video          IS 'Video events por path — usado en análisis de video por página';
COMMENT ON INDEX idx_events_schema_types   IS 'JSON-LD schemas detectados en pageviews — para análisis de structured data';
COMMENT ON INDEX idx_page_stats_covering   IS 'Índice cubriente para el listado de páginas — evita heap fetches';
COMMENT ON INDEX idx_ai_recs_affected_urls IS 'GIN sobre affected_urls — para recomendaciones por página específica';
COMMENT ON INDEX idx_ai_reports_type_date  IS 'Reportes IA por tipo y fecha descendente';
COMMENT ON INDEX idx_events_pageview_path  IS 'Pageviews por path — usado en análisis de fuentes de tráfico por página';
