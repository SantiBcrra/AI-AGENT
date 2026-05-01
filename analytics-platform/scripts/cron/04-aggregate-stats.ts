#!/usr/bin/env tsx
// ============================================================
// CRON 04 — Agregación de estadísticas diarias
// Horario: cada hora (0 * * * *)
// Qué hace:
//   - Corre aggregate_daily_stats() para el día anterior
//   - Detecta caídas de tráfico y genera alertas
//   - Actualiza page_stats_daily con datos de GSC
// ============================================================

import 'dotenv/config'
import { query, queryOne } from '@/lib/db'

const log = (msg: string) => console.log(`[STATS] ${new Date().toISOString()} ${msg}`)

// ── Detectar anomalías y generar alertas ──────────────────

async function detectAnomalies(siteId: number, domain: string, statDate: string) {
  // Comparar visitas de hoy vs promedio de los últimos 7 días
  const comparison = await queryOne<{
    today_visits:   string
    avg_7d_visits:  string
    change_pct:     string
  }>(`
    WITH today AS (
      SELECT COALESCE(SUM(unique_visits), 0) AS visits
      FROM page_stats_daily
      WHERE site_id = $1 AND stat_date = $2
    ),
    last7 AS (
      SELECT COALESCE(AVG(daily_total), 0) AS avg_visits
      FROM (
        SELECT stat_date, SUM(unique_visits) AS daily_total
        FROM page_stats_daily
        WHERE site_id = $1
          AND stat_date BETWEEN $2::DATE - 8 AND $2::DATE - 1
        GROUP BY stat_date
      ) sub
    )
    SELECT
      today.visits                                          AS today_visits,
      ROUND(last7.avg_visits)                               AS avg_7d_visits,
      CASE WHEN last7.avg_visits > 0
        THEN ROUND(((today.visits - last7.avg_visits) / last7.avg_visits) * 100, 1)
        ELSE 0
      END                                                   AS change_pct
    FROM today, last7
  `, [siteId, statDate])

  if (!comparison) return

  const todayVisits = parseInt(comparison.today_visits, 10)
  const avgVisits   = parseInt(comparison.avg_7d_visits, 10)
  const changePct   = parseFloat(comparison.change_pct)

  // Alerta de caída: > 20% menos que el promedio de 7 días
  if (changePct <= -20 && avgVisits > 50) {
    await query(`
      INSERT INTO system_alerts (
        site_id, alert_type, severity, title, message,
        threshold_value, actual_value, change_pct, context_data
      ) VALUES ($1, 'traffic_drop', $2, $3, $4, $5, $6, $7, $8)
    `, [
      siteId,
      changePct <= -50 ? 'critical' : changePct <= -30 ? 'high' : 'medium',
      `Caída de tráfico: ${Math.abs(changePct).toFixed(0)}% menos que el promedio`,
      `${domain} tuvo ${todayVisits} visitas el ${statDate}, un ${Math.abs(changePct).toFixed(1)}% menos que el promedio de 7 días (${avgVisits})`,
      -20,   // umbral
      changePct,
      changePct,
      JSON.stringify({ statDate, todayVisits, avgVisits }),
    ])
    log(`  ⚠ ${domain}: traffic drop ${changePct}%`)
  }

  // Alerta de pico inusual: > 100% más que el promedio
  if (changePct >= 100 && avgVisits > 10) {
    await query(`
      INSERT INTO system_alerts (
        site_id, alert_type, severity, title, message,
        threshold_value, actual_value, change_pct, context_data
      ) VALUES ($1, 'traffic_spike', 'info', $2, $3, 100, $4, $4, $5)
    `, [
      siteId,
      `Pico de tráfico: +${changePct.toFixed(0)}% sobre el promedio`,
      `${domain} tuvo ${todayVisits} visitas el ${statDate}, un +${changePct.toFixed(1)}% sobre el promedio (${avgVisits})`,
      changePct,
      JSON.stringify({ statDate, todayVisits, avgVisits }),
    ])
    log(`  📈 ${domain}: traffic spike +${changePct}%`)
  }
}

// ── Actualizar page_stats_daily con datos GSC ─────────────

async function mergeGscData(siteId: number, statDate: string) {
  // Unir clicks/impresiones de GSC con las stats diarias por URL/path
  await query(`
    UPDATE page_stats_daily psd
    SET
      gsc_clicks      = g.clicks,
      gsc_impressions = g.impressions,
      gsc_ctr         = g.ctr,
      gsc_position    = g.position
    FROM (
      SELECT
        page,
        SUM(clicks)      AS clicks,
        SUM(impressions) AS impressions,
        AVG(ctr)         AS ctr,
        AVG(position)    AS position
      FROM gsc_performance
      WHERE site_id = $1
        AND stat_date = $2
        AND page IS NOT NULL
        AND query IS NULL
      GROUP BY page
    ) g
    JOIN pages p ON p.site_id = $1
      AND (p.path = replace(g.page, 'https://' || (
        SELECT domain FROM sites WHERE id = $1
      ), ''))
    WHERE psd.site_id = $1
      AND psd.stat_date = $2
      AND psd.page_id = p.id
  `, [siteId, statDate])
}

// ── Runner principal ───────────────────────────────────────

async function main() {
  log('=== Starting stats aggregation ===')

  const sites = await query<{ id: number; domain: string }>(`
    SELECT id, domain FROM sites WHERE is_active = true
  `)

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const statDate = yesterday.toISOString().slice(0, 10)

  log(`Aggregating stats for ${statDate} (${sites.length} sites)`)

  for (const site of sites) {
    try {
      // Correr función de agregación en BD
      await query('SELECT aggregate_daily_stats($1, $2)', [site.id, statDate])
      log(`  ✓ ${site.domain} aggregated`)

      // Unir con datos de GSC
      await mergeGscData(site.id, statDate)
      log(`  ✓ ${site.domain} GSC data merged`)

      // Detectar anomalías
      await detectAnomalies(site.id, site.domain, statDate)

    } catch (err) {
      log(`  ✗ ${site.domain}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  log('=== Stats aggregation completed ===')
  process.exit(0)
}

main().catch(err => {
  console.error('[STATS] Fatal error:', err)
  process.exit(1)
})
