import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 })

  const range = req.nextUrl.searchParams.get('range') ?? '28d'
  const days  = range === '7d' ? 7 : range === '90d' ? 90 : 28

  // Ejecutar todas las queries en paralelo
  const [
    current, previous, daily,
    sources, devices,
    richErrors, securityActive,
    alertsActive, unreadEmails,
    topPages, aiRecs,
  ] = await Promise.all([

    // Métricas del período actual
    queryOne<{
      visits: string; pageviews: string; bounces: string;
      avg_duration: string; desktop: string; mobile: string; tablet: string
    }>(`
      SELECT
        COUNT(DISTINCT s.id)                                            AS visits,
        COUNT(e.id)                                                     AS pageviews,
        COUNT(DISTINCT s.id) FILTER (WHERE s.pages_visited = 1)        AS bounces,
        ROUND(AVG(s.duration_sec))                                      AS avg_duration,
        COUNT(DISTINCT s.id) FILTER (WHERE s.device_type = 'desktop')  AS desktop,
        COUNT(DISTINCT s.id) FILTER (WHERE s.device_type = 'mobile')   AS mobile,
        COUNT(DISTINCT s.id) FILTER (WHERE s.device_type = 'tablet')   AS tablet
      FROM sessions s
      LEFT JOIN events e ON e.session_id = s.id AND e.event_type = 'pageview'
      WHERE s.site_id = $1 AND s.is_bot = false
        AND s.started_at >= NOW() - ($2 || ' days')::INTERVAL
    `, [siteId, days]),

    // Métricas del período anterior (para el delta)
    queryOne<{ visits: string; pageviews: string }>(`
      SELECT
        COUNT(DISTINCT id)  AS visits,
        0                   AS pageviews
      FROM sessions
      WHERE site_id = $1 AND is_bot = false
        AND started_at >= NOW() - ($2 || ' days')::INTERVAL * 2
        AND started_at <  NOW() - ($2 || ' days')::INTERVAL
    `, [siteId, days]),

    // Serie diaria para el gráfico (tráfico propio + GSC)
    query<{ stat_date: string; visits: string; clicks_gsc: string; impressions_gsc: string }>(`
      SELECT
        d::DATE                    AS stat_date,
        COALESCE(s.visits, 0)      AS visits,
        COALESCE(g.clicks, 0)      AS clicks_gsc,
        COALESCE(g.impressions, 0) AS impressions_gsc
      FROM generate_series(
        NOW() - ($2 || ' days')::INTERVAL,
        NOW(),
        '1 day'::INTERVAL
      ) AS d
      LEFT JOIN (
        SELECT started_at::DATE AS dt, COUNT(DISTINCT id) AS visits
        FROM sessions
        WHERE site_id = $1 AND is_bot = false
          AND started_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY dt
      ) s ON s.dt = d::DATE
      LEFT JOIN (
        SELECT stat_date AS dt, SUM(clicks) AS clicks, SUM(impressions) AS impressions
        FROM gsc_performance
        WHERE site_id = $1 AND query IS NULL AND page IS NULL
          AND stat_date >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY stat_date
      ) g ON g.dt = d::DATE
      ORDER BY d
    `, [siteId, days]),

    // Top fuentes de tráfico
    query<{ source: string; medium: string; sessions: string }>(`
      SELECT source, medium, COUNT(*) AS sessions
      FROM sessions
      WHERE site_id = $1 AND is_bot = false
        AND started_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY source, medium
      ORDER BY sessions DESC
      LIMIT 8
    `, [siteId, days]),

    // Distribución de dispositivos
    queryOne<{ desktop: string; mobile: string; tablet: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE device_type = 'desktop') AS desktop,
        COUNT(*) FILTER (WHERE device_type = 'mobile')  AS mobile,
        COUNT(*) FILTER (WHERE device_type = 'tablet')  AS tablet
      FROM sessions
      WHERE site_id = $1 AND is_bot = false
        AND started_at >= NOW() - ($2 || ' days')::INTERVAL
    `, [siteId, days]),

    // Rich results con errores
    queryOne<{ count: string }>(`
      SELECT COUNT(*) AS count FROM gsc_rich_results
      WHERE site_id = $1 AND status = 'error'
    `, [siteId]),

    // Problemas de seguridad activos
    queryOne<{ count: string }>(`
      SELECT COUNT(*) AS count FROM gsc_security_issues
      WHERE site_id = $1 AND status = 'active'
    `, [siteId]),

    // Alertas activas
    queryOne<{ count: string }>(`
      SELECT COUNT(*) AS count FROM system_alerts
      WHERE site_id = $1 AND status = 'active'
    `, [siteId]),

    // Emails GSC sin leer
    queryOne<{ count: string }>(`
      SELECT COUNT(*) AS count FROM gsc_email_alerts
      WHERE site_id = $1 AND status = 'unread'
    `, [siteId]),

    // Top 10 páginas
    query<{ path: string; page_title: string; unique_visits: string; avg_duration_sec: string; bounce_rate_pct: string }>(`
      SELECT path, page_title, unique_sessions AS unique_visits,
             avg_duration_sec, bounce_rate_pct
      FROM v_top_pages_30d
      WHERE site_id = $1
      ORDER BY unique_sessions DESC
      LIMIT 10
    `, [siteId]),

    // Recomendaciones IA pendientes de alta prioridad
    query<{ id: string; title: string; priority: string; category: string; action: string }>(`
      SELECT id, title, priority, category, action
      FROM ai_recommendations
      WHERE site_id = $1 AND status = 'pending'
        AND priority IN ('critical', 'high')
      ORDER BY
        CASE priority WHEN 'critical' THEN 0 ELSE 1 END,
        generated_at DESC
      LIMIT 5
    `, [siteId]),
  ])

  // Calcular deltas
  const currVisits = parseInt(current?.visits ?? '0', 10)
  const prevVisits = parseInt(previous?.visits ?? '0', 10)
  const visitsDelta = prevVisits > 0
    ? ((currVisits - prevVisits) / prevVisits) * 100
    : 0

  const currPageviews = parseInt(current?.pageviews ?? '0', 10)
  const bounces       = parseInt(current?.bounces ?? '0', 10)
  const bounceRate    = currVisits > 0 ? (bounces / currVisits) * 100 : 0

  // Formatear serie diaria
  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const chartData = daily.map(d => {
    const dt = new Date(d.stat_date)
    return {
      date:        `${dt.getDate()} ${MONTHS[dt.getMonth()]}`,
      visitas:     parseInt(d.visits, 10),
      clicks_gsc:  parseInt(d.clicks_gsc, 10),
      impresiones: parseInt(d.impressions_gsc, 10),
    }
  })

  return NextResponse.json({
    metrics: {
      visits:      currVisits,
      visitsDelta: Math.round(visitsDelta * 10) / 10,
      pageviews:   currPageviews,
      bounceRate:  Math.round(bounceRate * 10) / 10,
      avgDuration: parseInt(current?.avg_duration ?? '0', 10),
    },
    devices: {
      desktop: parseInt(devices?.desktop ?? '0', 10),
      mobile:  parseInt(devices?.mobile  ?? '0', 10),
      tablet:  parseInt(devices?.tablet  ?? '0', 10),
    },
    chartData,
    sources,
    topPages,
    health: {
      richErrors:     parseInt(richErrors?.count     ?? '0', 10),
      securityActive: parseInt(securityActive?.count ?? '0', 10),
      alertsActive:   parseInt(alertsActive?.count   ?? '0', 10),
      unreadEmails:   parseInt(unreadEmails?.count   ?? '0', 10),
    },
    aiRecs,
  })
}
