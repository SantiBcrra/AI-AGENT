#!/usr/bin/env tsx
// ============================================================
// CRON 05 — Generación de recomendaciones IA con Claude
// Horario: diario a las 05:00
// Qué hace:
//   - Analiza datos de GSC + tráfico propio de los últimos 28 días
//   - Genera recomendaciones priorizadas con Claude (nivel sitio)
//   - Genera recomendaciones por página para las peores páginas
//   - Guarda en ai_recommendations
//   - Genera reporte semanal los lunes
//   - Genera reporte mensual el 1° de cada mes
// ============================================================

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { query, queryOne } from '@/lib/db'

const log = (msg: string) => console.log(`[AI] ${new Date().toISOString()} ${msg}`)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Recopilar contexto del sitio para Claude ──────────────

async function buildSiteContext(siteId: number, domain: string) {
  const [
    trafficSummary,
    topKeywords,
    decliningKeywords,
    richResultIssues,
    sitemapStatus,
    securityIssues,
    urlCoverageProblems,
    recentAlerts,
  ] = await Promise.all([

    // Resumen de tráfico 28d vs 28d anterior
    queryOne<any>(`
      WITH curr AS (
        SELECT COUNT(DISTINCT s.id) AS visits, COUNT(e.id) AS pageviews,
               ROUND(AVG(s.duration_sec::numeric), 0) AS avg_duration,
               COUNT(DISTINCT s.id) FILTER (WHERE s.pages_visited=1)::FLOAT
                 / NULLIF(COUNT(DISTINCT s.id),0) * 100 AS bounce_rate
        FROM sessions s
        LEFT JOIN events e ON e.session_id=s.id AND e.event_type='pageview'
        WHERE s.site_id=$1 AND s.is_bot=false
          AND s.started_at >= NOW()-INTERVAL '28 days'
      ),
      prev AS (
        SELECT COUNT(DISTINCT id) AS visits
        FROM sessions
        WHERE site_id=$1 AND is_bot=false
          AND started_at BETWEEN NOW()-INTERVAL '56 days' AND NOW()-INTERVAL '29 days'
      )
      SELECT curr.*, prev.visits AS prev_visits,
        CASE WHEN prev.visits>0
          THEN ROUND((((curr.visits - prev.visits)::numeric / NULLIF(prev.visits, 0)) * 100), 1)
          ELSE 0 END AS change_pct
      FROM curr, prev
    `, [siteId]),

    // Top 20 keywords con oportunidad
    query<any>(`
      SELECT query, avg_position, avg_ctr, total_impressions, total_clicks,
             opportunity_score, opportunity_type, trend
      FROM gsc_keywords
      WHERE site_id=$1 AND opportunity_score > 30
      ORDER BY opportunity_score DESC LIMIT 20
    `, [siteId]),

    // Keywords en caída
    query<any>(`
      SELECT query, avg_position, total_clicks, clicks_delta, position_delta
      FROM gsc_keywords
      WHERE site_id=$1 AND trend='down' AND clicks_delta < -5
      ORDER BY clicks_delta ASC LIMIT 10
    `, [siteId]),

    // Rich results con errores
    query<any>(`
      SELECT result_type, COUNT(*) FILTER(WHERE status='error') AS errors,
             COUNT(*) FILTER(WHERE status='valid_with_warnings') AS warnings,
             COUNT(*) FILTER(WHERE status='valid') AS valid
      FROM gsc_rich_results WHERE site_id=$1
      GROUP BY result_type HAVING COUNT(*) FILTER(WHERE status IN ('error','valid_with_warnings')) > 0
      ORDER BY errors DESC
    `, [siteId]),

    // Estado de sitemaps
    query<any>(`
      SELECT sitemap_url, status, urls_submitted, urls_indexed, urls_errors
      FROM gsc_sitemaps WHERE site_id=$1
    `, [siteId]),

    // Issues de seguridad
    query<any>(`
      SELECT issue_type, severity, affected_count, description
      FROM gsc_security_issues WHERE site_id=$1 AND status='active'
    `, [siteId]),

    // URLs con problemas de indexación
    query<any>(`
      SELECT coverage_state, COUNT(*) AS count
      FROM gsc_url_inspection
      WHERE site_id=$1
        AND coverage_state NOT IN ('Submitted and indexed','Indexed, not submitted in sitemap')
        AND coverage_state IS NOT NULL
      GROUP BY coverage_state ORDER BY count DESC LIMIT 8
    `, [siteId]),

    // Alertas recientes sin resolver
    query<any>(`
      SELECT alert_type, severity, title, triggered_at
      FROM system_alerts
      WHERE site_id=$1 AND status='active'
      ORDER BY triggered_at DESC LIMIT 10
    `, [siteId]),
  ])

  return {
    trafficSummary,
    topKeywords,
    decliningKeywords,
    richResultIssues,
    sitemapStatus,
    securityIssues,
    urlCoverageProblems,
    recentAlerts,
  }
}

