#!/usr/bin/env tsx
// ============================================================
// CRON 02 — Inspección de Rich Results y URL Coverage
// Horario: diario a las 03:00
// Qué hace:
//   - Toma las top 200 URLs por tráfico de cada sitio
//   - Llama a la URL Inspection API de GSC
//   - Guarda estado de indexación y rich results
//   - Genera alertas si detecta nuevos errores
// Límite API: 2000 requests/día por property
// ============================================================

import 'dotenv/config'
import { getActiveSites, inspectUrl } from '@/lib/gsc/client'
import { query, queryOne } from '@/lib/db'

const log = (msg: string) => console.log(`[RICH] ${new Date().toISOString()} ${msg}`)

// Mapeo de tipos de GSC a nuestros tipos
const RICH_TYPE_MAP: Record<string, string> = {
  'Product':              'product',
  'Review':               'review',
  'BreadcrumbList':       'breadcrumb',
  'VideoObject':          'video',
  'FAQPage':              'faq',
  'HowTo':                'howto',
  'Event':                'event',
  'Recipe':               'recipe',
  'NewsArticle':          'article',
  'Article':              'article',
  'LocalBusiness':        'local_business',
  'MerchantListing':      'merchant',
  'ItemList':             'sitelinks',
}

// ── Procesar resultado de URL inspection ──────────────────

