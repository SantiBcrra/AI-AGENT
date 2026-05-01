-- ============================================================
-- DEMO DATA — Nexphaz Analytics Platform
-- Datos realistas para visualización local
-- Ejecutar DESPUÉS de 000_run_all.sql
-- ============================================================

-- Limpiar datos demo anteriores si existen
TRUNCATE clients, sites CASCADE;

-- ── 1. Clientes ────────────────────────────────────────────

INSERT INTO clients (id, name, email, company, plan) VALUES
  (1, 'Admin Nexphaz',    'admin@nexphaz.com',      'Nexphaz Agency',       'agency'),
  (2, 'Carlos Mendoza',   'carlos@tiendatech.com',  'TiendaTech S.A.',      'pro'),
  (3, 'Laura Vidal',      'laura@estudiodigital.ar','Estudio Digital',      'pro'),
  (4, 'Marcos Ferreyra',  'marcos@consultoraSEO.ar','Consultora SEO',       'basic');

-- ── 2. Sitios ──────────────────────────────────────────────

INSERT INTO sites (id, client_id, name, domain, tracking_id, gsc_property, timezone) VALUES
  (1, 2, 'TiendaTech Principal',   'tiendatech.com',       'trk_abc123',  'sc-domain:tiendatech.com',       'America/Argentina/Buenos_Aires'),
  (2, 2, 'TiendaTech Blog',        'blog.tiendatech.com',  'trk_abc124',  'https://blog.tiendatech.com/',   'America/Argentina/Buenos_Aires'),
  (3, 3, 'Estudio Digital',        'estudiodigital.ar',    'trk_def456',  'sc-domain:estudiodigital.ar',    'America/Argentina/Buenos_Aires'),
  (4, 4, 'Consultora SEO BA',      'consultoraseo.com.ar', 'trk_ghi789',  'sc-domain:consultoraseo.com.ar', 'America/Argentina/Buenos_Aires');

-- ── 3. Páginas ─────────────────────────────────────────────

INSERT INTO pages (site_id, path, title) VALUES
  (1, '/',                         'TiendaTech - Tecnología al mejor precio'),
  (1, '/productos',                'Productos - TiendaTech'),
  (1, '/productos/notebooks',      'Notebooks y Laptops - TiendaTech'),
  (1, '/productos/celulares',      'Celulares y Smartphones - TiendaTech'),
  (1, '/productos/tablets',        'Tablets - TiendaTech'),
  (1, '/ofertas',                  'Ofertas del día - TiendaTech'),
  (1, '/carrito',                  'Carrito de compras'),
  (1, '/nosotros',                 'Quiénes somos - TiendaTech'),
  (1, '/contacto',                 'Contacto - TiendaTech'),
  (1, '/blog/mejores-notebooks-2024', 'Las mejores notebooks de 2024'),
  (2, '/',                         'Blog TiendaTech - Noticias Tech'),
  (2, '/categoria/reviews',        'Reviews de productos'),
  (2, '/mejores-celulares-2024',   'Mejores celulares 2024'),
  (3, '/',                         'Estudio Digital - Agencia de Marketing'),
  (3, '/servicios',                'Servicios de Marketing Digital'),
  (3, '/servicios/seo',            'SEO y Posicionamiento Web'),
  (4, '/',                         'Consultora SEO Buenos Aires'),
  (4, '/servicios-seo',            'Servicios SEO Profesionales');

-- ── 4. Sesiones (últimos 60 días, mix orgánico/directo/social) ──

DO $$
DECLARE
  v_date     TIMESTAMPTZ;
  v_site_id  INT;
  v_path     TEXT;
  v_source   TEXT;
  v_medium   TEXT;
  v_device   TEXT;
  v_country  TEXT;
  v_browser  TEXT;
  v_os       TEXT;
  v_bot_score INT;
  v_visit_type TEXT;
  v_duration INT;
  v_pages    INT;
  i          INT;
  v_sess_id  BIGINT;

  -- Arrays para distribución realista
  sources  TEXT[] := ARRAY['google','google','google','google','direct','direct','facebook','instagram','bing','duckduckgo'];
  mediums  TEXT[] := ARRAY['organic','organic','organic','organic','none','none','social','social','organic','organic'];
  paths1   TEXT[] := ARRAY['/','/','/productos','/productos/notebooks','/productos/celulares','/ofertas','/blog/mejores-notebooks-2024','/nosotros'];
  devices  TEXT[] := ARRAY['mobile','mobile','mobile','desktop','desktop','desktop','tablet'];
  countries TEXT[] := ARRAY['AR','AR','AR','AR','AR','MX','ES','CL','UY','PE'];
  browsers TEXT[] := ARRAY['Chrome','Chrome','Chrome','Safari','Firefox','Edge','Chrome'];
  oses     TEXT[] := ARRAY['Android','Windows','iOS','Windows','macOS','Android','Windows'];