// ── Recopilar páginas con bajo rendimiento ─────────────────

async function buildUnderperformingPages(siteId: number) {
  // Páginas con tráfico real pero malas métricas de engagement
  return query<any>(`
    WITH page_agg AS (
      SELECT
        p.path,
        p.title,
        SUM(psd.unique_visits)                                          AS visits,
        ROUND(AVG(psd.avg_duration_sec)::NUMERIC, 1)                    AS avg_duration_sec,
        ROUND(AVG(psd.avg_scroll_depth_pct)::NUMERIC, 1)               AS avg_scroll_pct,
        CASE WHEN SUM(psd.sessions) > 0
          THEN ROUND(SUM(psd.bounces)::NUMERIC / SUM(psd.sessions) * 100, 1)
          ELSE 0
        END                                                             AS bounce_rate,
        CASE WHEN SUM(psd.gsc_impressions) > 0
          THEN ROUND(SUM(psd.gsc_clicks)::NUMERIC / SUM(psd.gsc_impressions), 4)
          ELSE 0
        END                                                             AS gsc_ctr,
        ROUND(AVG(NULLIF(psd.gsc_position, 0))::NUMERIC, 1)           AS gsc_position,
        SUM(psd.gsc_impressions)                                        AS gsc_impressions
      FROM pages p
      JOIN page_stats_daily psd ON psd.page_id = p.id AND psd.site_id = $1
      WHERE p.site_id = $1
        AND psd.stat_date >= CURRENT_DATE - INTERVAL '28 days'
      GROUP BY p.path, p.title
      HAVING SUM(psd.unique_visits) >= 20
    )
    SELECT *,
      -- Score: mayor es peor (más candidato a recibir recomendación)
      ROUND((
        CASE WHEN bounce_rate > 70 THEN 30 WHEN bounce_rate > 50 THEN 15 ELSE 0 END
        + CASE WHEN avg_duration_sec < 30 THEN 25 WHEN avg_duration_sec < 60 THEN 10 ELSE 0 END
        + CASE WHEN gsc_ctr < 0.01 AND gsc_impressions > 100 THEN 25
               WHEN gsc_ctr < 0.03 AND gsc_impressions > 50  THEN 10 ELSE 0 END
        + CASE WHEN avg_scroll_pct < 25 THEN 20 WHEN avg_scroll_pct < 40 THEN 10 ELSE 0 END
      )::numeric, 0) AS underperformance_score
    FROM page_agg
    ORDER BY underperformance_score DESC, gsc_impressions DESC
    LIMIT 10
  `, [siteId])
}

// ── Generar recomendaciones con Claude ─────────────────────

