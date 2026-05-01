// ============================================================
// ANALYSIS ENGINE
// Consumes PostgreSQL data and computes per-page metrics
// that feed the Diagnostic and Decision engines.
// ============================================================

import { query, queryOne } from '@/lib/db'
import type { PageMetrics, SiteMetrics } from '../types'
import { THRESHOLDS } from '../types'

const log = (msg: string) => console.log(`[Analysis] ${new Date().toISOString()} ${msg}`)

// ── Per-page metrics over a rolling window ─────────────────

export async function getPageMetrics(
  siteId: number,
  periodDays = 28,
): Promise<PageMetrics[]> {
  const rows = await query<{
    path: string
    title: string | null
    unique_visits: string
    sessions: string
    bounces: string
    bounce_rate: string
    avg_duration_sec: string
    avg_scroll_depth_pct: string
    interactions: string
    cta_clicks: string
    cta_click_rate: string
    exit_rate: string
    gsc_clicks: string
    gsc_impressions: string
    gsc_ctr: string
    gsc_position: string
    underperformance_score: string
  }>(`
    WITH
    -- ── Aggregate page stats from pre-computed daily table ──
    page_agg AS (
      SELECT
        p.path,
        p.title,
        SUM(psd.unique_visits)                                          AS unique_visits,
        SUM(psd.sessions)                                               AS sessions,
        SUM(psd.bounces)                                                AS bounces,
        CASE WHEN SUM(psd.sessions) > 0
          THEN ROUND(SUM(psd.bounces)::NUMERIC / SUM(psd.sessions) * 100, 1)
          ELSE 0 END                                                    AS bounce_rate,
        ROUND(AVG(psd.avg_duration_sec)::NUMERIC, 1)                   AS avg_duration_sec,
        ROUND(AVG(psd.avg_scroll_depth_pct)::NUMERIC, 1)              AS avg_scroll_depth_pct,
        SUM(psd.interactions)                                           AS interactions,
        SUM(psd.exits)                                                  AS exits,
        CASE WHEN SUM(psd.sessions) > 0
          THEN ROUND(SUM(psd.exits)::NUMERIC / SUM(psd.sessions) * 100, 1)
          ELSE 0 END                                                    AS exit_rate,

        -- GSC metrics (summed/averaged)
        SUM(psd.gsc_clicks)                                             AS gsc_clicks,
        SUM(psd.gsc_impressions)                                        AS gsc_impressions,
        CASE WHEN SUM(psd.gsc_impressions) > 0
          THEN ROUND(SUM(psd.gsc_clicks)::NUMERIC / SUM(psd.gsc_impressions), 4)
          ELSE 0 END                                                    AS gsc_ctr,
        ROUND(AVG(NULLIF(psd.gsc_position, 0))::NUMERIC, 1)           AS gsc_position
      FROM pages p
      JOIN page_stats_daily psd ON psd.page_id = p.id AND psd.site_id = $1
      WHERE p.site_id = $1
        AND psd.stat_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY p.path, p.title
      HAVING SUM(psd.unique_visits) >= $3
    ),

    -- ── CTA click events ─────────────────────────────────────
    cta_events AS (
      SELECT
        e.path,
        COUNT(*)                                                         AS cta_clicks,
        COUNT(*) FILTER (WHERE e.event_type = 'pageview')               AS pageviews
      FROM events e
      WHERE e.site_id = $1
        AND e.created_at >= NOW() - ($2 || ' days')::INTERVAL
        AND (
          -- Clicks on elements that look like CTAs
          (e.event_type = 'click'
           AND (
             (e.properties->>'element') ILIKE '%btn%'
             OR (e.properties->>'element') ILIKE '%cta%'
             OR (e.properties->>'element') ILIKE '%button%'
             OR (e.properties->>'text') ILIKE '%compra%'
             OR (e.properties->>'text') ILIKE '%contac%'
             OR (e.properties->>'text') ILIKE '%reserv%'
             OR (e.properties->>'text') ILIKE '%registr%'
             OR (e.properties->>'text') ILIKE '%suscrib%'
             OR (e.properties->>'text') ILIKE '%get started%'
             OR (e.properties->>'text') ILIKE '%sign up%'
             OR (e.properties->>'text') ILIKE '%buy%'
             OR (e.properties->>'text') ILIKE '%order%'
           ))
          OR e.event_type = 'conversion'
          OR e.event_type = 'form_submit'
        )
      GROUP BY e.path
    )

    SELECT
      pa.*,
      COALESCE(ce.cta_clicks, 0)                                        AS cta_clicks,
      CASE
        WHEN pa.sessions > 0 AND ce.cta_clicks IS NOT NULL
        THEN ROUND(ce.cta_clicks::NUMERIC / pa.sessions, 4)
        ELSE 0
      END                                                               AS cta_click_rate,

      -- Underperformance score (higher = needs more attention)
      ROUND(
          -- High bounce penalization
          CASE WHEN pa.bounce_rate > 80 THEN 35
               WHEN pa.bounce_rate > 65 THEN 20
               WHEN pa.bounce_rate > 50 THEN 10
               ELSE 0 END
          -- Low engagement penalization
        + CASE WHEN pa.avg_duration_sec < 15 THEN 25
               WHEN pa.avg_duration_sec < 30 THEN 15
               WHEN pa.avg_duration_sec < 60 THEN 8
               ELSE 0 END
          -- Low CTR penalization (only if enough impressions)
        + CASE
            WHEN pa.gsc_impressions >= $4 AND pa.gsc_ctr < 0.005 THEN 25
            WHEN pa.gsc_impressions >= $4 AND pa.gsc_ctr < 0.02  THEN 15
            WHEN pa.gsc_impressions >= 20  AND pa.gsc_ctr < 0.03 THEN 8
            ELSE 0
          END
          -- Low scroll penalization
        + CASE WHEN pa.avg_scroll_depth_pct < 20 THEN 15
               WHEN pa.avg_scroll_depth_pct < 35 THEN 8
               ELSE 0 END
      , 0) AS underperformance_score

    FROM page_agg pa
    LEFT JOIN cta_events ce ON ce.path = pa.path
    ORDER BY underperformance_score DESC, pa.gsc_impressions DESC
    LIMIT 50
  `, [siteId, periodDays, THRESHOLDS.MIN_VISITS_FOR_ANALYSIS, THRESHOLDS.MIN_IMPRESSIONS_FOR_CTR])

  return rows.map(r => ({
    path: r.path,
    title: r.title,
    ghlPageId: null,               // filled in by orchestrator from ghl_pages cache

    uniqueVisits: parseInt(r.unique_visits, 10),
    sessions: parseInt(r.sessions, 10),
    bounces: parseInt(r.bounces, 10),
    bounceRate: parseFloat(r.bounce_rate),

    avgDurationSec: parseFloat(r.avg_duration_sec),
    avgScrollDepthPct: parseFloat(r.avg_scroll_depth_pct),
    interactions: parseInt(r.interactions, 10),

    ctaClicks: parseInt(r.cta_clicks, 10),
    ctaClickRate: parseFloat(r.cta_click_rate),

    funnelDropOffRate: 0,          // computed separately for funnel pages
    exitRate: parseFloat(r.exit_rate),

    gscClicks: parseInt(r.gsc_clicks, 10),
    gscImpressions: parseInt(r.gsc_impressions, 10),
    gscCtr: parseFloat(r.gsc_ctr),
    gscPosition: parseFloat(r.gsc_position),

    hasSchema: false,              // filled in by schema detector
    schemaTypes: [],

    underperformanceScore: parseFloat(r.underperformance_score),
  }))
}