BEGIN
  FOR i IN 1..2500 LOOP
    -- Fecha aleatoria en los últimos 60 días
    v_date    := NOW() - (random() * 60 || ' days')::INTERVAL - (random() * 86400 || ' seconds')::INTERVAL;
    v_site_id := (ARRAY[1,1,1,1,1,2,2,3,3,4])[floor(random()*10+1)::INT];

    -- Source/medium
    v_source  := sources[floor(random()*10+1)::INT];
    v_medium  := CASE v_source WHEN 'google' THEN 'organic' WHEN 'direct' THEN 'none'
                               WHEN 'bing' THEN 'organic' WHEN 'duckduckgo' THEN 'organic'
                               ELSE 'social' END;

    -- Dispositivo, país, browser
    v_device  := devices[floor(random()*7+1)::INT];
    v_country := countries[floor(random()*10+1)::INT];
    v_browser := browsers[floor(random()*7+1)::INT];
    v_os      := CASE v_device
                   WHEN 'mobile'  THEN (ARRAY['Android','iOS','Android'])[floor(random()*3+1)::INT]
                   WHEN 'tablet'  THEN 'iOS'
                   ELSE (ARRAY['Windows','macOS','Linux'])[floor(random()*3+1)::INT]
                 END;

    -- Bot score (90% humanos, 10% bots)
    v_bot_score  := CASE WHEN random() < 0.90 THEN floor(random()*25)::INT
                         WHEN random() < 0.50 THEN floor(random()*30+30)::INT
                         ELSE floor(random()*40+60)::INT END;
    v_visit_type := CASE WHEN v_bot_score < 30 THEN (ARRAY['human','human','human','likely_human'])[floor(random()*4+1)::INT]
                         WHEN v_bot_score < 60 THEN 'suspicious'
                         ELSE (ARRAY['bot_crawler','bot_seo_tool','bot_generic'])[floor(random()*3+1)::INT] END;

    -- Duración y páginas
    v_duration := CASE WHEN v_visit_type = 'human' THEN floor(random()*300+30)::INT ELSE floor(random()*5)::INT END;
    v_pages    := CASE WHEN v_visit_type = 'human' AND random() > 0.4 THEN floor(random()*5+1)::INT ELSE 1 END;

    INSERT INTO sessions (
      site_id, fingerprint, session_token,
      source, medium, referrer_domain,
      browser, browser_version, os, device_type,
      country_code, country_name,
      city, language,
      bot_score, visit_type, is_bot,
      pages_visited, duration_sec, did_interact,
      started_at, last_seen_at
    ) VALUES (
      v_site_id,
      md5(random()::TEXT || i::TEXT),
      md5(random()::TEXT),
      v_source, v_medium,
      CASE v_source WHEN 'google' THEN 'google.com' WHEN 'facebook' THEN 'facebook.com'
                    WHEN 'instagram' THEN 'instagram.com' WHEN 'bing' THEN 'bing.com' ELSE NULL END,
      v_browser,
      CASE v_browser WHEN 'Chrome' THEN '120.0' WHEN 'Firefox' THEN '121.0'
                     WHEN 'Safari' THEN '17.2'  WHEN 'Edge'    THEN '120.0' END,
      v_os, v_device,
      v_country,
      CASE v_country WHEN 'AR' THEN 'Argentina' WHEN 'MX' THEN 'México'
                     WHEN 'ES' THEN 'España'     WHEN 'CL' THEN 'Chile'
                     WHEN 'UY' THEN 'Uruguay'    ELSE 'Perú' END,
      CASE v_country WHEN 'AR' THEN (ARRAY['Buenos Aires','Córdoba','Rosario','Mendoza'])[floor(random()*4+1)::INT]
                     WHEN 'MX' THEN 'Ciudad de México'
                     WHEN 'ES' THEN 'Madrid' ELSE NULL END,
      'es-AR',
      v_bot_score, v_visit_type, v_bot_score >= 60,
      v_pages, v_duration, v_visit_type = 'human',
      v_date, v_date + (v_duration || ' seconds')::INTERVAL
    ) RETURNING id INTO v_sess_id;

    -- Insertar pageview para esta sesión
    INSERT INTO events (
      site_id, session_id, event_type, url, path, page_title,
      scroll_depth, duration_ms, load_time_ms, js_interacted, created_at
    ) VALUES (
      v_site_id, v_sess_id, 'pageview',
      'https://' || (SELECT domain FROM sites WHERE id = v_site_id) || paths1[floor(random()*8+1)::INT],
      paths1[floor(random()*8+1)::INT],
      'Página - ' || (SELECT domain FROM sites WHERE id = v_site_id),
      floor(random()*100)::INT,
      v_duration * 1000,
      floor(random()*2500+300)::INT,
      v_visit_type = 'human',
      v_date
    );
  END LOOP;