async function generateRecommendations(siteId: number, domain: string) {
  log(`  [${domain}] Building context...`)
  const ctx = await buildSiteContext(siteId, domain)

  const prompt = `Eres un experto en SEO y analytics. Analiza los siguientes datos de "${domain}" y genera recomendaciones accionables priorizadas.

## DATOS DEL SITIO (últimos 28 días)

### Tráfico
${JSON.stringify(ctx.trafficSummary, null, 2)}

### Keywords con oportunidad (top 20 por score)
${JSON.stringify(ctx.topKeywords, null, 2)}

### Keywords en caída
${JSON.stringify(ctx.decliningKeywords, null, 2)}

### Rich Results (fragmentos enriquecidos)
${JSON.stringify(ctx.richResultIssues, null, 2)}

### Sitemaps
${JSON.stringify(ctx.sitemapStatus, null, 2)}

### Problemas de indexación
${JSON.stringify(ctx.urlCoverageProblems, null, 2)}

### Issues de seguridad activos
${JSON.stringify(ctx.securityIssues, null, 2)}

### Alertas sin resolver
${JSON.stringify(ctx.recentAlerts, null, 2)}

---

Genera entre 3 y 8 recomendaciones. Responde ÚNICAMENTE con un array JSON válido:

[
  {
    "category": "<seo_content|seo_technical|rich_results|performance|keywords|security|indexing|merchant|ux>",
    "priority": "<critical|high|medium|low>",
    "title": "<título corto y claro, máx 80 caracteres>",
    "description": "<explicación del problema en 2-3 oraciones, con datos específicos del sitio>",
    "action": "<qué hacer exactamente, paso a paso, en español>",
    "expected_impact": "<resultado esperado si se implementa>",
    "affected_urls": ["<url1>", "<url2>"]
  }
]

Prioridades:
- critical: problemas de seguridad, acciones manuales, caídas > 50%
- high: errores de rich results, keywords perdiendo posición, caídas 20-50%
- medium: oportunidades de quick win, optimizaciones de CTR
- low: mejoras incrementales, nuevas oportunidades

Sé específico: menciona queries, URLs o métricas reales de los datos.`

  log(`  [${domain}] Calling Claude (site-level)...`)

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    system:     'Eres un experto en SEO. Responde siempre con JSON válido sin texto adicional.',
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    log(`  [${domain}] Warning: no JSON array in response`)
    return []
  }

  const recommendations = JSON.parse(jsonMatch[0]) as any[]
  log(`  [${domain}] Generated ${recommendations.length} site-level recommendations`)
  return recommendations
}

// ── Generar recomendaciones por página ─────────────────────

async function generatePageRecommendations(siteId: number, domain: string) {
  const pages = await buildUnderperformingPages(siteId)

  if (!pages.length) {
    log(`  [${domain}] No underperforming pages to analyze`)
    return []
  }

  log(`  [${domain}] Analyzing ${pages.length} underperforming pages...`)

  const prompt = `Eres un experto en SEO y UX. Analiza las siguientes páginas de "${domain}" con bajo rendimiento y genera recomendaciones específicas POR PÁGINA.

## PÁGINAS CON BAJO RENDIMIENTO (últimos 28 días)

${JSON.stringify(pages, null, 2)}

Métricas a considerar:
- bounce_rate: % de visitas de 1 sola página (alto = malo, > 70% es crítico)
- avg_duration_sec: tiempo promedio en la página (bajo = malo, < 30s es crítico)
- avg_scroll_pct: % de scroll promedio (bajo = contenido no enganchó)
- gsc_ctr: Click-Through Rate orgánico (bajo = título/meta description malo)
- gsc_position: posición promedio en Google (1-3 = top, > 10 = página 2+)
- gsc_impressions: cuántas veces aparece en búsquedas
- underperformance_score: score calculado (mayor = peor rendimiento)

---

Genera entre 3 y 6 recomendaciones para las páginas con mayor problema.
Cada recomendación debe ser ESPECÍFICA para la página mencionada.

Responde ÚNICAMENTE con un array JSON válido:

[
  {
    "category": "<seo_content|ux|performance|keywords|seo_technical>",
    "priority": "<critical|high|medium|low>",
    "title": "<título específico, máx 80 chars>",
    "description": "<explica el problema con los datos reales de esa página>",
    "action": "<qué hacer en esa página específica, paso a paso>",
    "expected_impact": "<qué mejora se espera y en qué métrica>",
    "affected_urls": ["<path de la página específica>"]
  }
]

Prioriza: páginas con alto gsc_impressions pero bajo CTR, y páginas con alto tráfico pero alto bounce_rate.`

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    system:     'Eres un experto en SEO. Responde siempre con JSON válido sin texto adicional.',
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    log(`  [${domain}] Warning: no JSON in page-level response`)
    return []
  }

  const recs = JSON.parse(jsonMatch[0]) as any[]
  log(`  [${domain}] Generated ${recs.length} page-level recommendations`)
  return recs
}

