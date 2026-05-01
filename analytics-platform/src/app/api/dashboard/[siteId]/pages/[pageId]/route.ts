// ============================================================
// GET /api/dashboard/[siteId]/pages/[pageId]
//
// Detalles de una página específica:
//   - Métricas del período
//   - Serie diaria
//   - Clicks por elemento (heat-like aggregation)
//   - Fuentes de tráfico hacia esta página
//   - Keywords de GSC para esta URL
//   - Recomendaciones IA activas para esta URL
//   - Structured data detectada (desde eventos)
//
// Parámetros:
//   ?range=7d|28d|90d   (default: 28d)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: { siteId: string; pageId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  const pageId = parseInt(params.pageId,  10)

  if (isNaN(siteId) || isNaN(pageId)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const range = req.nextUrl.searchParams.get('range') ?? '28d'
  const days  = range === '7d' ? 7 : range === '90d' ? 90 : 28

  // Verificar que la página pertenece al sitio
  const page = await queryOne<{ id: string; path: string; title: string | null }>(`
    SELECT id, path, title FROM pages WHERE id = $1 AND site_id = $2
  `, [pageId, siteId])

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  const [
    metrics,
    dailySeries,
    clickAgg,
    videoAgg,
    outboundAgg,
    pageSources,
    gscKeywords,
    aiRecs,
    schemaHistory,
  ] = await Promise.all([

    // ── Métricas agregadas del período ──────────────────
    queryOne<{
      pageviews: string; unique_visits: string; sessions: string
      bounces: string; avg_duration_sec: string; avg_scroll_pct: string
      interactions: string; gsc_clicks: string; gsc_impressions: string
      gsc_ctr: string; gsc_position: string
    }>(`
      SELECT
        COALESCE(SUM(pageviews),    0) AS pageviews,
        COALESCE(SUM(unique_visits),0) AS unique_visits,
        COALESCE(SUM(sessions),     0) AS sessions,
        COALESCE(SUM(bounces),      0) AS bounces,
        ROUND(AVG(avg_duration_sec)::NUMERIC, 1) AS avg_duration_sec,
        ROUND(AVG(avg_scroll_depth_pct)::NUMERIC, 1) AS avg_scroll_pct,
        COALESCE(SUM(interactions), 0) AS interactions,
        COALESCE(SUM(gsc_clicks),   0) AS gsc_clicks,
        COALESCE(SUM(gsc_impressions),0) AS gsc_impressions,
        CASE WHEN SUM(gsc_impressions) > 0
          THEN ROUND(SUM(gsc_clicks)::NUMERIC / SUM(gsc_impressions), 4)
          ELSE 0
        END AS gsc_ctr,
        ROUND(AVG(gsc_position)::NUMERIC, 1) AS gsc_position
      FROM page_stats_daily
      WHERE site_id = $1 AND page_id = $2
        AND stat_date >= CURRENT_DATE - ($3 || ' days')::INTERVAL
    `, [siteId, pageId, days]),

    // ── Serie diaria para gráfico de línea ──────────────
    query<{ stat_date: string; pageviews: string; unique_visits: string; gsc_clicks: string; gsc_impressions: string }>(`
      SELECT
        d::DATE                              AS stat_date,
        COALESCE(psd.pageviews,    0)        AS pageviews,
        COALESCE(psd.unique_visits,0)        AS unique_visits,
        COALESCE(psd.gsc_clicks,   0)        AS gsc_clicks,
        COALESCE(psd.gsc_impressions,0)      AS gsc_impressions
      FROM generate_series(
        CURRENT_DATE - ($3 || ' days')::INTERVAL,
        CURRENT_DATE,
        '1 day'::INTERVAL
      ) AS d
      LEFT JOIN page_stats_daily psd
        ON psd.stat_date = d::DATE
       AND psd.page_id   = $2
       AND psd.site_id   = $1
      ORDER BY d
    `, [siteId, pageId, days]),

    // ── Click aggregation (heat-like) ────────────────────
    // Agrupa clics por elemento: tag + texto + id
    // Excluye sesiones bot y filtra solo eventos click
    query<{ element_tag: string; element_text: string; element_id: string | null; clicks: string }>(`
      SELECT
        COALESCE(e.properties->>'tag',  'unknown') AS element_tag,
        COALESCE(e.properties->>'text', '')        AS element_text,
        e.properties->>'id'                        AS element_id,
        COUNT(*)                                   AS clicks
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.site_id    = $1
        AND e.path       = $4
        AND e.event_type = 'click'
        AND s.is_bot     = false
        AND e.created_at >= NOW() - ($3 || ' days')::INTERVAL
      GROUP BY element_tag, element_text, element_id
      HAVING COUNT(*) > 1
      ORDER BY clicks DESC
      LIMIT 30
    `, [siteId, pageId, days, page.path]),

    // ── Video events agregados ───────────────────────────
    query<{ action: string; src: string; count: string; avg_position_sec: string }>(`
      SELECT
        e.properties->>'action'                AS action,
        COALESCE(e.properties->>'src', '')     AS src,
        COUNT(*)                               AS count,
        ROUND(AVG((e.properties->>'position_sec')::NUMERIC), 0) AS avg_position_sec
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.site_id    = $1
        AND e.path       = $3
        AND e.event_type = 'video'
        AND s.is_bot     = false
        AND e.created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY action, src
      ORDER BY count DESC
    `, [siteId, days, page.path]),

    // ── Outbound links desde esta página ────────────────
    query<{ href: string; text: string; clicks: string }>(`
      SELECT
        COALESCE(e.properties->>'href', '') AS href,
        COALESCE(e.properties->>'text', '') AS text,
        COUNT(*)                            AS clicks
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.site_id    = $1
        AND e.path       = $3
        AND e.event_type = 'outbound'
        AND s.is_bot     = false
        AND e.created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY href, text
      ORDER BY clicks DESC
      LIMIT 20
    `, [siteId, days, page.path]),

    // ── Fuentes de tráfico hacia esta página ────────────
    query<{ source: string; medium: string; sessions: string }>(`
      SELECT s.source, s.medium, COUNT(DISTINCT s.id) AS sessions
      FROM sessions s
      JOIN events   e ON e.session_id = s.id
      WHERE s.site_id    = $1
        AND s.is_bot     = false
        AND e.path       = $3
        AND e.event_type = 'pageview'
        AND e.created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY s.source, s.medium
      ORDER BY sessions DESC
      LIMIT 10
    `, [siteId, days, page.path]),

    // ── Keywords de GSC para esta URL ────────────────────
    query<{ query: string; clicks: string; impressions: string; ctr: string; position: string }>(`
      SELECT
        gp.query,
        SUM(gp.clicks)                                          AS clicks,
        SUM(gp.impressions)                                     AS impressions,
        ROUND(SUM(gp.clicks)::NUMERIC / NULLIF(SUM(gp.impressions),0), 4) AS ctr,
        ROUND(AVG(gp.position)::NUMERIC, 1)                    AS position
      FROM gsc_performance gp
      JOIN sites st ON st.id = $1
      WHERE gp.site_id   = $1
        AND gp.query     IS NOT NULL
        AND gp.page      = 'https://' || st.domain || $3
        AND gp.stat_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY gp.query
      ORDER BY clicks DESC
      LIMIT 20
    `, [siteId, days, page.path]),

    // ── Recomendaciones IA activas para esta URL ─────────
    // affected_urls es un array JSONB de paths: ["/productos/zapatos"]
    // @> comprueba si el array contiene el path exacto
    query<{ id: string; title: string; priority: string; category: string; description: string; action: string }>(`
      SELECT id, title, priority, category, description, action
      FROM ai_recommendations
      WHERE site_id = $1
        AND status  = 'pending'
        AND affected_urls @> $2::jsonb
      ORDER BY CASE priority
        WHEN 'critical' THEN 0 WHEN 'high' THEN 1
        WHEN 'medium'   THEN 2 ELSE 3
      END
      LIMIT 10
    `, [siteId, JSON.stringify([page.path])]),

    // ── Structured data detectada (desde eventos) ────────
    // Busca en events.properties.schema_types los últimos 30 pageviews
    query<{ schema_type: string; occurrences: string }>(`
      SELECT
        jsonb_array_elements_text(e.properties->'schema_types') AS schema_type,
        COUNT(*) AS occurrences
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.site_id    = $1
        AND e.path       = $3
        AND e.event_type = 'pageview'
        AND s.is_bot     = false
        AND e.created_at >= NOW() - ($2 || ' days')::INTERVAL
        AND e.properties ? 'schema_types'
      GROUP BY schema_type
      ORDER BY occurrences DESC
    `, [siteId, days, page.path]),
  ])

  // Calcular engagement score
  const sessions     = parseInt(metrics?.sessions    ?? '0', 10)
  const bounces      = parseInt(metrics?.bounces     ?? '0', 10)
  const duration     = parseFloat(metrics?.avg_duration_sec ?? '0')
  const scroll       = parseFloat(metrics?.avg_scroll_pct   ?? '0')
  const ctr          = parseFloat(metrics?.gsc_ctr          ?? '0')
  const interactions = parseInt(metrics?.interactions ?? '0', 10)

  const bounceRate = sessions > 0 ? (bounces / sessions) * 100 : 0
  const engagementScore = Math.round(
    (1 - bounceRate / 100) * 30 +
    Math.min(1, duration / 180)  * 25 +
    Math.min(1, scroll / 100)    * 20 +
    Math.min(1, ctr / 0.10)      * 15 +
    Math.min(1, sessions > 0 ? (interactions / sessions / 5) : 0) * 10
  )

  return NextResponse.json({
    page: {
      id:    parseInt(page.id, 10),
      path:  page.path,
      title: page.title,
    },
    metrics: {
      pageviews:      parseInt(metrics?.pageviews     ?? '0', 10),
      uniqueVisits:   parseInt(metrics?.unique_visits ?? '0', 10),
      sessions,
      bounceRate:     Math.round(bounceRate * 10) / 10,
      avgDurationSec: duration,
      avgScrollPct:   scroll,
      interactions,
      engagementScore,
    },
    gsc: {
      clicks:      parseInt(metrics?.gsc_clicks      ?? '0', 10),
      impressions: parseInt(metrics?.gsc_impressions ?? '0', 10),
      ctr:         parseFloat(metrics?.gsc_ctr       ?? '0'),
      position:    metrics?.gsc_position ? parseFloat(metrics.gsc_position) : null,
    },
    dailySeries: dailySeries.map(d => ({
      date:        d.stat_date,
      pageviews:   parseInt(d.pageviews,    10),
      uniqueVisits: parseInt(d.unique_visits, 10),
      gscClicks:   parseInt(d.gsc_clicks,   10),
      gscImpressions: parseInt(d.gsc_impressions, 10),
    })),
    // Click heat-like: elementos más clicados en esta página
    topClicks: clickAgg.map(c => ({
      tag:        c.element_tag,
      text:       c.element_text,
      elementId:  c.element_id,
      clicks:     parseInt(c.clicks, 10),
    })),
    // Métricas de video
    videoMetrics: videoAgg.map(v => ({
      action:         v.action,
      src:            v.src,
      count:          parseInt(v.count, 10),
      avgPositionSec: v.avg_position_sec ? parseFloat(v.avg_position_sec) : null,
    })),
    // Links externos desde esta página
    outboundLinks: outboundAgg.map(o => ({
      href:   o.href,
      text:   o.text,
      clicks: parseInt(o.clicks, 10),
    })),
    // De dónde viene el tráfico a esta página
    sources: pageSources.map(s => ({
      source:   s.source,
      medium:   s.medium,
      sessions: parseInt(s.sessions, 10),
    })),
    // Keywords que llevan a esta página según GSC
    keywords: gscKeywords.map(k => ({
      query:       k.query,
      clicks:      parseInt(k.clicks, 10),
      impressions: parseInt(k.impressions, 10),
      ctr:         parseFloat(k.ctr),
      position:    parseFloat(k.position),
    })),
    // Recomendaciones IA activas para esta página
    recommendations: aiRecs.map(r => ({
      id:          parseInt(r.id, 10),
      title:       r.title,
      priority:    r.priority,
      category:    r.category,
      description: r.description,
      action:      r.action,
    })),
    // Tipos de JSON-LD detectados en la página
    structuredData: schemaHistory.map(s => ({
      type:        s.schema_type,
      occurrences: parseInt(s.occurrences, 10),
    })),
  })
}