END $$;

-- ── 5. Page stats diarios (últimos 90 días) ───────────────

INSERT INTO page_stats_daily (site_id, page_id, stat_date,
  pageviews, unique_visits, sessions, bounces,
  avg_duration_sec, avg_scroll_depth_pct, interactions,
  desktop_visits, mobile_visits, tablet_visits,
  gsc_clicks, gsc_impressions, gsc_ctr, gsc_position)
SELECT
  p.site_id,
  p.id AS page_id,
  d::DATE AS stat_date,
  -- Tráfico con tendencia creciente y variación
  GREATEST(1, floor(
    base_visits * (1 + day_num * 0.005) * seasonal_factor * random_factor
  )::INT) AS pageviews,
  GREATEST(1, floor(
    base_visits * 0.85 * (1 + day_num * 0.005) * seasonal_factor * random_factor
  )::INT) AS unique_visits,
  GREATEST(1, floor(
    base_visits * 0.85 * (1 + day_num * 0.005) * seasonal_factor * random_factor
  )::INT) AS sessions,
  GREATEST(0, floor(
    base_visits * 0.85 * 0.38 * (1 + day_num * 0.005) * seasonal_factor * random_factor
  )::INT) AS bounces,
  floor(random()*180 + 60)::INT AS avg_duration_sec,
  floor(random()*50 + 30)::NUMERIC AS avg_scroll_depth_pct,
  floor(random()*20)::INT AS interactions,
  floor(base_visits * 0.85 * 0.45 * random_factor)::INT AS desktop_visits,
  floor(base_visits * 0.85 * 0.45 * random_factor)::INT AS mobile_visits,
  floor(base_visits * 0.85 * 0.10 * random_factor)::INT AS tablet_visits,
  -- GSC data con crecimiento leve
  GREATEST(0, floor(base_gsc * (1 + day_num * 0.004) * seasonal_factor * random_factor))::INT AS gsc_clicks,
  GREATEST(10, floor(base_gsc * 15 * (1 + day_num * 0.003) * seasonal_factor * random_factor))::INT AS gsc_impressions,
  (0.02 + random() * 0.06)::NUMERIC AS gsc_ctr,
  (2.5 + random() * 12)::NUMERIC AS gsc_position
