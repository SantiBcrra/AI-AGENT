# Schema Map — Analytics Platform

## Diagrama de relaciones

```
clients (1)
  └── sites (N)
        ├── sessions (N)
        │     └── events (N)
        │           └── bot_score_log (1)
        │
        ├── pages (N)
        │     └── page_stats_daily (N)  ← cron diario
        │
        ├── gsc_performance (N)
        ├── gsc_keywords (N)
        ├── gsc_rich_results (N)
        ├── gsc_sitemaps (N)
        ├── gsc_url_inspection (N)
        ├── gsc_security_issues (N)
        ├── gsc_merchant_listings (N)
        ├── gsc_email_alerts (N)
        │
        ├── system_alerts (N)
        ├── alert_config (N)
        │
        ├── ai_recommendations (N)
        └── ai_reports (N)
```

## Archivos de migración

| Archivo | Módulo | Tablas |
|---|---|---|
| 001_sites.sql | Clientes y Sitios | clients, sites |
| 002_sessions.sql | Sesiones | sessions |
| 003_events.sql | Eventos | events, bot_score_log |
| 004_pages.sql | Páginas | pages, page_stats_daily |
| 005_gsc.sql | Google Search Console | gsc_performance, gsc_keywords, gsc_rich_results, gsc_sitemaps, gsc_url_inspection, gsc_security_issues, gsc_merchant_listings |
| 006_alerts.sql | Alertas | gsc_email_alerts, system_alerts, alert_config |
| 007_ai_recommendations.sql | IA | ai_recommendations, ai_reports |
| 008_views.sql | Vistas | v_site_health, v_top_pages_30d, v_traffic_sources, v_rich_results_summary, v_keyword_opportunities |
| 009_functions.sql | Funciones | trigger_set_updated_at, update_session_on_event, upsert_page, calc_keyword_opportunity, aggregate_daily_stats |

## Cron jobs necesarios

| Frecuencia | Función | Descripción |
|---|---|---|
| Cada hora | aggregate_daily_stats() | Agrega stats de páginas |
| Diario 02:00 | collect_gsc_performance() | Trae datos de GSC |
| Diario 03:00 | inspect_rich_results() | Inspección de rich results |
| Diario 04:00 | check_security_issues() | Verifica seguridad |
| Diario 05:00 | parse_gsc_emails() | Parsea emails de Google |
| Lunes 06:00 | generate_weekly_report() | Reporte semanal IA |
| Mensual | update_geoip_db() | Actualiza MaxMind GeoLite2 |
