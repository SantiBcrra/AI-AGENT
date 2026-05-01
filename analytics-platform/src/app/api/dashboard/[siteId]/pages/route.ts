// ============================================================
// GET /api/dashboard/[siteId]/pages
//
// Devuelve analíticas por página: tráfico, engagement, GSC, score.
//
// Parámetros:
//   ?range=7d|28d|90d   — período (default: 28d)
//   ?sort=views|bounce|ctr|duration|score  — ordenamiento (default: views)
//   ?limit=50           — máximo de páginas (default: 50, max: 200)
//   ?offset=0           — para paginación
//   ?search=texto       — filtrar por path o título
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 })
  }

  const sp     = req.nextUrl.searchParams
  const range  = sp.get('range') ?? '28d'
  const sort   = sp.get('sort')  ?? 'views'
  const limit  = Math.min(200, parseInt(sp.get('limit')  ?? '50',  10) || 50)
  const offset =              parseInt(sp.get('offset') ?? '0',   10) || 0
  const search = sp.get('search')?.trim() ?? ''

  const days = range === '7d' ? 7 : range === '90d' ? 90 : 28

  // Validar sort
  const VALID_SORTS: Record<string, string> = {
    views:    'pageviews DESC',
    bounce:   'bounce_rate DESC',
    ctr:      'gsc_ctr DESC',
    duration: 'avg_duration_sec DESC',
    score:    'engagement_score DESC',
    position: 'gsc_position ASC NULLS LAST',
  }
  const orderBy = VALID_SORTS[sort] ?? VALID_SORTS.views

  // ── Query principal: métricas por página ─────────────────
  // Suma sobre el rango solicitado + computa engagement_score
  const pages = await query<{
    page_id:           string
    path:              string
    title:             string | null
    pageviews:         string
    unique_visits:     string
    sessions:          string
    bounces:           string
    bounce_rate:       string
    avg_duration_sec:  string
    avg_scroll_pct:    string
    interactions:      string
    desktop_visits:    string
    mobile_visits:     string
    tablet_visits:     string
    gsc_clicks:        string
    gsc_impressions:   string
    gsc_ctr:           string
    gsc_position:      string
    engagement_score:  string
    first_seen_at:     string
    last_seen_at:      string
  }>(`
    WITH page_agg AS (
      SELECT
        p.id                               AS page_id,
        p.path,
        p.title,
        p.first_seen_at,
        p.last_seen_at,
        COALESCE(SUM(psd.pageviews),    0)               AS pageviews,
        COALESCE(SUM(psd.unique_visits),0)               AS unique_visits,
        COALESCE(SUM(psd.sessions),     0)               AS sessions,
        COALESCE(SUM(psd.bounces),      0)               AS bounces,
        COALESCE(SUM(psd.interactions), 0)               AS interactions,
        COALESCE(SUM(psd.desktop_visits),0)              AS desktop_visits,
        COALESCE(SUM(psd.mobile_visits), 0)              AS mobile_visits,
        COALESCE(SUM(psd.tablet_visits), 0)              AS tablet_visits,
        COALESCE(SUM(psd.gsc_clicks),        0)          AS gsc_clicks,
        COALESCE(SUM(psd.gsc_impressions),   0)          AS gsc_impressions,
        CASE WHEN SUM(psd.gsc_impressions) > 0
          THEN ROUND(SUM(psd.gsc_clicks)::NUMERIC / SUM(psd.gsc_impressions), 4)
          ELSE 0
        END                                              AS gsc_ctr,
        CASE WHEN COUNT(psd.gsc_position) > 0
          THEN ROUND(AVG(psd.gsc_position)::NUMERIC, 1)
          ELSE NULL
        END                                              AS gsc_position,
        CASE WHEN SUM(psd.sessions) > 0
          THEN ROUND(AVG(psd.avg_duration_sec)::NUMERIC, 1)
          ELSE 0
        END                                              AS avg_duration_sec,
        CASE WHEN SUM(psd.sessions) > 0
          THEN ROUND(AVG(psd.avg_scroll_depth_pct)::NUMERIC, 1)
          ELSE 0
        END                                              AS avg_scroll_pct
      FROM pages p
      LEFT JOIN page_stats_daily psd
        ON psd.page_id = p.id
       AND psd.site_id = $1
       AND psd.stat_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      WHERE p.site_id = $1
        AND ($3 = '' OR p.path ILIKE '%' || $3 || '%' OR p.title ILIKE '%' || $3 || '%')
      GROUP BY p.id, p.path, p.title, p.first_seen_at, p.last_seen_at
    )
    SELECT
      *,
      -- Bounce rate: porcentaje de sesiones de 1 página
      CASE WHEN sessions > 0
        THEN ROUND((bounces::NUMERIC / sessions) * 100, 1)
        ELSE 0
      END AS bounce_rate,
      -- Engagement score (0-100):
      --   30% peso → tasa de no-rebote
      --   25% peso → tiempo (máx 3 min = 180 seg)
      --   20% peso → scroll depth (de avg_scroll_pct)
      --   15% peso → CTR orgánico (max 10%)
      --   10% peso → interacciones (max 5 por sesión)
      ROUND(
        CASE WHEN sessions > 0 THEN
          LEAST(1.0, (1.0 - COALESCE(bounces::NUMERIC / NULLIF(sessions,0), 0))) * 30
          + LEAST(1.0, COALESCE(avg_duration_sec / 180.0, 0))                    * 25
          + LEAST(1.0, COALESCE(avg_scroll_pct   / 100.0, 0))                    * 20
          + LEAST(1.0, COALESCE(gsc_ctr          / 0.10,  0))                    * 15
          + LEAST(1.0, COALESCE(interactions::NUMERIC / NULLIF(sessions,0) / 5, 0)) * 10
        ELSE 0
        END
      , 1) AS engagement_score
    FROM page_agg
    WHERE pageviews > 0 OR gsc_impressions > 0
    ORDER BY ${orderBy}
    LIMIT $4
    OFFSET $5
  `, [siteId, days, search, limit, offset])

  // Totales para paginación
  const totals = await queryOne<{ total: string; total_pageviews: string }>(`
    SELECT
      COUNT(DISTINCT p.id)          AS total,
      COALESCE(SUM(psd.pageviews),0) AS total_pageviews
    FROM pages p
    LEFT JOIN page_stats_daily psd
      ON psd.page_id = p.id AND psd.site_id = $1
      AND psd.stat_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
    WHERE p.site_id = $1
      AND ($3 = '' OR p.path ILIKE '%' || $3 || '%' OR p.title ILIKE '%' || $3 || '%')
  `, [siteId, days, search])

  return NextResponse.json({
    pages: pages.map(p => ({
      pageId:         parseInt(p.page_id, 10),
      path:           p.path,
      title:          p.title,
      firstSeenAt:    p.first_seen_at,
      lastSeenAt:     p.last_seen_at,
      traffic: {
        pageviews:     parseInt(p.pageviews, 10),
        uniqueVisits:  parseInt(p.unique_visits, 10),
        sessions:      parseInt(p.sessions, 10),
        bounceRate:    parseFloat(p.bounce_rate),
        avgDurationSec: parseFloat(p.avg_duration_sec),
        avgScrollPct:  parseFloat(p.avg_scroll_pct),
        interactions:  parseInt(p.interactions, 10),
      },
      devices: {
        desktop: parseInt(p.desktop_visits, 10),
        mobile:  parseInt(p.mobile_visits, 10),
        tablet:  parseInt(p.tablet_visits, 10),
      },
      gsc: {
        clicks:      parseInt(p.gsc_clicks, 10),
        impressions: parseInt(p.gsc_impressions, 10),
        ctr:         parseFloat(p.gsc_ctr),
        position:    p.gsc_position ? parseFloat(p.gsc_position) : null,
      },
      engagementScore: parseFloat(p.engagement_score),
    })),
    meta: {
      total:          parseInt(totals?.total ?? '0', 10),
      totalPageviews: parseInt(totals?.total_pageviews ?? '0', 10),
      range,
      sort,
      limit,
      offset,
    },
  })
}