FROM (
  SELECT
    p.*,
    d,
    (CURRENT_DATE - d::DATE) AS day_num,
    -- Base visits según importancia de la página
    CASE p.path
      WHEN '/'             THEN 80
      WHEN '/productos'    THEN 55
      WHEN '/ofertas'      THEN 45
      ELSE floor(random()*30 + 8)
    END AS base_visits,
    CASE p.path
      WHEN '/'             THEN 60
      WHEN '/productos'    THEN 40
      WHEN '/ofertas'      THEN 35
      ELSE floor(random()*20 + 5)
    END AS base_gsc,
    -- Factor estacional (fines de semana menos tráfico)
    CASE EXTRACT(DOW FROM d::DATE)
      WHEN 0 THEN 0.65  -- domingo
      WHEN 6 THEN 0.75  -- sábado
      ELSE 1.0
    END AS seasonal_factor,
    -- Factor random diario
    (0.75 + random() * 0.50) AS random_factor
  FROM pages p
  CROSS JOIN generate_series(
    CURRENT_DATE - INTERVAL '90 days',
    CURRENT_DATE - INTERVAL '1 day',
    '1 day'::INTERVAL
  ) AS d
  WHERE p.site_id IN (1,2,3,4)
) sub
ON CONFLICT (site_id, page_id, stat_date) DO NOTHING;

-- ── 6. GSC Performance (60 días) ─────────────────────────

INSERT INTO gsc_performance (site_id, stat_date, clicks, impressions, ctr, position)
SELECT
  site_id,
  d::DATE,
  floor(base_clicks * (1 + (CURRENT_DATE - d::DATE) * -0.004) * (0.8 + random() * 0.4))::INT,
  floor(base_clicks * 18 * (0.8 + random() * 0.4))::INT,
  (0.03 + random() * 0.05)::NUMERIC,
  (3 + random() * 8)::NUMERIC
FROM (
  VALUES (1, 280), (2, 120), (3, 95), (4, 65)
) AS t(site_id, base_clicks)
CROSS JOIN generate_series(
  CURRENT_DATE - INTERVAL '60 days',
  CURRENT_DATE - INTERVAL '2 days',
  '1 day'::INTERVAL
) AS d
ON CONFLICT DO NOTHING;

-- ── 7. GSC Keywords ────────────────────────────────────────

INSERT INTO gsc_keywords (site_id, query, total_clicks, total_impressions, avg_ctr, avg_position, clicks_delta, trend, opportunity_score, opportunity_type) VALUES
-- TiendaTech (site 1)
(1, 'notebooks baratas argentina',    1840, 42000, 0.044, 3.2,  120, 'up',     45, 'quick_win'),
(1, 'comprar celular online',         1560, 38000, 0.041, 4.1,   85, 'up',     52, 'quick_win'),
(1, 'tienda tecnología buenos aires', 1280, 12000, 0.107, 2.1,   -20,'stable', 25, NULL),
(1, 'notebook gamer precio',          980,  28000, 0.035, 5.8,  -45,'down',   68, 'quick_win'),
(1, 'tablet samsung argentina',       870,  22000, 0.040, 6.2,   30,'up',     60, 'quick_win'),
(1, 'celular xiaomi precio',          760,  35000, 0.022, 7.4,  -30,'down',   75, 'high_volume'),
(1, 'auriculares inalámbricos',       540,  18000, 0.030, 8.1,   15,'stable', 55, 'quick_win'),
(1, 'smartwatch barato',              480,  16000, 0.030, 9.3,    5,'stable', 48, 'long_tail'),
(1, 'laptop apple argentina',         420,  14000, 0.030, 11.2, -10,'down',   40, 'long_tail'),
(1, 'accesorios pc gamer',            380,  11000, 0.035, 8.7,   25,'up',     42, 'long_tail'),
(1, 'tiendatech envíos',              320,   4200, 0.076, 1.8,    0,'stable', 10, NULL),
(1, 'monitor 4k precio argentina',    290,  12000, 0.024, 12.5, -15,'down',   38, 'long_tail'),
(1, 'mejores notebooks 2024',         260,   9800, 0.027, 6.4,   40,'new',    62, 'new_opportunity'),
(1, 'ssd externo barato',             230,   8400, 0.027, 10.1,  -5,'stable', 35, 'long_tail'),
(1, 'mouse gamer inalámbrico',        210,   7600, 0.028, 9.8,   18,'up',     38, 'long_tail'),
-- Estudio Digital (site 3)
(3, 'agencia seo argentina',          580,  14000, 0.041, 4.8,   25,'up',     55, 'quick_win'),
(3, 'marketing digital buenos aires', 490,  16000, 0.031, 6.1,   -8,'stable', 48, 'quick_win'),
(3, 'posicionamiento web',            380,  12000, 0.032, 7.3,  -20,'down',   60, 'quick_win'),
(3, 'diseño web profesional',         290,   9800, 0.030, 8.9,   12,'up',     45, 'long_tail'),
(3, 'consultoría seo',                240,   8200, 0.029, 10.2,   5,'stable', 38, 'long_tail'),
-- Consultora SEO (site 4)
(4, 'consultor seo freelance',        320,   8400, 0.038, 5.6,   15,'up',     50, 'quick_win'),
(4, 'auditoría seo',                  280,   7200, 0.039, 6.8,   -5,'stable', 42, 'long_tail'),
(4, 'seo ecommerce argentina',        195,   6800, 0.029, 9.1,   20,'new',    58, 'new_opportunity');