// ── Funnel drop-off analysis ───────────────────────────────

export async function getFunnelDropOff(
  siteId: number,
  periodDays = 28,
): Promise<Map<string, number>> {
  // Returns a map of path → drop-off rate for pages in a funnel sequence
  const rows = await query<{ path: string; drop_off_rate: string }>(`
    WITH funnel_paths AS (
      SELECT
        e.path,
        s.id AS session_id,
        ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY e.created_at) AS step
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.site_id = $1
        AND s.is_bot = false
        AND e.event_type = 'pageview'
        AND e.created_at >= NOW() - ($2 || ' days')::INTERVAL
    ),
    step_counts AS (
      SELECT
        path,
        step,
        COUNT(DISTINCT session_id) AS visits
      FROM funnel_paths
      GROUP BY path, step
    ),
    path_total AS (
      SELECT path, SUM(visits) AS total_entries
      FROM step_counts
      GROUP BY path
    ),
    path_exits AS (
      -- Sessions that had this page as their last page
      SELECT e.path, COUNT(DISTINCT s.id) AS exits
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.site_id = $1
        AND s.is_bot = false
        AND e.event_type IN ('exit', 'pageview')
        AND s.pages_visited > 1               -- exclude bounces
        AND e.created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY e.path
    )
    SELECT
      pt.path,
      CASE WHEN pt.total_entries > 0
        THEN ROUND(COALESCE(pe.exits, 0)::NUMERIC / pt.total_entries * 100, 1)
        ELSE 0
      END AS drop_off_rate
    FROM path_total pt
    LEFT JOIN path_exits pe ON pe.path = pt.path
    WHERE pt.total_entries >= $3
    ORDER BY drop_off_rate DESC
  `, [siteId, periodDays, THRESHOLDS.MIN_VISITS_FOR_ANALYSIS])

  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.path, parseFloat(r.drop_off_rate))
  }
  return map
}

// ── Schema detection: which pages already have JSON-LD ────