// ── Guardar recomendaciones ────────────────────────────────

async function saveRecommendations(siteId: number, recs: any[]) {
  // Marcar como expiradas las recomendaciones antiguas pendientes > 7 días
  await query(`
    UPDATE ai_recommendations
    SET status = 'dismissed', dismissed_reason = 'superseded by new analysis'
    WHERE site_id = $1
      AND status = 'pending'
      AND generated_at < NOW() - INTERVAL '7 days'
  `, [siteId])

  for (const rec of recs) {
    await query(`
      INSERT INTO ai_recommendations (
        site_id, category, priority, title, description,
        action, expected_impact, affected_urls,
        expires_at, generated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW()+INTERVAL '14 days', NOW())
    `, [
      siteId,
      rec.category       ?? 'seo_technical',
      rec.priority       ?? 'medium',
      rec.title          ?? 'Recomendación',
      rec.description    ?? '',
      rec.action         ?? '',
      rec.expected_impact ?? null,
      JSON.stringify(rec.affected_urls ?? []),
    ])
  }
}

// ── Reporte semanal (solo los lunes) ─────────────────────

async function generateWeeklyReport(siteId: number, domain: string) {
  const today = new Date()
  if (today.getDay() !== 1) return  // 1 = lunes

  log(`  [${domain}] Generating weekly report...`)

  const ctx = await buildSiteContext(siteId, domain)
  const periodStart = new Date(today)
  periodStart.setDate(periodStart.getDate() - 7)

  const prompt = `Genera un reporte semanal ejecutivo para el sitio "${domain}".

Período: ${periodStart.toLocaleDateString('es-AR')} — ${today.toLocaleDateString('es-AR')}

DATOS:
${JSON.stringify(ctx, null, 2)}

El reporte debe estar en español, usar formato Markdown, y tener estas secciones:
1. **Resumen ejecutivo** (2-3 oraciones con lo más importante)
2. **Métricas principales** (tabla con cambios vs semana anterior)
3. **Lo que funcionó bien** (máximo 3 puntos)
4. **Problemas detectados** (con severidad)
5. **Acciones prioritarias para esta semana** (máximo 5, ordenadas por impacto)
6. **Oportunidades de keywords** (top 3 con datos)

Sé conciso, usa datos reales del sitio, y enfócate en lo accionable.`

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    messages:   [{ role: 'user', content: prompt }],
  })

  const reportText = response.content[0].type === 'text' ? response.content[0].text : ''

  const headlineMatch = reportText.match(/##?\s*Resumen ejecutivo\n+(.+)/)
  const headline = headlineMatch?.[1]?.slice(0, 200) ?? `Reporte semanal — ${domain}`

  await query(`
    INSERT INTO ai_reports (
      site_id, report_type, period_start, period_end,
      headline, full_report, report_data, generated_at
    ) VALUES ($1, 'weekly', $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (site_id, report_type, period_start) DO UPDATE SET
      headline     = EXCLUDED.headline,
      full_report  = EXCLUDED.full_report,
      report_data  = EXCLUDED.report_data,
      generated_at = NOW()
  `, [
    siteId,
    periodStart.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
    headline,
    reportText,
    JSON.stringify(ctx),
  ])

  log(`  [${domain}] Weekly report saved ✓`)
}