-- ── 8. Rich Results ────────────────────────────────────────

INSERT INTO gsc_rich_results (site_id, page_url, result_type, status, errors_count, warnings_count, issues) VALUES
(1,'https://tiendatech.com/productos/notebooks','product','valid',0,0,'[]'),
(1,'https://tiendatech.com/productos/celulares','product','valid_with_warnings',0,2,'[{"type":"warning","field":"brand","message":"Campo brand no especificado en algunos productos"}]'),
(1,'https://tiendatech.com/productos/tablets','product','error',2,1,'[{"type":"error","field":"price","message":"Precio no encontrado o formato incorrecto"},{"type":"error","field":"availability","message":"Campo availability faltante"},{"type":"warning","field":"image","message":"Imagen de baja resolución"}]'),
(1,'https://tiendatech.com/','product','valid',0,0,'[]'),
(1,'https://tiendatech.com/blog/mejores-notebooks-2024','review','valid',0,1,'[{"type":"warning","field":"reviewCount","message":"Número de reseñas muy bajo"}]'),
(1,'https://tiendatech.com/productos','breadcrumb','valid',0,0,'[]'),
(1,'https://tiendatech.com/productos/notebooks','breadcrumb','valid',0,0,'[]'),
(1,'https://tiendatech.com/productos/celulares','breadcrumb','valid_with_warnings',0,1,'[{"type":"warning","field":"item","message":"URL canónica no coincide con la breadcrumb"}]'),
(2,'https://blog.tiendatech.com/mejores-celulares-2024','article','valid',0,0,'[]'),
(2,'https://blog.tiendatech.com/categoria/reviews','breadcrumb','valid',0,0,'[]'),
(3,'https://estudiodigital.ar/servicios','local_business','error',3,0,'[{"type":"error","field":"address","message":"Dirección no encontrada"},{"type":"error","field":"telephone","message":"Número de teléfono faltante"},{"type":"error","field":"openingHours","message":"Horario de atención no especificado"}]'),
(3,'https://estudiodigital.ar/','breadcrumb','valid',0,0,'[]'),
(4,'https://consultoraseo.com.ar/','local_business','valid_with_warnings',0,2,'[{"type":"warning","field":"priceRange","message":"Rango de precios no especificado"},{"type":"warning","field":"image","message":"Imagen del negocio faltante"}]');

-- ── 9. Sitemaps ────────────────────────────────────────────

INSERT INTO gsc_sitemaps (site_id, sitemap_url, status, urls_submitted, urls_indexed, urls_errors, last_submitted, errors) VALUES
(1,'https://tiendatech.com/sitemap.xml',       'ok',    142, 138, 0, NOW()-INTERVAL '1 day',  '[]'),
(1,'https://tiendatech.com/sitemap-products.xml','ok',  890, 876, 0, NOW()-INTERVAL '1 day',  '[]'),
(2,'https://blog.tiendatech.com/sitemap.xml',  'ok',     48,  46, 0, NOW()-INTERVAL '2 days', '[]'),
(3,'https://estudiodigital.ar/sitemap.xml',    'error',  24,  18, 3, NOW()-INTERVAL '3 days',
  '[{"code":"url_error","message":"3 URLs retornan 404: /servicios/old-page, /blog/post-borrado, /contacto-viejo"}]'),
(4,'https://consultoraseo.com.ar/sitemap.xml', 'ok',     12,  12, 0, NOW()-INTERVAL '1 day',  '[]');

-- ── 10. Seguridad e inspección de URLs ────────────────────

