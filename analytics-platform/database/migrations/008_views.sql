-- ============================================================
-- MÓDULO 8: VISTAS PARA EL DASHBOARD
-- Queries pre-armadas para las pantallas más usadas
-- ============================================================


-- ── Vista: resumen de salud por sitio ──────────────────────
-- Usada en la pantalla principal del dashboard (lista de sitios)

CREATE OR REPLACE VIEW v_site_health AS
SELECT
  s.id                                      AS site_id,
  s.domain,
  s.name,

  -- Tráfico últimas 24hs (humanos)
  COUNT(DISTINCT se.id) FILTER (
    WHERE se.started_at >= NOW() - INTERVAL '24 hours'
    AND   se.is_bot = false
  )                                         AS visits_24h,

  -- Tráfico últimos 7 días (humanos)
  COUNT(DISTINCT se.id) FILTER (
    WHERE se.started_at >= NOW() - INTERVAL '7 days'
    AND   se.is_bot = false
  )                                         AS visits_7d,

  -- Alertas activas críticas
  COUNT(DISTINCT sa.id) FILTER (
    WHERE sa.status = 'active'
    AND   sa.severity = 'critical'
  )                                         AS critical_alerts,

  -- Alertas activas totales
  COUNT(DISTINCT sa.id) FILTER (
    WHERE sa.status = 'active'
  )                                         AS total_alerts,

  -- Emails de GSC sin leer
  COUNT(DISTINCT ea.id) FILTER (
    WHERE ea.status = 'unread'
  )                                         AS unread_gsc_emails,

  -- Rich results con errores
  COUNT(DISTINCT rr.id) FILTER (
    WHERE rr.status = 'error'
  )                                         AS rich_result_errors,

  -- Issues de seguridad activos
  COUNT(DISTINCT si.id) FILTER (
    WHERE si.status = 'active'
  )                                         AS security_issues,

  -- Recomendaciones IA pendientes
  COUNT(DISTINCT ar.id) FILTER (
    WHERE ar.status = 'pending'
    AND   ar.priority IN ('critical', 'high')
  )                                         AS pending_high_priority_recs,

  -- Score de salud general (0-100, calculado en la app)
  -- 100 = todo perfecto, 0 = múltiples problemas críticos
  GREATEST(0,
    100
    - (COUNT(DISTINCT sa.id) FILTER (WHERE sa.status='active' AND sa.severity='critical') * 25)
    - (COUNT(DISTINCT sa.id) FILTER (WHERE sa.status='active' AND sa.severity='high')    * 10)
    - (COUNT(DISTINCT si.id) FILTER (WHERE si.status='active')                           * 20)
    - (COUNT(DISTINCT rr.id) FILTER (WHERE rr.status='error')                            *  5)
  )                                         AS health_score

FROM sites s
LEFT JOIN sessions        se ON se.site_id = s.id
LEFT JOIN system_alerts   sa ON sa.site_id = s.id
LEFT JOIN gsc_email_alerts ea ON ea.site_id = s.id
LEFT JOIN gsc_rich_results rr ON rr.site_id = s.id
LEFT JOIN gsc_security_issues si ON si.site_id = s.id
LEFT JOIN ai_recommendations  ar ON ar.site_id = s.id
WHERE s.is_active = true
GROUP BY s.id, s.domain, s.name;


-- ── Vista: top páginas por visitas (últimos 30 días) ───────

CREATE OR REPLACE VIEW v_top_pages_30d AS
SELECT
  e.site_id,
  e.path,
  MAX(e.page_title)                         AS page_title,
  COUNT(DISTINCT s.id)                      AS unique_sessions,
  COUNT(*)                                  AS pageviews,
  ROUND(AVG(e.duration_ms) / 1000.0, 1)    AS avg_duration_sec,
  ROUND(AVG(e.scroll_depth), 0)             AS avg_scroll_pct,
  COUNT(*) FILTER (
    WHERE s.pages_visited = 1
  )                                         AS bounces,
  ROUND(
    COUNT(*) FILTER (WHERE s.pages_visited = 1)::NUMERIC
    / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1
  )                                         AS bounce_rate_pct
FROM events e
JOIN sessions s ON s.id = e.session_id
WHERE
  e.event_type  = 'pageview'
  AND s.is_bot  = false
  AND e.created_at >= NOW() - INTERVAL '30 days'
GROUP BY e.site_id, e.path
ORDER BY unique_sessions DESC;


-- ── Vista: distribución de fuentes de tráfico ──────────────

CREATE OR REPLACE VIEW v_traffic_sources AS
SELECT
  site_id,
  source,
  medium,
  COUNT(*)                                  AS sessions,
  COUNT(*) FILTER (WHERE did_convert=true)  AS conversions,
  ROUND(AVG(duration_sec), 0)               AS avg_duration_sec,
  ROUND(AVG(pages_visited), 1)              AS avg_pages
FROM sessions
WHERE
  is_bot = false
  AND started_at >= NOW() - INTERVAL '30 days'
GROUP BY site_id, source, medium
ORDER BY sessions DESC;


-- ── Vista: resumen de rich results por sitio ───────────────

CREATE OR REPLACE VIEW v_rich_results_summary AS
SELECT
  site_id,
  result_type,
  COUNT(*) FILTER (WHERE status = 'valid')                AS valid_count,
  COUNT(*) FILTER (WHERE status = 'valid_with_warnings')  AS warning_count,
  COUNT(*) FILTER (WHERE status = 'error')                AS error_count,
  COUNT(*) FILTER (WHERE status = 'not_detected')         AS not_detected_count,
  COUNT(*)                                                AS total_count,
  MAX(last_inspected)                                     AS last_inspected
FROM gsc_rich_results
GROUP BY site_id, result_type;


-- ── Vista: keywords con oportunidades de mejora ────────────

CREATE OR REPLACE VIEW v_keyword_opportunities AS
SELECT
  site_id,
  query,
  avg_position,
  avg_ctr,
  total_impressions,
  total_clicks,
  opportunity_score,
  opportunity_type,
  clicks_delta,
  position_delta,
  trend
FROM gsc_keywords
WHERE
  opportunity_score > 30
  AND opportunity_type IS NOT NULL
ORDER BY opportunity_score DESC;