// ── Reporte mensual (solo el día 1 del mes) ──────────────

async function generateMonthlyReport(siteId: number, domain: string) {
  const today = new Date()
  if (today.getDate() !== 1) return  // Solo el 1° de cada mes

  log(`  [${domain}] Generating monthly report...`)

  const ctx = await buildSiteContext(siteId, domain)

  // Período = mes anterior completo
  const periodEnd   = new Date(today.getFullYear(), today.getMonth(), 0)  // último día del mes anterior
  const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 1) // primer día del mes anterior

  // Métricas del mes vs mes anterior
  const monthMetrics = await queryOne<any>(`
    WITH curr AS (
      SELECT
        COUNT(DISTINCT s.id)                                     AS visits,
        COUNT(e.id) FILTER (WHERE e.event_type = 'pageview')     AS pageviews,
        ROUND(AVG(s.duration_sec::numeric), 0)                    AS avg_duration,
        COUNT(DISTINCT s.id) FILTER (WHERE s.pages_visited = 1)::FLOAT
          / NULLIF(COUNT(DISTINCT s.id), 0) * 100               AS bounce_rate,
        COUNT(DISTINCT CASE WHEN s.did_convert THEN s.id END)    AS conversions
      FROM sessions s
      LEFT JOIN events e ON e.session_id = s.id
      WHERE s.site_id = $1 AND s.is_bot = false
        AND s.started_at >= $2 AND s.started_at <= $3
    ),
    prev AS (
      SELECT COUNT(DISTINCT id) AS visits
      FROM sessions
      WHERE site_id = $1 AND is_bot = false
        AND started_at >= $4 AND started_at < $2
    )
    SELECT curr.*, prev.visits AS prev_visits,
      CASE WHEN prev.visits > 0
        THEN ROUND((((curr.visits - prev.visits)::numeric / NULLIF(prev.visits, 0)) * 100), 1)
        ELSE 0
      END AS change_pct
    FROM curr, prev
  `, [
    siteId,
    periodStart.toISOString().slice(0, 10),
    periodEnd.toISOString().slice(0, 10),
    new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().slice(0, 10),
  ])

  // Top 5 páginas del mes
  const topPages = await query<any>(`
    SELECT p.path, p.title, SUM(psd.unique_visits) AS visits,
           ROUND(AVG(psd.avg_duration_sec)::NUMERIC, 0) AS avg_duration
    FROM page_stats_daily psd
    JOIN pages p ON p.id = psd.page_id
    WHERE psd.site_id = $1
      AND psd.stat_date >= $2 AND psd.stat_date <= $3
    GROUP BY p.path, p.title
    ORDER BY visits DESC
    LIMIT 5
  `, [siteId, periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10)])

  // Top 5 keywords del mes
  const topKeywords = await query<any>(`
    SELECT query, SUM(clicks) AS clicks, ROUND(AVG(position)::NUMERIC, 1) AS position
    FROM gsc_performance
    WHERE site_id = $1
      AND stat_date >= $2 AND stat_date <= $3
      AND query IS NOT NULL
    GROUP BY query
    ORDER BY clicks DESC
    LIMIT 5
  `, [siteId, periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10)])

  const monthName = periodStart.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  const prompt = `Genera un reporte mensual ejecutivo completo para el sitio "${domain}".

Período: ${monthName}

MÉTRICAS DEL MES:
${JSON.stringify(monthMetrics, null, 2)}

TOP PÁGINAS:
${JSON.stringify(topPages, null, 2)}

TOP KEYWORDS:
${JSON.stringify(topKeywords, null, 2)}

ESTADO GENERAL DEL SITIO:
${JSON.stringify(ctx, null, 2)}

El reporte debe estar en español, usar formato Markdown, y tener estas secciones:
1. **Resumen del mes** (3-4 oraciones ejecutivas con lo más importante)
2. **Métricas principales del mes** (tabla comparativa vs mes anterior)
3. **Páginas destacadas** (top 5 con análisis breve)
4. **Rendimiento en buscadores** (GSC: keywords, posiciones, CTR)
5. **Rich Results y datos estructurados** (estado actual)
6. **Problemas detectados en el mes** (con severidad y estado)
7. **Acciones clave para el próximo mes** (máximo 5, por impacto)
8. **Oportunidades identificadas** (keywords, contenido, técnico)

Sé analítico, usa datos reales, y da contexto sobre tendencias.`

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 3000,
    messages:   [{ role: 'user', content: prompt }],
  })

  const reportText = response.content[0].type === 'text' ? response.content[0].text : ''

  const headlineMatch = reportText.match(/##?\s*Resumen del mes\n+(.+)/)
  const headline = headlineMatch?.[1]?.slice(0, 200) ?? `Reporte mensual ${monthName} — ${domain}`

  await query(`
    INSERT INTO ai_reports (
      site_id, report_type, period_start, period_end,
      headline, full_report, report_data,
      total_visits, visits_change,
      top_pages, top_keywords,
      generated_at
    ) VALUES ($1, 'monthly', $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (site_id, report_type, period_start) DO UPDATE SET
      headline     = EXCLUDED.headline,
      full_report  = EXCLUDED.full_report,
      report_data  = EXCLUDED.report_data,
      total_visits = EXCLUDED.total_visits,
      visits_change = EXCLUDED.visits_change,
      top_pages    = EXCLUDED.top_pages,
      top_keywords = EXCLUDED.top_keywords,
      generated_at = NOW()
  `, [
    siteId,
    periodStart.toISOString().slice(0, 10),
    periodEnd.toISOString().slice(0, 10),
    headline,
    reportText,
    JSON.stringify({ ctx, monthMetrics }),
    parseInt(monthMetrics?.visits ?? '0', 10),
    parseFloat(monthMetrics?.change_pct ?? '0'),
    JSON.stringify(topPages),
    JSON.stringify(topKeywords),
  ])

  log(`  [${domain}] Monthly report saved ✓`)
}