INSERT INTO gsc_url_inspection (site_id, page_url, coverage_state, indexing_state, robots_state, verdict, mobile_usable) VALUES
(1,'https://tiendatech.com/',                        'Submitted and indexed',                  'INDEXING_ALLOWED','ALLOWED','PASS',true),
(1,'https://tiendatech.com/productos',               'Submitted and indexed',                  'INDEXING_ALLOWED','ALLOWED','PASS',true),
(1,'https://tiendatech.com/productos/notebooks',     'Submitted and indexed',                  'INDEXING_ALLOWED','ALLOWED','PASS',true),
(1,'https://tiendatech.com/ofertas-antiguas',        'Page with redirect',                     'INDEXING_ALLOWED','ALLOWED','NEUTRAL',true),
(1,'https://tiendatech.com/producto-descontinuado',  'Not found (404)',                        'INDEXING_NOT_ALLOWED','ALLOWED','FAIL',true),
(2,'https://blog.tiendatech.com/',                   'Submitted and indexed',                  'INDEXING_ALLOWED','ALLOWED','PASS',true),
(3,'https://estudiodigital.ar/',                     'Submitted and indexed',                  'INDEXING_ALLOWED','ALLOWED','PASS',true),
(3,'https://estudiodigital.ar/blog/old-post',        'Crawled - currently not indexed',        'INDEXING_ALLOWED','ALLOWED','NEUTRAL',false),
(3,'https://estudiodigital.ar/servicios/old-page',   'Not found (404)',                        'INDEXING_NOT_ALLOWED','ALLOWED','FAIL',true),
(4,'https://consultoraseo.com.ar/',                  'Submitted and indexed',                  'INDEXING_ALLOWED','ALLOWED','PASS',true);

-- ── 11. Alertas del sistema ────────────────────────────────

INSERT INTO system_alerts (site_id, alert_type, severity, title, message, status, change_pct, triggered_at) VALUES
(1,'traffic_drop',    'high',   'Caída de tráfico orgánico: -28%',
  'tiendatech.com registró 1.240 visitas ayer, un 28% menos que el promedio de los últimos 7 días (1.720 visitas). Las páginas de productos notebooks y celulares son las más afectadas.',
  'active', -28.3, NOW()-INTERVAL '1 day'),
(1,'rich_result_error','high',  'Errores en Rich Results: Tablets',
  'La página /productos/tablets tiene 2 errores en el fragmento de producto: precio no encontrado y availability faltante. Esto impide que aparezca con fragmento enriquecido en Google.',
  'active', NULL, NOW()-INTERVAL '2 days'),
(3,'sitemap_error',   'medium', 'Sitemap con 3 URLs en error',
  'El sitemap de estudiodigital.ar tiene 3 URLs que retornan 404. Esto puede afectar la indexación de contenido nuevo.',
  'active', NULL, NOW()-INTERVAL '3 days'),
(3,'rich_result_error','high',  'Local Business sin información de contacto',
  'La página de inicio de estudiodigital.ar tiene 3 errores críticos en el markup de Local Business: dirección, teléfono y horarios faltantes.',
  'active', NULL, NOW()-INTERVAL '4 days'),
(1,'gsc_position_drop','medium','Caída de posición: "notebook gamer precio"',
  'La keyword "notebook gamer precio" bajó de posición 3.2 a 5.8 en los últimos 14 días, con una pérdida de 45 clicks.',
  'acknowledged', NULL, NOW()-INTERVAL '5 days'),
(4,'traffic_spike',   'info',   'Pico de tráfico: +145% sobre el promedio',
  'consultoraseo.com.ar registró 180 visitas ayer vs el promedio de 73. Posible efecto de una mención en redes sociales o medio digital.',
  'resolved', 145.2, NOW()-INTERVAL '6 days'),
(2,'gsc_impressions_drop','medium','Caída de impresiones: -18%',
  'blog.tiendatech.com tuvo 18% menos impresiones esta semana. Podría estar relacionado con la actualización de algoritmo del 12 de marzo.',
  'active', -18.0, NOW()-INTERVAL '7 days');

-- ── 12. Emails de GSC (simulados) ─────────────────────────

