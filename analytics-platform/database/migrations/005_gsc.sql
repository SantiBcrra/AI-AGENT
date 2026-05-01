-- ============================================================
-- MÓDULO 5: GOOGLE SEARCH CONSOLE
-- Datos de performance, keywords, rich results,
-- sitemaps, indexación y seguridad
-- ============================================================


-- ── 5A. Performance: clicks, impresiones, CTR, posición ────

CREATE TABLE gsc_performance (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  stat_date       DATE NOT NULL,

  -- Dimensiones (pueden ser NULL si es el total del día)
  query           TEXT,               -- keyword buscada
  page            TEXT,               -- URL de la página
  country         TEXT,               -- código ISO: 'arg', 'mex', 'esp'
  device          TEXT,               -- 'DESKTOP' | 'MOBILE' | 'TABLET'
  search_type     TEXT DEFAULT 'web', -- 'web' | 'image' | 'video' | 'news'

  -- Métricas
  clicks          INT NOT NULL DEFAULT 0,
  impressions     INT NOT NULL DEFAULT 0,
  ctr             NUMERIC(8,6) DEFAULT 0,     -- 0.000000 a 1.000000
  position        NUMERIC(8,4) DEFAULT 0,     -- posición promedio

  -- Control
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(site_id, stat_date, query, page, country, device, search_type)
);

CREATE INDEX idx_gsc_perf_site_date    ON gsc_performance(site_id, stat_date);
CREATE INDEX idx_gsc_perf_query        ON gsc_performance(site_id, query, stat_date);
CREATE INDEX idx_gsc_perf_page         ON gsc_performance(site_id, page, stat_date);
CREATE INDEX idx_gsc_perf_country      ON gsc_performance(site_id, country, stat_date);


-- ── 5B. Keywords / Queries: análisis y tendencias ──────────

CREATE TABLE gsc_keywords (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  query           TEXT NOT NULL,

  -- Período analizado (últimos 28 días desde last_updated)
  total_clicks    INT NOT NULL DEFAULT 0,
  total_impressions INT NOT NULL DEFAULT 0,
  avg_ctr         NUMERIC(8,6) DEFAULT 0,
  avg_position    NUMERIC(8,4) DEFAULT 0,

  -- Tendencia (comparado con período anterior)
  clicks_delta    INT DEFAULT 0,           -- diferencia vs período anterior
  position_delta  NUMERIC(8,4) DEFAULT 0, -- mejora/caída de posición
  trend           TEXT DEFAULT 'stable',   -- 'up' | 'down' | 'stable' | 'new' | 'lost'

  -- Clasificación de oportunidad (calculado por el agente IA)
  opportunity_score INT DEFAULT 0,         -- 0-100 (qué tanto vale optimizar esta keyword)
  opportunity_type  TEXT,
    -- 'quick_win'      → posición 4-10, CTR bajo (optimizar title/meta)
    -- 'high_volume'    → muchas impresiones, baja conversión
    -- 'brand'          → query con nombre de marca
    -- 'long_tail'      → query específica, alta intención
    -- 'lost'           → keyword que perdió posición este mes
    -- 'new_opportunity'→ nueva keyword apareciendo

  top_pages       JSONB DEFAULT '[]',      -- [{ "page": "/url", "clicks": 120 }]
  top_countries   JSONB DEFAULT '[]',

  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, query)
);

CREATE INDEX idx_gsc_keywords_site        ON gsc_keywords(site_id);
CREATE INDEX idx_gsc_keywords_opportunity ON gsc_keywords(site_id, opportunity_score DESC);
CREATE INDEX idx_gsc_keywords_trend       ON gsc_keywords(site_id, trend);


-- ── 5C. Rich Results: fragmentos enriquecidos ──────────────

CREATE TABLE gsc_rich_results (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_url        TEXT NOT NULL,
  result_type     TEXT NOT NULL,
    -- 'product'         → fragmento de producto
    -- 'review'          → fragmento de reseña / calificación
    -- 'breadcrumb'      → ruta de exploración
    -- 'video'           → fragmento de video
    -- 'faq'             → preguntas frecuentes
    -- 'howto'           → cómo hacer algo
    -- 'event'           → evento
    -- 'recipe'          → receta
    -- 'article'         → artículo
    -- 'local_business'  → negocio local
    -- 'sitelinks'       → sitelinks de búsqueda

  status          TEXT NOT NULL DEFAULT 'unknown',
    -- 'valid'           → funciona correctamente
    -- 'valid_with_warnings' → funciona pero tiene advertencias
    -- 'error'           → tiene errores, no aparece en búsqueda
    -- 'not_detected'    → no tiene markup para este tipo
    -- 'excluded'        → Google lo excluyó

  -- Detalle de errores y advertencias
  errors_count    INT DEFAULT 0,
  warnings_count  INT DEFAULT 0,
  issues          JSONB DEFAULT '[]',
    -- [{ "type": "error", "code": "missing_field", "field": "price", "message": "..." }]

  -- Datos del schema markup encontrado
  schema_type     TEXT,               -- 'Product' | 'Review' | 'BreadcrumbList'
  schema_data     JSONB DEFAULT '{}', -- datos extraídos del markup

  -- Métricas de performance de este rich result
  rich_clicks       INT DEFAULT 0,
  rich_impressions  INT DEFAULT 0,

  -- Control
  last_inspected  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(site_id, page_url, result_type)
);

CREATE INDEX idx_rich_results_site        ON gsc_rich_results(site_id);
CREATE INDEX idx_rich_results_status      ON gsc_rich_results(site_id, status);
CREATE INDEX idx_rich_results_type        ON gsc_rich_results(site_id, result_type);


-- ── 5D. Sitemaps ────────────────────────────────────────────

