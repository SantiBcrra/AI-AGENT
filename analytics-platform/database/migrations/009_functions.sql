-- ============================================================
-- MÓDULO 9: FUNCIONES Y TRIGGERS
-- Automatizaciones dentro de la base de datos
-- ============================================================


-- ── Función: updated_at automático ─────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_sites
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ── Función: actualizar contadores de la sesión ────────────
-- Se llama cada vez que se inserta un nuevo evento

CREATE OR REPLACE FUNCTION update_session_on_event()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sessions SET
    pages_visited = pages_visited + CASE WHEN NEW.event_type = 'pageview' THEN 1 ELSE 0 END,
    total_events  = total_events  + 1,
    did_interact  = did_interact  OR NEW.js_interacted,
    did_convert   = did_convert   OR (NEW.event_type = 'conversion'),
    last_seen_at  = NEW.created_at,
    max_scroll_pct = GREATEST(
      COALESCE(max_scroll_pct, 0),
      COALESCE(NEW.scroll_depth, 0)
    )
  WHERE id = NEW.session_id;

  -- Si hay duración en el evento, actualizar duración de la sesión
  IF NEW.duration_ms IS NOT NULL THEN
    UPDATE sessions SET
      duration_sec = COALESCE(duration_sec, 0) + (NEW.duration_ms / 1000)
    WHERE id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_event_insert
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION update_session_on_event();


-- ── Función: upsert de página en catálogo ──────────────────

CREATE OR REPLACE FUNCTION upsert_page(
  p_site_id INT,
  p_path    TEXT,
  p_title   TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_page_id INT;
BEGIN
  INSERT INTO pages(site_id, path, title, last_seen_at)
  VALUES (p_site_id, p_path, p_title, NOW())
  ON CONFLICT (site_id, path) DO UPDATE
    SET title        = COALESCE(EXCLUDED.title, pages.title),
        last_seen_at = NOW()
  RETURNING id INTO v_page_id;

  RETURN v_page_id;
END;
$$ LANGUAGE plpgsql;


-- ── Función: calcular score de oportunidad de keyword ──────

CREATE OR REPLACE FUNCTION calc_keyword_opportunity(
  p_position    NUMERIC,
  p_ctr         NUMERIC,
  p_impressions INT,
  p_trend       TEXT
)
RETURNS INT AS $$
DECLARE
  score INT := 0;
BEGIN
  -- Posición 4-10: zona de oportunidad (ya aparece pero no en top 3)
  IF p_position BETWEEN 4 AND 10 THEN
    score := score + 40;
  ELSIF p_position BETWEEN 11 AND 20 THEN
    score := score + 20;
  END IF;

  -- CTR bajo para la posición (debería ser mayor)
  IF p_position <= 5 AND p_ctr < 0.05 THEN
    score := score + 30;  -- título/meta mejorable
  ELSIF p_position <= 10 AND p_ctr < 0.02 THEN
    score := score + 20;
  END IF;

  -- Muchas impresiones = alto potencial
  IF p_impressions > 10000 THEN score := score + 20;
  ELSIF p_impressions > 1000 THEN score := score + 10;
  ELSIF p_impressions > 100  THEN score := score + 5;
  END IF;

  -- Tendencia negativa = urgente
  IF p_trend = 'down' THEN score := score + 15;
  ELSIF p_trend = 'new' THEN score := score + 10;
  END IF;

  RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql;


-- ── Función: agregar stats diarios (ejecutar con cron) ─────

CREATE OR REPLACE FUNCTION aggregate_daily_stats(
  p_site_id   INT,
  p_stat_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO page_stats_daily (
    site_id, page_id, stat_date,
    pageviews, unique_visits, sessions, bounces, exits,
    avg_duration_sec, avg_scroll_depth_pct, interactions,
    desktop_visits, mobile_visits, tablet_visits
  )
  SELECT
    e.site_id,
    p.id                                          AS page_id,
    p_stat_date                                   AS stat_date,
    COUNT(*)                                      AS pageviews,
    COUNT(DISTINCT s.id)                          AS unique_visits,
    COUNT(DISTINCT s.id)                          AS sessions,
    COUNT(*) FILTER (WHERE s.pages_visited = 1)   AS bounces,
    COUNT(*) FILTER (WHERE e.event_type = 'exit') AS exits,
    ROUND(AVG(e.duration_ms) / 1000.0, 2)         AS avg_duration_sec,
    ROUND(AVG(e.scroll_depth), 2)                 AS avg_scroll_depth_pct,
    COUNT(*) FILTER (WHERE e.event_type NOT IN ('pageview','engagement','scroll','exit')) AS interactions,
    COUNT(*) FILTER (WHERE s.device_type = 'desktop') AS desktop_visits,
    COUNT(*) FILTER (WHERE s.device_type = 'mobile')  AS mobile_visits,
    COUNT(*) FILTER (WHERE s.device_type = 'tablet')  AS tablet_visits
  FROM events e
  JOIN sessions s ON s.id = e.session_id
  JOIN pages    p ON p.site_id = e.site_id AND p.path = e.path
  WHERE
    e.site_id     = p_site_id
    AND s.is_bot  = false
    AND e.event_type = 'pageview'
    AND e.created_at::DATE = p_stat_date
  GROUP BY e.site_id, p.id
  ON CONFLICT (site_id, page_id, stat_date) DO UPDATE
    SET pageviews            = EXCLUDED.pageviews,
        unique_visits        = EXCLUDED.unique_visits,
        sessions             = EXCLUDED.sessions,
        bounces              = EXCLUDED.bounces,
        exits                = EXCLUDED.exits,
        avg_duration_sec     = EXCLUDED.avg_duration_sec,
        avg_scroll_depth_pct = EXCLUDED.avg_scroll_depth_pct,
        interactions         = EXCLUDED.interactions,
        desktop_visits       = EXCLUDED.desktop_visits,
        mobile_visits        = EXCLUDED.mobile_visits,
        tablet_visits        = EXCLUDED.tablet_visits;
END;
$$ LANGUAGE plpgsql;
