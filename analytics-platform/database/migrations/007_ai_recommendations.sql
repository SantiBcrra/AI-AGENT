-- ============================================================
-- MÓDULO 7: RECOMENDACIONES IA (Claude)
-- Análisis automático y sugerencias de mejora
-- ============================================================

CREATE TABLE ai_recommendations (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Categoría de la recomendación
  category        TEXT NOT NULL,
    -- 'seo_content'       → optimización de contenido
    -- 'seo_technical'     → SEO técnico
    -- 'rich_results'      → agregar/corregir schema markup
    -- 'performance'       → velocidad y core web vitals
    -- 'keywords'          → oportunidades de keywords
    -- 'security'          → seguridad y HTTPS
    -- 'indexing'          → problemas de indexación
    -- 'merchant'          → fichas de comerciante
    -- 'ux'                → experiencia de usuario

  priority        TEXT NOT NULL DEFAULT 'medium',
    -- 'critical' | 'high' | 'medium' | 'low'

  title           TEXT NOT NULL,      -- "3 páginas con alta impresión y CTR < 1%"
  description     TEXT NOT NULL,      -- explicación detallada del problema
  action          TEXT NOT NULL,      -- qué hacer exactamente
  expected_impact TEXT,               -- "Puede mejorar CTR en 15-30%"

  -- Datos que respaldaron la recomendación
  evidence        JSONB DEFAULT '{}',
    -- { "pages": [...], "queries": [...], "metrics": {...} }

  -- URLs afectadas
  affected_urls   JSONB DEFAULT '[]',

  -- Estado de gestión
  status          TEXT DEFAULT 'pending',
    -- 'pending' | 'in_progress' | 'done' | 'dismissed'
  dismissed_reason TEXT,

  -- Fechas
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,        -- la recomendación expira si no es relevante
  resolved_at     TIMESTAMPTZ,

  -- Qué input de Claude generó esto
  prompt_version  TEXT DEFAULT 'v1',
  model_used      TEXT DEFAULT 'claude-sonnet-4-6'
);

CREATE INDEX idx_ai_recs_site          ON ai_recommendations(site_id, generated_at);
CREATE INDEX idx_ai_recs_priority      ON ai_recommendations(site_id, priority, status);
CREATE INDEX idx_ai_recs_category      ON ai_recommendations(site_id, category, status);
CREATE INDEX idx_ai_recs_pending       ON ai_recommendations(site_id, generated_at)
  WHERE status = 'pending';


-- ── 7B. Reportes semanales/mensuales generados por IA ──────

CREATE TABLE ai_reports (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  report_type     TEXT NOT NULL DEFAULT 'weekly', -- 'weekly' | 'monthly'
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,

  -- Contenido del reporte
  headline        TEXT,               -- "Semana sólida: tráfico +12%, 2 problemas nuevos"
  summary         TEXT,               -- párrafo ejecutivo
  full_report     TEXT,               -- reporte completo en markdown
  report_data     JSONB DEFAULT '{}', -- datos estructurados del período

  -- Top métricas del período
  total_visits    INT DEFAULT 0,
  visits_change   NUMERIC,            -- % vs período anterior
  top_pages       JSONB DEFAULT '[]',
  top_keywords    JSONB DEFAULT '[]',
  issues_found    INT DEFAULT 0,
  issues_resolved INT DEFAULT 0,

  -- Estado de envío
  sent_by_email   BOOLEAN DEFAULT false,
  sent_at         TIMESTAMPTZ,
  recipients      JSONB DEFAULT '[]',

  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, report_type, period_start)
);

CREATE INDEX idx_ai_reports_site ON ai_reports(site_id, period_start);