// ── Runner principal ───────────────────────────────────────

async function main() {
  log('=== Starting AI recommendations generation ===')

  const sites = await query<{ id: number; domain: string }>(`
    SELECT id, domain FROM sites WHERE is_active = true
  `)

  for (const site of sites) {
    try {
      log(`Processing ${site.domain}...`)

      // 1. Recomendaciones a nivel de sitio
      const siteRecs = await generateRecommendations(site.id, site.domain)

      // 2. Recomendaciones a nivel de página (páginas con bajo rendimiento)
      const pageRecs = await generatePageRecommendations(site.id, site.domain)

      // Guardar todas juntas
      const allRecs = [...siteRecs, ...pageRecs]
      await saveRecommendations(site.id, allRecs)
      log(`  ✓ ${site.domain}: ${allRecs.length} recommendations saved (${siteRecs.length} site + ${pageRecs.length} page)`)

      // 3. Reporte semanal (solo lunes)
      await generateWeeklyReport(site.id, site.domain)

      // 4. Reporte mensual (solo el 1° de cada mes)
      await generateMonthlyReport(site.id, site.domain)

      // Pausa entre sitios para no saturar la API de Claude
      await new Promise(r => setTimeout(r, 2000))

    } catch (err) {
      log(`  ✗ ${site.domain}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  log('=== AI recommendations completed ===')
  process.exit(0)
}

main().catch(err => {
  console.error('[AI] Fatal error:', err)
  process.exit(1)
})