export async function detectExistingSchemas(
  siteId: number,
): Promise<Map<string, string[]>> {
  // Check the head_code of cached GHL pages for JSON-LD schemas
  const rows = await query<{ path: string; head_code: string | null; body_code: string | null }>(`
    SELECT path, head_code, body_code
    FROM ghl_pages
    WHERE site_id = $1 AND is_active = true AND path IS NOT NULL
  `, [siteId])

  const schemaMap = new Map<string, string[]>()

  for (const row of rows) {
    const combined = (row.head_code ?? '') + (row.body_code ?? '')
    const types: string[] = []

    // Extract @type values from JSON-LD blocks
    const matches = combined.matchAll(/"@type"\s*:\s*"([^"]+)"/g)
    for (const m of matches) {
      if (!types.includes(m[1])) types.push(m[1])
    }

    if (row.path) {
      schemaMap.set(row.path, types)
    }
  }

  return schemaMap
}

// ── Site-level aggregate metrics ──────────────────────────

export async function getSiteMetrics(
  siteId: number,
  domain: string,
  periodDays = 28,
): Promise<SiteMetrics> {
  const pageMetrics = await getPageMetrics(siteId, periodDays)
  const funnelDropOffs = await getFunnelDropOff(siteId, periodDays)
  const schemaMap = await detectExistingSchemas(siteId)

  // Enrich page metrics with funnel and schema data
  for (const pm of pageMetrics) {
    pm.funnelDropOffRate = funnelDropOffs.get(pm.path) ?? 0
    const schemas = schemaMap.get(pm.path) ?? []
    pm.hasSchema = schemas.length > 0
    pm.schemaTypes = schemas
  }

  // Site-level aggregates
  const siteAgg = await queryOne<{
    total_visits: string
    avg_bounce_rate: string
    avg_scroll_depth: string
    conversion_rate: string
  }>(`
    SELECT
      SUM(psd.unique_visits)                                         AS total_visits,
      ROUND(AVG(psd.avg_scroll_depth_pct)::NUMERIC, 1)             AS avg_scroll_depth,
      CASE WHEN SUM(psd.sessions) > 0
        THEN ROUND(SUM(psd.bounces)::NUMERIC / SUM(psd.sessions) * 100, 1)
        ELSE 0 END                                                   AS avg_bounce_rate,
      -- Conversion rate = sessions with did_convert / total sessions
      COALESCE((
        SELECT ROUND(
          COUNT(*) FILTER (WHERE s2.did_convert) * 100.0
          / NULLIF(COUNT(*), 0), 2
        )
        FROM sessions s2
        WHERE s2.site_id = $1
          AND s2.is_bot = false
          AND s2.started_at >= NOW() - ($2 || ' days')::INTERVAL
      ), 0)                                                          AS conversion_rate
    FROM page_stats_daily psd
    JOIN pages p ON p.id = psd.page_id
    WHERE psd.site_id = $1
      AND psd.stat_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
  `, [siteId, periodDays])

  log(`Site ${domain}: ${pageMetrics.length} pages analyzed, top score=${pageMetrics[0]?.underperformanceScore ?? 0}`)

  return {
    siteId,
    domain,
    periodDays,
    totalVisits: parseInt(siteAgg?.total_visits ?? '0', 10),
    avgBounceRate: parseFloat(siteAgg?.avg_bounce_rate ?? '0'),
    avgEngagementScore: 0,        // computed in diagnostics
    avgScrollDepth: parseFloat(siteAgg?.avg_scroll_depth ?? '0'),
    conversionRate: parseFloat(siteAgg?.conversion_rate ?? '0'),
    topUnderperformingPages: pageMetrics.slice(0, 10),
  }
}

// ── Snapshot a single page's current metric (for learning loop) ──

export async function getPageCurrentMetric(
  siteId: number,
  path: string,
  metric: string,
  periodDays = 14,
): Promise<number> {
  const row = await queryOne<{ value: string }>(`
    SELECT
      CASE $3::TEXT
        WHEN 'gsc_ctr'
          THEN ROUND(SUM(gsc_clicks)::NUMERIC / NULLIF(SUM(gsc_impressions), 0), 4)::TEXT
        WHEN 'bounce_rate'
          THEN ROUND(SUM(bounces)::NUMERIC / NULLIF(SUM(sessions), 0) * 100, 1)::TEXT
        WHEN 'avg_duration_sec'
          THEN ROUND(AVG(avg_duration_sec)::NUMERIC, 1)::TEXT
        WHEN 'avg_scroll_depth_pct'
          THEN ROUND(AVG(avg_scroll_depth_pct)::NUMERIC, 1)::TEXT
        WHEN 'unique_visits'
          THEN SUM(unique_visits)::TEXT
        ELSE '0'
      END AS value
    FROM page_stats_daily psd
    JOIN pages p ON p.id = psd.page_id AND p.path = $2
    WHERE psd.site_id = $1
      AND psd.stat_date >= CURRENT_DATE - ($4 || ' days')::INTERVAL
  `, [siteId, path, metric, periodDays])

  return parseFloat(row?.value ?? '0')
}
