#!/usr/bin/env tsx
/**
 * Vista previa del digest de diagnósticos (mismo cuerpo que el email del agente).
 * Uso:
 *   npx tsx --env-file=.env scripts/preview-agent-diagnostic-email.ts usapelletmill
 *   npx tsx --env-file=.env scripts/preview-agent-diagnostic-email.ts --sample
 *     → ejemplo con datos ficticios (formato completo del mail cuando hay hallazgos)
 */
import 'dotenv/config'
import { query, queryOne } from '@/lib/db'
import {
  getFunnelDropOff,
  getPageMetrics,
  getSiteMetrics,
} from './agent/analysis/analyticsEngine'
import { diagnosePages } from './agent/diagnostic/diagnosticEngine'
import { buildDiagnosticEmailBody } from './agent/notify/diagnosticEmail'
import type { PageDiagnosis, PageIssue, PageMetrics } from './agent/types'

function sampleDiagnosesForUsapelletmill(): PageDiagnosis[] {
  const baseMetrics = (path: string, title: string, ghl: string | null): PageMetrics => ({
    path,
    title,
    ghlPageId: ghl,
    uniqueVisits: 420,
    sessions: 380,
    bounces: 310,
    bounceRate: 72,
    avgDurationSec: 22,
    avgScrollDepthPct: 28,
    interactions: 12,
    ctaClicks: 4,
    ctaClickRate: 0.012,
    funnelDropOffRate: 35,
    exitRate: 48,
    gscClicks: 18,
    gscImpressions: 2400,
    gscCtr: 0.0075,
    gscPosition: 14.2,
    hasSchema: false,
    schemaTypes: [],
    underperformanceScore: 62,
  })

  const issue1: PageIssue = {
    type: 'low_ctr',
    severity: 'high',
    metric: 'gsc_ctr',
    value: 0.0075,
    threshold: 0.02,
    message:
      'CTR is 0.75% — below the 2% benchmark. Meta title or description likely needs improvement.',
    suggestedAction: 'update_meta_title',
  }

  const issue2: PageIssue = {
    type: 'high_bounce',
    severity: 'medium',
    metric: 'bounce_rate',
    value: 72,
    threshold: 65,
    message:
      'Bounce rate is 72% — above the 65% threshold. Page content or CTA may not match user intent.',
    suggestedAction: 'update_cta_text',
  }

  const m1 = baseMetrics('/pellet-mills', 'Industrial Pellet Mills | US Pellet Mill', 'ghl_demo_page_1')
  const m2 = baseMetrics('/contact', 'Contact us', null)

  const d1: PageDiagnosis = {
    metrics: m1,
    issues: [issue1, issue2],
    priority: 'high',
    totalIssues: 2,
    needsAction: true,
  }

  const d2: PageDiagnosis = {
    metrics: m2,
    issues: [
      {
        type: 'missing_schema',
        severity: 'medium',
        metric: 'has_schema',
        value: 0,
        threshold: 1,
        message: 'No JSON-LD structured data detected — missing rich result opportunities.',
        suggestedAction: 'inject_schema',
      },
    ],
    priority: 'medium',
    totalIssues: 1,
    needsAction: true,
  }

  return [d1, d2]
}