INSERT INTO gsc_email_alerts (site_id, gmail_message_id, sender, subject, received_at, alert_type, severity, summary, action_required, status) VALUES
(1,'msg_001','search-console-noreply@google.com',
  'Acción requerida: problemas de cobertura en tiendatech.com',
  NOW()-INTERVAL '2 days', 'coverage','high',
  'Google detectó que 4 páginas de tiendatech.com no pueden ser indexadas por errores de servidor (5xx) intermitentes. Esto puede afectar el posicionamiento de las páginas de productos.',
  'Revisar los logs del servidor para identificar y corregir los errores 5xx. Verificar que las páginas afectadas sean accesibles desde la herramienta de inspección de URLs.',
  'unread'),
(3,'msg_002','search-console-noreply@google.com',
  'Nuevo problema de usabilidad móvil detectado en estudiodigital.ar',
  NOW()-INTERVAL '5 days', 'mobile','medium',
  'Se detectaron 3 páginas con problemas de usabilidad en dispositivos móviles: elementos clickeables demasiado juntos y contenido más ancho que la pantalla.',
  'Revisar el diseño responsivo de las páginas /servicios/seo, /blog y /contacto. Corregir el tamaño de los botones y la adaptación del contenido.',
  'unread'),
(1,'msg_003','search-console-noreply@google.com',
  'Actualización del algoritmo principal de Google — marzo 2025',
  NOW()-INTERVAL '12 days', 'core_update','info',
  'Google completó el despliegue de la actualización principal de marzo 2025. Los sitios con cambios significativos en el ranking pueden tomar semanas en estabilizarse.',
  NULL,
  'read'),
(4,'msg_004','search-console-noreply@google.com',
  'Aviso: enlace de spam detectado en consultoraseo.com.ar',
  NOW()-INTERVAL '18 days', 'manual_action','critical',
  'Google detectó un patrón de enlaces artificiales apuntando a consultoraseo.com.ar desde redes de sitios de baja calidad. Se recomienda revisar el perfil de enlaces y desautorizar los spammy.',
  'Usar Google Search Console para exportar el perfil de enlaces. Identificar dominios de baja calidad y crear un archivo de desautorización. Subir el archivo a través de la herramienta Disavow Links.',
  'unread');

-- ── 13. Recomendaciones IA ─────────────────────────────────

INSERT INTO ai_recommendations (site_id, category, priority, title, description, action, expected_impact, affected_urls, status, generated_at) VALUES
(1,'keywords','high',
  '3 keywords en posición 5-10 listas para mejorar CTR',
  'Las queries "notebook gamer precio" (pos. 5.8), "tablet samsung argentina" (pos. 6.2) y "celular xiaomi precio" (pos. 7.4) tienen alto volumen de impresiones pero CTR por debajo del 4%. Están en la "zona de oportunidad" donde pequeñas mejoras en el título y la meta descripción pueden mover el resultado a las primeras posiciones.',
  '1. Reescribir el title tag de cada página incluyendo el año (2024/2025) y palabras de intención de compra. 2. Agregar precio aproximado en la meta description. 3. Incluir schema de producto con precio y disponibilidad.',
  'Aumento estimado de 20-35% en clicks orgánicos para estas 3 páginas en 4-6 semanas.',
  '["https://tiendatech.com/productos/notebooks","https://tiendatech.com/productos/tablets","https://tiendatech.com/productos/celulares"]',
  'pending', NOW()-INTERVAL '1 day'),

(1,'rich_results','critical',
  'Corregir errores de Schema en página de Tablets',
  'La página /productos/tablets tiene 2 errores que impiden mostrar el fragmento enriquecido de producto en Google Search: precio no encontrado y campo availability faltante. Esto afecta a una página con 870 impresiones mensuales.',
  '1. Agregar el campo "offers" al JSON-LD de la página con price, priceCurrency y availability. 2. Verificar que el precio sea crawlable (no generado con JS). 3. Validar con la herramienta de prueba de resultados enriquecidos de Google.',
  'Activar el fragmento enriquecido de producto. Mejora esperada del 15-25% en CTR para búsquedas de tablets.',
  '["https://tiendatech.com/productos/tablets"]',
  'pending', NOW()-INTERVAL '1 day'),

