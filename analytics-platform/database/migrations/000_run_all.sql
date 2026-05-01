-- ============================================================
-- EJECUTAR EN ORDEN — crea todo el schema
-- Conectarse con psql o PHPMyAdmin/pgAdmin y correr este archivo
--
-- psql -U usuario -d analytics_db -f 000_run_all.sql
-- ============================================================

\echo '→ Módulo 1: Clientes y Sitios'
\i 001_sites.sql

\echo '→ Módulo 2: Sesiones'
\i 002_sessions.sql

\echo '→ Módulo 3: Eventos'
\i 003_events.sql

\echo '→ Módulo 4: Páginas y Estadísticas Diarias'
\i 004_pages.sql

\echo '→ Módulo 5: Google Search Console'
\i 005_gsc.sql

\echo '→ Módulo 6: Alertas y Emails'
\i 006_alerts.sql

\echo '→ Módulo 7: Recomendaciones IA'
\i 007_ai_recommendations.sql

\echo '→ Módulo 8: Vistas del Dashboard'
\i 008_views.sql

\echo '→ Módulo 9: Funciones y Triggers'
\i 009_functions.sql

\echo '→ Módulo 11: Índices de Performance para Analytics'
\i 011_analytics_indexes.sql

\echo '→ Módulo 12: Agente IA — Integración GoHighLevel'
\i 012_ghl_agent.sql

\echo '→ Módulo 13: Completar tablas GHL si 012 quedó a medias (idempotente)'
\i 013_ghl_agent_complete_partial.sql

\echo '✓ Schema creado correctamente'