async function tableExists(name: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS ok
  `,
    [name],
  )
  return row?.ok ?? false
}

/** Igual que getSiteMetrics pero sin leer ghl_pages (si la migración 012 no está aplicada). */
async function getSiteMetricsWithoutGhl(siteId: number, domain: string, periodDays = 28) {
  const pageMetrics = await getPageMetrics(siteId, periodDays)
  const funnelDropOffs = await getFunnelDropOff(siteId, periodDays)
  for (const pm of pageMetrics) {
    pm.funnelDropOffRate = funnelDropOffs.get(pm.path) ?? 0
    pm.hasSchema = false
    pm.schemaTypes = []
  }
  return { topUnderperformingPages: pageMetrics.slice(0, 10), domain }
}

async function mapPathsToGHLPages(siteId: number, metrics: PageMetrics[]): Promise<PageMetrics[]> {
  if (!(await tableExists('ghl_pages'))) return metrics

  const ghlPages = await query<{ ghl_page_id: string; path: string | null; full_url: string | null }>(`
    SELECT ghl_page_id, path, full_url
    FROM ghl_pages
    WHERE site_id = $1 AND is_active = true
  `, [siteId])

  if (ghlPages.length === 0) return metrics

  const pathMap = new Map<string, string>()
  for (const gp of ghlPages) {
    if (gp.path) {
      const normalized = gp.path.replace(/\/$/, '') || '/'
      pathMap.set(normalized, gp.ghl_page_id)
    }
    if (gp.full_url) {
      try {
        const p = new URL(gp.full_url).pathname.replace(/\/$/, '') || '/'
        pathMap.set(p, gp.ghl_page_id)
      } catch {
        /* invalid URL */
      }
    }
  }

  return metrics.map(m => {
    const normalized = m.path.replace(/\/$/, '') || '/'
    const ghlPageId = pathMap.get(normalized) ?? null
    return { ...m, ghlPageId }
  })
}

async function main() {
  if (process.argv.includes('--sample')) {
    const domain = 'usapelletmill.com'
    const diagnoses = sampleDiagnosesForUsapelletmill()
    const subject = `[Agent GHL] ${domain} — 2 página(s) con diagnósticos`
    const body = buildDiagnosticEmailBody(domain, true, diagnoses)
    console.error('[preview] Modo --sample (métricas ficticias, formato real del correo)\n')
    console.log('--- Asunto ---')
    console.log(subject)
    console.log('\n--- Para (desde .env) ---')
    console.log(process.env.AGENT_DIAGNOSTIC_NOTIFY_TO ?? '(no definido)')
    console.log('\n--- Cuerpo ---\n')
    console.log(body)
    return
  }

  const needle = (process.argv[2] ?? 'usapelletmill').toLowerCase()

  const site = await queryOne<{ id: number; domain: string }>(
    `
    SELECT id, domain
    FROM sites
    WHERE LOWER(domain) LIKE $1 OR LOWER(name) LIKE $1
    ORDER BY id
    LIMIT 1
  `,
    [`%${needle}%`],
  )

  if (!site) {
    console.error(`No se encontró ningún site que coincida con "${needle}" en la tabla sites.`)
    process.exit(1)
  }

  console.error(`[preview] site_id=${site.id} domain=${site.domain}\n`)

  const siteMetrics =
    (await tableExists('ghl_pages'))
      ? await getSiteMetrics(site.id, site.domain)
      : await getSiteMetricsWithoutGhl(site.id, site.domain)

  if (!(await tableExists('ghl_pages'))) {
    console.error(
      '[preview] Aviso: tabla ghl_pages no existe — sin mapeo GHL ni detección de schema desde GHL (como tras migrar 012).\n',
    )
  }

  const pages = siteMetrics.topUnderperformingPages

  if (pages.length === 0) {
    console.log(
      '(Sin páginas en el top de bajo rendimiento con volumen suficiente — el email sería muy corto o vacío en issues.)\n',
    )
  }

  const enriched = await mapPathsToGHLPages(site.id, pages)
  const diagnoses = diagnosePages(enriched)

  const issueCount = diagnoses.filter(d => d.issues.length > 0).length
  const subject =
    issueCount > 0
      ? `[Agent GHL] ${site.domain} — ${issueCount} página(s) con diagnósticos`
      : `[Agent GHL] ${site.domain} — ejecución sin hallazgos`

  const dryRun = true
  const body = buildDiagnosticEmailBody(site.domain, dryRun, diagnoses)

  console.log('--- Asunto (como en producción) ---')
  console.log(subject)
  console.log('\n--- Para: AGENT_DIAGNOSTIC_NOTIFY_TO ---')
  console.log(process.env.AGENT_DIAGNOSTIC_NOTIFY_TO ?? '(no definido en .env)')
  console.log('\n--- Cuerpo del mensaje (vista previa) ---\n')
  console.log(body)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