(1,'seo_content','medium',
  'Capitalizar el crecimiento de "mejores notebooks 2024"',
  'La keyword "mejores notebooks 2024" apareció como nueva este mes con 260 clicks y creciendo. La página del blog tiene el contenido pero no está completamente optimizada para esta intención de búsqueda.',
  '1. Actualizar el H1 y title para que coincida exactamente con la búsqueda. 2. Agregar una tabla comparativa con las mejores opciones disponibles en la tienda. 3. Linkar desde las páginas de productos relevantes.',
  'Consolidar posición en top 5 y capturar tráfico estacional del final del año escolar.',
  '["https://tiendatech.com/blog/mejores-notebooks-2024"]',
  'pending', NOW()-INTERVAL '1 day'),

(3,'rich_results','critical',
  'Local Business sin datos de contacto — pérdida de visibilidad local',
  'El markup de Local Business en estudiodigital.ar tiene 3 errores críticos: falta dirección, teléfono y horario de atención. Sin estos datos, Google no puede mostrar el negocio en búsquedas locales como "agencia seo buenos aires".',
  '1. Agregar el JSON-LD de LocalBusiness con address (streetAddress, city, region), telephone y openingHours. 2. Crear o reclamar el perfil de Google Business Profile. 3. Verificar consistencia NAP (nombre, dirección, teléfono) en todo el sitio.',
  'Aparición en búsquedas locales y posible ingreso al Local Pack de Google Maps.',
  '["https://estudiodigital.ar/"]',
  'pending', NOW()-INTERVAL '2 days'),

(3,'seo_technical','medium',
  'Corregir 3 URLs 404 en el sitemap',
  'El sitemap de estudiodigital.ar incluye 3 URLs que retornan error 404. Esto confunde al crawler de Google y puede dilir el presupuesto de crawl del sitio.',
  '1. Configurar redirecciones 301 permanentes desde las URLs viejas a las nuevas páginas equivalentes. 2. Si no hay equivalente, eliminar las URLs del sitemap. 3. Volver a enviar el sitemap actualizado desde GSC.',
  'Mejora en la eficiencia de crawl e indexación de páginas nuevas.',
  '["https://estudiodigital.ar/servicios/old-page","https://estudiodigital.ar/blog/post-borrado","https://estudiodigital.ar/contacto-viejo"]',
  'pending', NOW()-INTERVAL '2 days');

-- ── 14. Reporte semanal ────────────────────────────────────

INSERT INTO ai_reports (site_id, report_type, period_start, period_end, headline, summary, total_visits, visits_change, issues_found, generated_at) VALUES
(1,'weekly',
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE,
  'Semana mixta: tráfico orgánico cayó 12% pero nuevas keywords emergentes compensan',
  'TiendaTech tuvo una semana con resultados mixtos. El tráfico orgánico total bajó un 12% impactado principalmente por la caída en las queries de "notebook gamer". Sin embargo, 3 nuevas keywords relacionadas con "mejores notebooks 2024" están ganando tracción y compensan parcialmente la caída. Los fragmentos de producto necesitan atención urgente en la categoría de tablets.',
  8420, -12.0, 3, NOW()-INTERVAL '1 day'),
(3,'weekly',
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE,
  'Tráfico estable con oportunidad clara en búsquedas locales',
  'Estudio Digital mantuvo tráfico estable esta semana (+3%). La mayor oportunidad identificada es la búsqueda local: corregir el markup de Local Business puede generar visibilidad en Google Maps y búsquedas locales de "agencia seo buenos aires", una query con 14.000 impresiones mensuales.',
  1840, 3.0, 2, NOW()-INTERVAL '1 day');

-- Actualizar secuencias
SELECT setval('clients_id_seq', 10);
SELECT setval('sites_id_seq', 10);

\echo '✓ Demo data inserted successfully'
\echo '  - 4 clients, 4 sites'
\echo '  - 2500 demo sessions with events'
\echo '  - 90 days of page stats'
\echo '  - 60 days of GSC performance'
\echo '  - 23 keywords with opportunities'
\echo '  - 13 rich result checks'
\echo '  - 7 system alerts'
\echo '  - 4 GSC email alerts'
\echo '  - 5 AI recommendations'