async function processInspection(siteId: number, pageUrl: string, result: any) {
  const inspection = result?.inspectionResult
  if (!inspection) return

  const idx    = inspection.indexStatusResult  ?? {}
  const mobile = inspection.mobileUsabilityResult ?? {}
  const rich   = inspection.richResultsResult  ?? {}

  // ── 1. Guardar estado de indexación ──────────────────────
  await query(`
    INSERT INTO gsc_url_inspection (
      site_id, page_url, coverage_state, indexing_state,
      robots_state, last_crawl_time, page_fetch_state,
      canonical_url, is_canonical, mobile_usable,
      mobile_issues, verdict, inspected_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
    ON CONFLICT (site_id, page_url) DO UPDATE SET
      coverage_state  = EXCLUDED.coverage_state,
      indexing_state  = EXCLUDED.indexing_state,
      robots_state    = EXCLUDED.robots_state,
      last_crawl_time = EXCLUDED.last_crawl_time,
      page_fetch_state= EXCLUDED.page_fetch_state,
      canonical_url   = EXCLUDED.canonical_url,
      is_canonical    = EXCLUDED.is_canonical,
      mobile_usable   = EXCLUDED.mobile_usable,
      mobile_issues   = EXCLUDED.mobile_issues,
      verdict         = EXCLUDED.verdict,
      inspected_at    = NOW()
  `, [
    siteId, pageUrl,
    idx.coverageState   ?? null,
    idx.indexingState   ?? null,
    idx.robotsTxtState  ?? null,
    idx.lastCrawlTime   ? new Date(idx.lastCrawlTime) : null,
    idx.pageFetchState  ?? null,
    idx.canonicalUrl    ?? null,
    idx.canonicalUrl === pageUrl,
    mobile.verdict === 'PASS',
    JSON.stringify(mobile.issues ?? []),
    inspection.verdict  ?? null,
  ])

  // ── 2. Guardar rich results por tipo ─────────────────────
  const detectedItems = rich.detectedItems ?? []

  if (detectedItems.length > 0) {
    for (const item of detectedItems) {
      const resultType = RICH_TYPE_MAP[item.richResultType] ?? item.richResultType.toLowerCase()

      // Recopilar todos los issues de todos los items
      const allIssues: Array<{ type: string; message: string; field?: string }> = []
      let errorsCount   = 0
      let warningsCount = 0

      for (const subItem of (item.items ?? [])) {
        for (const issue of (subItem.issues ?? [])) {
          const type = issue.severity === 'ERROR' ? 'error' : 'warning'
          allIssues.push({ type, message: issue.issueMessage })
          if (type === 'error') errorsCount++
          else warningsCount++
        }
      }

      const status = errorsCount > 0
        ? 'error'
        : warningsCount > 0
          ? 'valid_with_warnings'
          : 'valid'

      await query(`
        INSERT INTO gsc_rich_results (
          site_id, page_url, result_type, status,
          errors_count, warnings_count, issues, last_inspected, fetched_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        ON CONFLICT (site_id, page_url, result_type) DO UPDATE SET
          status         = EXCLUDED.status,
          errors_count   = EXCLUDED.errors_count,
          warnings_count = EXCLUDED.warnings_count,
          issues         = EXCLUDED.issues,
          last_inspected = NOW(),
          fetched_at     = NOW()
      `, [
        siteId, pageUrl, resultType, status,
        errorsCount, warningsCount,
        JSON.stringify(allIssues),
      ])

      // ── 3. Generar alerta si hay nuevos errores ──────────
      if (errorsCount > 0) {
        await query(`
          INSERT INTO system_alerts (
            site_id, alert_type, severity, title, message, context_data
          ) VALUES ($1, 'rich_result_error', 'high', $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [
          siteId,
          `Error en Rich Result: ${resultType}`,
          `La URL ${pageUrl} tiene ${errorsCount} error(es) en el fragmento de ${resultType}`,
          JSON.stringify({ url: pageUrl, type: resultType, errors: allIssues.filter(i => i.type === 'error') }),
        ])
      }
    }
  } else if (rich.verdict === 'VERDICT_UNSPECIFIED') {
    // No tiene rich results — marcar como not_detected solo si no existe ya
    // (no sobreescribir datos válidos previos)
  }
}

// ── Runner principal ───────────────────────────────────────

async function main() {
  log('=== Starting Rich Results inspection ===')

  const sites = await getActiveSites()

  for (const site of sites) {
    log(`Processing ${site.domain}...`)

    // Obtener top URLs: prioridad a las más visitadas y las que ya tienen errores
    const urls = await query<{ url: string }>(`
      SELECT DISTINCT path AS url FROM (
        -- Top 100 páginas por tráfico propio (últimos 28 días)
        SELECT e.path, COUNT(*) AS score
        FROM events e
        JOIN sessions s ON s.id = e.session_id
        WHERE e.site_id = $1 AND s.is_bot = false
          AND e.event_type = 'pageview'
          AND e.created_at >= NOW() - INTERVAL '28 days'
        GROUP BY e.path
        ORDER BY score DESC
        LIMIT 100
      ) t
      UNION
      -- URLs con errores previos (re-inspeccionar siempre)
      SELECT page_url AS url FROM gsc_rich_results
      WHERE site_id = $1 AND status = 'error'
      LIMIT 50
      UNION
      -- URLs del sitemap que no se han inspeccionado recientemente
      SELECT unnest(
        ARRAY(SELECT jsonb_array_elements_text(to_jsonb(array_agg(sitemap_url)))
              FROM gsc_sitemaps WHERE site_id = $1 AND status = 'ok' LIMIT 1)
      ) AS url
      LIMIT 50
    `, [site.id])

    log(`  [${site.domain}] Inspecting ${urls.length} URLs`)

    let done = 0
    const errors: string[] = []

    for (const { url } of urls) {
      // Construir URL completa si es un path relativo
      const fullUrl = url.startsWith('http')
        ? url
        : `https://${site.domain}${url}`

      try {
        const result = await inspectUrl(site, fullUrl)

        if (result) {
          await processInspection(site.id, fullUrl, result)
          done++
        }

        // Rate limit: máx ~3 requests/seg para no agotar la cuota diaria
        await new Promise(r => setTimeout(r, 350))

      } catch (err) {
        errors.push(`${fullUrl}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    log(`  [${site.domain}] Done: ${done}/${urls.length} inspected, ${errors.length} errors`)
    if (errors.length > 0) errors.slice(0, 3).forEach(e => log(`    - ${e}`))
  }

  log('=== Rich Results inspection completed ===')
  process.exit(0)
}

main().catch(err => {
  console.error('[RICH] Fatal error:', err)
  process.exit(1)
})
