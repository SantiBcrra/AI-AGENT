-- ============================================================
-- MÓDULO 1: CLIENTES Y SITIOS
-- Gestión multi-cliente / multi-sitio
-- ============================================================

-- Clientes (agencia o dueño de los sitios)
CREATE TABLE clients (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  company       TEXT,
  plan          TEXT NOT NULL DEFAULT 'basic',   -- basic | pro | agency
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sitios web monitoreados
CREATE TABLE sites (
  id              SERIAL PRIMARY KEY,
  client_id       INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                   -- "Tienda Principal"
  domain          TEXT NOT NULL UNIQUE,            -- "ejemplo.com"
  tracking_id     TEXT NOT NULL UNIQUE,            -- "trk_a1b2c3d4" (va en el script)
  gsc_property    TEXT,                            -- "sc-domain:ejemplo.com" o "https://ejemplo.com/"
  gsc_token       JSONB,                           -- OAuth2 tokens GSC (encriptado en app)
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_sites_client       ON sites(client_id);
CREATE INDEX idx_sites_tracking_id  ON sites(tracking_id);
CREATE INDEX idx_sites_domain       ON sites(domain);

COMMENT ON COLUMN sites.tracking_id IS 'ID público que se incluye en el script de tracking del sitio cliente';
COMMENT ON COLUMN sites.gsc_token   IS 'Tokens OAuth2 de GSC, deben almacenarse encriptados desde la aplicación';