CREATE TABLE gsc_sitemaps (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  sitemap_url     TEXT NOT NULL,
  sitemap_type    TEXT DEFAULT 'sitemap', -- 'sitemap' | 'sitemap_index' | 'atom' | 'rss'
  parent_sitemap  TEXT,                   -- si es hijo de un sitemap index

  -- Estado
  status          TEXT NOT NULL DEFAULT 'unknown',
    -- 'ok' | 'error' | 'warning'
  is_pending      BOOLEAN DEFAULT false,
  last_submitted  TIMESTAMPTZ,
  last_downloaded TIMESTAMPTZ,

  -- Conteos
  urls_submitted  INT DEFAULT 0,
  urls_indexed    INT DEFAULT 0,
  urls_warnings   INT DEFAULT 0,
  urls_errors     INT DEFAULT 0,

  -- Errores del sitemap
  errors          JSONB DEFAULT '[]',
    -- [{ "code": "unreachable", "message": "Could not fetch sitemap" }]

  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, sitemap_url)
);

CREATE INDEX idx_sitemaps_site   ON gsc_sitemaps(site_id);
CREATE INDEX idx_sitemaps_status ON gsc_sitemaps(site_id, status);


-- ── 5E. Indexación por URL ──────────────────────────────────

CREATE TABLE gsc_url_inspection (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_url        TEXT NOT NULL,

  -- Estado de indexación
  coverage_state  TEXT,
    -- 'Submitted and indexed'
    -- 'Indexed, not submitted in sitemap'
    -- 'Crawled - currently not indexed'
    -- 'Discovered - currently not indexed'
    -- 'Page with redirect'
    -- 'Excluded by noindex tag'
    -- 'Blocked by robots.txt'
    -- 'Soft 404'
    -- 'Not found (404)'
    -- 'Alternate page with proper canonical tag'

  indexing_state  TEXT,   -- 'INDEXING_ALLOWED' | 'INDEXING_NOT_ALLOWED'
  robots_state    TEXT,   -- 'ALLOWED' | 'DISALLOWED'
  crawl_state     TEXT,
  canonical_url   TEXT,   -- URL canónica declarada
  is_canonical    BOOLEAN,

  -- Datos del último crawl
  last_crawl_time TIMESTAMPTZ,
  crawl_state_msg TEXT,
  page_fetch_state TEXT,

  -- Mobile usability
  mobile_usable   BOOLEAN,
  mobile_issues   JSONB DEFAULT '[]',

  -- Rich results en esta URL (resumen)
  rich_results_summary JSONB DEFAULT '[]',

  -- Errores y avisos
  verdict         TEXT,   -- 'PASS' | 'FAIL' | 'NEUTRAL'
  issues          JSONB DEFAULT '[]',

  inspected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, page_url)
);

CREATE INDEX idx_url_inspection_site      ON gsc_url_inspection(site_id);
CREATE INDEX idx_url_inspection_coverage  ON gsc_url_inspection(site_id, coverage_state);
CREATE INDEX idx_url_inspection_verdict   ON gsc_url_inspection(site_id, verdict);


-- ── 5F. Seguridad y Acciones Manuales ──────────────────────

CREATE TABLE gsc_security_issues (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  issue_type      TEXT NOT NULL,
    -- Seguridad:
    --   'malware'             → código malicioso detectado
    --   'unwanted_software'   → software no deseado
    --   'phishing'            → phishing
    --   'social_engineering'  → ingeniería social
    --   'mixed_content'       → HTTP dentro de HTTPS
    --   'certificate_issue'   → problema con SSL/TLS
    -- Acciones manuales:
    --   'manual_spam_link'    → spam de links
    --   'manual_thin_content' → contenido pobre
    --   'manual_cloaking'     → cloaking
    --   'manual_structured'   → datos estructurados engañosos
    --   'manual_site_wide'    → acción manual de sitio completo

  severity        TEXT NOT NULL DEFAULT 'medium', -- 'critical' | 'high' | 'medium' | 'low'
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'resolved' | 'pending_review'
  is_manual_action BOOLEAN DEFAULT false,

  -- Páginas afectadas
  affected_urls   JSONB DEFAULT '[]',  -- lista de URLs afectadas
  affected_count  INT DEFAULT 0,

  description     TEXT,
  google_message  TEXT,               -- mensaje original de Google
  resolution_steps TEXT,              -- pasos para resolver (de la API o de Claude)

  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_site        ON gsc_security_issues(site_id);
CREATE INDEX idx_security_status      ON gsc_security_issues(site_id, status);
CREATE INDEX idx_security_severity    ON gsc_security_issues(site_id, severity, status);


-- ── 5G. Merchant Center / Fichas de Comerciantes ───────────

CREATE TABLE gsc_merchant_listings (
  id              SERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_url     TEXT NOT NULL,
  product_id      TEXT,               -- ID del producto en tu sistema
  product_name    TEXT,

  -- Estado en Google
  status          TEXT NOT NULL DEFAULT 'unknown',
    -- 'active' | 'pending' | 'disapproved' | 'expiring'
  verdict         TEXT,               -- 'PASS' | 'FAIL' | 'NEUTRAL'

  -- Issues específicos de merchant
  issues          JSONB DEFAULT '[]',
    -- [{ "type": "error", "code": "missing_price", "message": "..." }]
  errors_count    INT DEFAULT 0,
  warnings_count  INT DEFAULT 0,

  -- Datos del producto
  price           TEXT,
  currency        TEXT,
  availability    TEXT,               -- 'in_stock' | 'out_of_stock' | 'preorder'

  last_inspected  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, product_url)
);

CREATE INDEX idx_merchant_site   ON gsc_merchant_listings(site_id);
CREATE INDEX idx_merchant_status ON gsc_merchant_listings(site_id, status);
