#!/usr/bin/env tsx
// ============================================================
// CRON 01 — Colección de datos GSC
// Horario: diario a las 02:00
// Qué hace:
//   - Descarga performance de los últimos 3 días (GSC tiene ~2 días de delay)
//   - Inserta/actualiza gsc_performance (queries, páginas, países, dispositivos)
//   - Actualiza gsc_keywords con cálculo de oportunidades
//   - Actualiza sitemaps
// ============================================================

import 'dotenv/config'
import { getActiveSites, fetchPerformance, fetchSitemaps } from '@/lib/gsc/client'
import { withTransaction, query } from '@/lib/db'
import type { PoolClient } from 'pg'

const log = (msg: string) => console.log(`[GSC] ${new Date().toISOString()} ${msg}`)

// ── Fechas: últimos 3 días (GSC tarda ~2 días en consolidar) ─

function getDateRange(daysBack = 3): { start: string; end: string } {
  const end   = new Date()
  end.setDate(end.getDate() - 1)  // ayer
  const start = new Date(end)
  start.setDate(start.getDate() - daysBack)

  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

// ── Colectar performance para un sitio ────────────────────

async function collectPerformance(siteId: number, gscSite: any) {
  const { start, end } = getDateRange(3)
  log(`  [${gscSite.domain}] Fetching performance ${start} → ${end}`)

  // Dimensiones a recolectar en paralelo
  const [
    byDate,           // total por día (para el gráfico)
    byQueryPage,      // query + page (para keywords y top pages)
    byCountry,        // por país
    byDevice,         // por dispositivo
  ] = await Promise.all([
    fetchPerformance(gscSite, { startDate: start, endDate: end, dimensions: ['date'] }),
    fetchPerformance(gscSite, {
      startDate: start, endDate: end,
      dimensions: ['query', 'page'],
      rowLimit: 25000,
    }),
    fetchPerformance(gscSite, { startDate: start, endDate: end, dimensions: ['country'] }),
    fetchPerformance(gscSite, { startDate: start, endDate: end, dimensions: ['device'] }),
  ])

  log(`  [${gscSite.domain}] Rows: date=${byDate.length} queryPage=${byQueryPage.length} country=${byCountry.length}`)

  await withTransaction(async (client: PoolClient) => {
    // ── Insertar totales por día ─────────────────────────
    for (const row of byDate) {
      await client.query(`
        INSERT INTO gsc_performance (site_id, stat_date, clicks, impressions, ctr, position)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (site_id, stat_date, query, page, country, device, search_type)
        DO UPDATE SET
          clicks      = EXCLUDED.clicks,
          impressions = EXCLUDED.impressions,
          ctr         = EXCLUDED.ctr,
          position    = EXCLUDED.position,
          fetched_at  = NOW()
      `, [siteId, row.keys[0], row.clicks, row.impressions, row.ctr, row.position])
    }

    // ── Insertar por query + page ────────────────────────
    for (const row of byQueryPage) {
      const [q, page] = row.keys
      await client.query(`
        INSERT INTO gsc_performance
          (site_id, stat_date, query, page, clicks, impressions, ctr, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (site_id, stat_date, query, page, country, device, search_type)
        DO UPDATE SET
          clicks      = EXCLUDED.clicks,
          impressions = EXCLUDED.impressions,
          ctr         = EXCLUDED.ctr,
          position    = EXCLUDED.position,
          fetched_at  = NOW()
      `, [siteId, end, q, page, row.clicks, row.impressions, row.ctr, row.position])
    }

    // ── Insertar por país ────────────────────────────────
    for (const row of byCountry) {
      await client.query(`
        INSERT INTO gsc_performance
          (site_id, stat_date, country, clicks, impressions, ctr, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (site_id, stat_date, query, page, country, device, search_type)
        DO UPDATE SET
          clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
          ctr = EXCLUDED.ctr, position = EXCLUDED.position, fetched_at = NOW()
      `, [siteId, end, row.keys[0], row.clicks, row.impressions, row.ctr, row.position])
    }

    // ── Insertar por dispositivo ─────────────────────────
    for (const row of byDevice) {
      await client.query(`
        INSERT INTO gsc_performance
          (site_id, stat_date, device, clicks, impressions, ctr, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (site_id, stat_date, query, page, country, device, search_type)
        DO UPDATE SET
          clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
          ctr = EXCLUDED.ctr, position = EXCLUDED.position, fetched_at = NOW()
      `, [siteId, end, row.keys[0], row.clicks, row.impressions, row.ctr, row.position])
    }
  })

  log(`  [${gscSite.domain}] Performance saved ✓`)
}

// ── Actualizar tabla de keywords con agregados y oportunidades ─

async function updateKeywords(siteId: number, domain: string) {
  log(`  [${domain}] Updating keywords...`)

  // Calcular agregados de los últimos 28 días
  const rows = await query<{
    query: string; clicks: string; impressions: string; ctr: string; position: string;
    prev_clicks: string; prev_impressions: string;
  }>(`
    WITH current AS (
      SELECT query,
        SUM(clicks)      AS clicks,
        SUM(impressions) AS impressions,
        AVG(ctr)         AS ctr,
        AVG(position)    AS position
      FROM gsc_performance
      WHERE site_id = $1
        AND query IS NOT NULL
        AND stat_date >= CURRENT_DATE - 28
      GROUP BY query
    ),
    previous AS (
      SELECT query,
        SUM(clicks) AS prev_clicks,
        SUM(impressions) AS prev_impressions
      FROM gsc_performance
      WHERE site_id = $1
        AND query IS NOT NULL
        AND stat_date BETWEEN CURRENT_DATE - 56 AND CURRENT_DATE - 29
      GROUP BY query
    )
    SELECT c.*, COALESCE(p.prev_clicks, 0) AS prev_clicks,
           COALESCE(p.prev_impressions, 0) AS prev_impressions
    FROM current c
    LEFT JOIN previous p USING (query)
    ORDER BY clicks DESC
    LIMIT 5000
  `, [siteId])

  log(`  [${domain}] Upserting ${rows.length} keywords`)

  for (const row of rows) {
    const clicks      = parseInt(row.clicks, 10)
    const impressions = parseInt(row.impressions, 10)
    const prevClicks  = parseInt(row.prev_clicks, 10)
    const ctr         = parseFloat(row.ctr)
    const position    = parseFloat(row.position)
    const clicksDelta = clicks - prevClicks

    // Tendencia
    let trend: string
    if (prevClicks === 0 && clicks > 0) trend = 'new'
    else if (clicks === 0 && prevClicks > 0) trend = 'lost'
    else if (clicksDelta > prevClicks * 0.1) trend = 'up'
    else if (clicksDelta < -prevClicks * 0.1) trend = 'down'
    else trend = 'stable'

    // Tipo de oportunidad
    let oppType: string | null = null
    if (trend === 'lost') oppType = 'lost'
    else if (trend === 'new') oppType = 'new_opportunity'
    else if (position >= 4 && position <= 10 && ctr < 0.05) oppType = 'quick_win'
    else if (impressions > 1000 && ctr < 0.02) oppType = 'high_volume'
    else if (impressions > 100 && position > 10) oppType = 'long_tail'

    // Score de oportunidad (llamada a función en BD)
    const scoreRow = await query<{ score: string }>(`
      SELECT calc_keyword_opportunity($1, $2, $3, $4) AS score
    `, [position, ctr, impressions, trend])

    const oppScore = parseInt(scoreRow[0]?.score ?? '0', 10)

    await query(`
      INSERT INTO gsc_keywords
        (site_id, query, total_clicks, total_impressions, avg_ctr, avg_position,
         clicks_delta, trend, opportunity_score, opportunity_type, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (site_id, query) DO UPDATE SET
        total_clicks      = EXCLUDED.total_clicks,
        total_impressions = EXCLUDED.total_impressions,
        avg_ctr           = EXCLUDED.avg_ctr,
        avg_position      = EXCLUDED.avg_position,
        clicks_delta      = EXCLUDED.clicks_delta,
        trend             = EXCLUDED.trend,
        opportunity_score = EXCLUDED.opportunity_score,
        opportunity_type  = EXCLUDED.opportunity_type,
        last_updated      = NOW()
    `, [
      siteId, row.query,
      clicks, impressions, ctr, position,
      clicksDelta, trend, oppScore, oppType,
    ])
  }

  log(`  [${domain}] Keywords updated ✓`)
}

// ── Actualizar sitemaps ────────────────────────────────────

async function updateSitemaps(siteId: number, gscSite: any) {
  log(`  [${gscSite.domain}] Fetching sitemaps...`)

  const sitemaps = await fetchSitemaps(gscSite) as any[]

  for (const sm of sitemaps) {
    const errors = sm.errors ?? []

    await query(`
      INSERT INTO gsc_sitemaps
        (site_id, sitemap_url, sitemap_type, status, last_submitted, last_downloaded,
         urls_submitted, urls_indexed, urls_errors, errors, fetched_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (site_id, sitemap_url) DO UPDATE SET
        status          = EXCLUDED.status,
        last_submitted  = EXCLUDED.last_submitted,
        last_downloaded = EXCLUDED.last_downloaded,
        urls_submitted  = EXCLUDED.urls_submitted,
        urls_indexed    = EXCLUDED.urls_indexed,
        urls_errors     = EXCLUDED.urls_errors,
        errors          = EXCLUDED.errors,
        fetched_at      = NOW()
    `, [
      siteId,
      sm.path,
      sm.type ?? 'sitemap',
      errors.length > 0 ? 'error' : 'ok',
      sm.lastSubmitted ? new Date(sm.lastSubmitted) : null,
      sm.lastDownloaded ? new Date(sm.lastDownloaded) : null,
      sm.contents?.[0]?.submitted ?? 0,
      sm.contents?.[0]?.indexed   ?? 0,
      errors.length,
      JSON.stringify(errors),
    ])
  }

  log(`  [${gscSite.domain}] ${sitemaps.length} sitemaps updated ✓`)
}

// ── Runner principal ───────────────────────────────────────

async function main() {
  log('=== Starting GSC collection ===')

  const sites = await getActiveSites()
  log(`Found ${sites.length} active sites`)

  const errors: string[] = []

  for (const site of sites) {
    try {
      log(`Processing ${site.domain}...`)
      await collectPerformance(site.id, site)
      await updateKeywords(site.id, site.domain)
      await updateSitemaps(site.id, site)
      log(`✓ ${site.domain} done`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`✗ ${site.domain} ERROR: ${msg}`)
      errors.push(`${site.domain}: ${msg}`)
    }
  }

  if (errors.length > 0) {
    log(`=== Finished with ${errors.length} error(s) ===`)
    errors.forEach(e => log(`  - ${e}`))
    process.exit(1)
  }

  log('=== GSC collection completed successfully ===')
  process.exit(0)
}

main().catch(err => {
  console.error('[GSC] Fatal error:', err)
  process.exit(1)
})
