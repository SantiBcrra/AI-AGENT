-- ============================================================
-- MÓDULO 3: EVENTOS
-- Cada acción registrada dentro de una sesión
-- Tabla principal del sistema — va a crecer rápido
-- ============================================================

CREATE TABLE events (
  id              BIGSERIAL PRIMARY KEY,
  site_id         INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- Tipo de evento
  event_type      TEXT NOT NULL,
    -- Automáticos del script:
    --   'pageview'    → carga de página
    --   'engagement'  → tiempo en página al salir
    --   'scroll'      → profundidad de scroll (25/50/75/100%)
    --   'exit'        → salida de la página
    -- Definidos por el usuario en el sitio:
    --   'click'       → clic en elemento
    --   'form_submit' → envío de formulario
    --   'conversion'  → evento de conversión
    --   'video'       → play/pause/complete de video
    --   'download'    → descarga de archivo
    --   'outbound'    → clic en link externo
    --   'search'      → búsqueda interna
    --   'custom'      → cualquier evento personalizado

  -- Página donde ocurrió
  url             TEXT NOT NULL,
  path            TEXT NOT NULL,      -- solo el path: /productos/zapatos
  query_string    TEXT,               -- ?color=rojo&talle=42
  page_title      TEXT,

  -- Métricas del evento
  scroll_depth    INT,                -- % de scroll (solo en eventos scroll/engagement)
  duration_ms     INT,                -- tiempo en la página en ms (solo en engagement/exit)
  load_time_ms    INT,                -- tiempo de carga de la página en ms

  -- Señales de bot del cliente (del script JS)
  js_bot_score    INT DEFAULT 0,      -- score calculado en el browser
  js_webdriver    BOOLEAN DEFAULT false,
  js_no_plugins   BOOLEAN DEFAULT false,
  js_instant_load BOOLEAN DEFAULT false,
  js_interacted   BOOLEAN DEFAULT false,
  js_mouse_points INT DEFAULT 0,
  js_canvas_fp    TEXT,               -- fingerprint de canvas

  -- Datos extra del evento (para eventos custom)
  properties      JSONB DEFAULT '{}',
    -- Ejemplos:
    -- click:       { "element": "btn-comprar", "text": "Agregar al carrito" }
    -- conversion:  { "value": 99.99, "currency": "USD", "product": "Plan Pro" }
    -- video:       { "src": "video.mp4", "action": "play", "position_sec": 12 }
    -- download:    { "file": "catalogo.pdf", "size_kb": 2048 }
    -- search:      { "query": "zapatos rojos", "results": 24 }

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices principales
CREATE INDEX idx_events_site_date      ON events(site_id, created_at);
CREATE INDEX idx_events_session        ON events(session_id);
CREATE INDEX idx_events_type           ON events(site_id, event_type, created_at);
CREATE INDEX idx_events_path           ON events(site_id, path, created_at);
CREATE INDEX idx_events_properties     ON events USING GIN(properties);

-- Índice parcial: solo eventos humanos (el más consultado en el dashboard)
CREATE INDEX idx_events_human_pageviews
  ON events(site_id, path, created_at)
  WHERE event_type = 'pageview';

COMMENT ON TABLE  events            IS 'Evento individual dentro de una sesión. Tabla de alto volumen.';
COMMENT ON COLUMN events.properties IS 'JSONB libre para datos de eventos custom. Indexado con GIN.';


-- ============================================================
-- MÓDULO 3B: LOG DE DECISIONES DE BOT
-- Registro detallado de por qué se clasificó cada sesión
-- Útil para auditar y mejorar el modelo de detección
-- ============================================================

CREATE TABLE bot_score_log (
  id              BIGSERIAL PRIMARY KEY,
  session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- Resultados de cada capa de detección
  layer_ua        JSONB,   -- { "is_bot": true, "matched": "ahrefsbot", "score": 40 }
  layer_ip        JSONB,   -- { "is_datacenter": false, "is_vpn": true, "score": 10 }
  layer_rate      JSONB,   -- { "requests_per_min": 3, "exceeded": false, "score": 0 }
  layer_js        JSONB,   -- { "webdriver": false, "no_plugins": false, "score": 0 }
  layer_behavior  JSONB,   -- { "duration": 45, "mouse_moves": 12, "score": 0 }

  final_score     INT NOT NULL,
  final_type      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bot_log_session ON bot_score_log(session_id);
