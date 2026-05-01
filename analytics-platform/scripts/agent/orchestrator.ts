// ============================================================
// AGENT ORCHESTRATOR
// Main entry point for one full agent run.
//
// Pipeline per site:
//   1. Load GHL config (location, API key, limits)
//   2. Sync GHL pages → local cache (discover new pages)
//   3. Map analytics paths to GHL page IDs
//   4. Run Analysis Engine (compute metrics from PostgreSQL)
//   5. Run Diagnostic Engine (detect issues)
//   6. Run Decision Engine (AI prioritization → actions with content)
//   7. Run Action Engine (execute via GHL API)
//   8. Return AgentRunResult
//
// Learning loop runs separately (see cron/07-ghl-agent.ts):
//   - evaluatePendingChanges()   → score changes after 14 days
//   - runLearningCycle()         → update strategy confidence scores
// ============================================================

import { query, queryOne } from '@/lib/db'
import { GHLClient } from './action/ghl/ghlClient'
import { getSiteMetrics } from './analysis/analyticsEngine'
import { diagnosePages, getActionableDiagnoses, summarizeDiagnoses } from './diagnostic/diagnosticEngine'
import { decideActions } from './decision/decisionEngine'
import { executeActions } from './action/actionEngine'
import { sendAgentDiagnosticDigest, sendAgentPlainDigest } from './notify/diagnosticEmail'
import type { GHLSiteConfig, AgentRunResult, PageMetrics } from './types'

const log = (msg: string) => console.log(`[Orchestrator] ${new Date().toISOString()} ${msg}`)

// ── Load GHL site config from DB ───────────────────────────

async function loadGHLConfig(siteId: number): Promise<GHLSiteConfig | null> {
  const row = await queryOne<{
    site_id: string
    domain: string
    location_id: string
    api_key: string
    api_version: string
    max_changes_per_day: string
    max_changes_per_page: string
    cooldown_hours: string
    agent_enabled: boolean
    dry_run: boolean
  }>(`
    SELECT gs.site_id, s.domain, gs.location_id, gs.api_key, gs.api_version,
           gs.max_changes_per_day, gs.max_changes_per_page, gs.cooldown_hours,
           gs.agent_enabled, gs.dry_run
    FROM ghl_sites gs
    JOIN sites s ON s.id = gs.site_id
    WHERE gs.site_id = $1
  `, [siteId])

  if (!row) return null

  return {
    siteId:           parseInt(row.site_id, 10),
    domain:           row.domain,
    locationId:       row.location_id,
    apiKey:           row.api_key,
    apiVersion:       row.api_version,
    maxChangesPerDay: parseInt(row.max_changes_per_day, 10),
    maxChangesPerPage: parseInt(row.max_changes_per_page, 10),
    cooldownHours:    parseInt(row.cooldown_hours, 10),
    agentEnabled:     row.agent_enabled,
    dryRun:           row.dry_run,
  }
}

// ── Sync GHL pages to local cache ──────────────────────────

async function syncGHLPages(config: GHLSiteConfig): Promise<void> {
  log(`  [${config.domain}] Syncing GHL pages...`)

  const client = new GHLClient({
    apiKey:     config.apiKey,
    locationId: config.locationId,
    apiVersion: config.apiVersion,
  })

  const discovered = await client.discoverAllPages()
  log(`  [${config.domain}] Discovered ${discovered.length} pages in GHL`)

  for (const page of discovered) {
    await query(`
      INSERT INTO ghl_pages (
        site_id, ghl_funnel_id, ghl_page_id, ghl_page_type,
        title, meta_title, meta_description,
        path, full_url, head_code, body_code,
        last_synced_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
      ON CONFLICT (site_id, ghl_page_id) DO UPDATE SET
        ghl_funnel_id    = EXCLUDED.ghl_funnel_id,
        ghl_page_type    = EXCLUDED.ghl_page_type,
        title            = COALESCE(EXCLUDED.title, ghl_pages.title),
        meta_title       = COALESCE(EXCLUDED.meta_title, ghl_pages.meta_title),
        meta_description = COALESCE(EXCLUDED.meta_description, ghl_pages.meta_description),
        path             = COALESCE(EXCLUDED.path, ghl_pages.path),
        full_url         = COALESCE(EXCLUDED.full_url, ghl_pages.full_url),
        head_code        = COALESCE(EXCLUDED.head_code, ghl_pages.head_code),
        body_code        = COALESCE(EXCLUDED.body_code, ghl_pages.body_code),
        last_synced_at   = NOW(),
        updated_at       = NOW()
    `, [
      config.siteId,
      page.ghlFunnelId,
      page.ghlPageId,
      page.ghlPageType,
      page.title,
      page.metaTitle,
      page.metaDescription,
      page.path,
      page.fullUrl,
      page.headCode,
      page.bodyCode,
    ])
  }

  log(`  [${config.domain}] GHL page cache synced (${discovered.length} pages)`)
}

// ── Map analytics paths → GHL page IDs ────────────────────
// Analytics tracks paths like /landing/offer-1
// GHL pages have a path/url field from the cache.
// We fuzzy-match to link them.

async function mapPathsToGHLPages(
  siteId: number,
  metrics: PageMetrics[],
): Promise<PageMetrics[]> {
  // Load all GHL pages for this site from cache
  const ghlPages = await query<{ ghl_page_id: string; path: string | null; full_url: string | null }>(`
    SELECT ghl_page_id, path, full_url
    FROM ghl_pages
    WHERE site_id = $1 AND is_active = true
  `, [siteId])

  if (ghlPages.length === 0) return metrics

  // Build a path → page_id map
  const pathMap = new Map<string, string>()
  for (const gp of ghlPages) {
    if (gp.path) {
      // Normalize: strip trailing slash
      const normalized = gp.path.replace(/\/$/, '') || '/'
      pathMap.set(normalized, gp.ghl_page_id)
    }
    if (gp.full_url) {
      try {
        const p = new URL(gp.full_url).pathname.replace(/\/$/, '') || '/'
        pathMap.set(p, gp.ghl_page_id)
      } catch { /* invalid URL */ }
    }
  }

  // Enrich metrics with GHL page IDs
  return metrics.map(m => {
    const normalized = m.path.replace(/\/$/, '') || '/'
    const ghlPageId  = pathMap.get(normalized) ?? null
    return { ...m, ghlPageId }
  })
}

// ── Run agent for a single site ────────────────────────────

export async function runAgentForSite(siteId: number): Promise<AgentRunResult | null> {
  const startedAt = new Date()

  const config = await loadGHLConfig(siteId)
  if (!config) {
    log(`No GHL config found for site ${siteId} — skipping`)
    return null
  }

  if (!config.agentEnabled) {
    log(`Agent disabled for ${config.domain} — skipping`)
    return null
  }

  log(`=== Running agent for ${config.domain} (dry_run=${config.dryRun}) ===`)

  // Step 1: Sync GHL pages
  try {
    await syncGHLPages(config)
  } catch (err) {
    log(`  Page sync failed for ${config.domain}: ${err instanceof Error ? err.message : String(err)}`)
    // Continue anyway — we may have cached data
  }

  // Step 2: Compute metrics
  log(`  [${config.domain}] Computing analytics metrics...`)
  const siteMetrics = await getSiteMetrics(siteId, config.domain)
  const allPages    = siteMetrics.topUnderperformingPages

  if (allPages.length === 0) {
    log(`  [${config.domain}] No pages with sufficient traffic for analysis`)
    const ghlCountRow = await queryOne<{ c: string }>(
      `SELECT COUNT(*)::TEXT AS c FROM ghl_pages WHERE site_id = $1 AND is_active = true`,
      [siteId],
    )
    const ghlN = parseInt(ghlCountRow?.c ?? '0', 10)
    await sendAgentPlainDigest(
      config.domain,
      config.dryRun,
      `[Agent GHL] ${config.domain} — sin métricas analíticas para diagnosticar`,
      [
        'El agente no encontró páginas con volumen suficiente en page_stats_daily / eventos (ventana típica 28 días).',
        'Revisa que el pixel esté instalado, que el cron de agregación (04) corra y que haya tráfico.',
        '',
        `Páginas sincronizadas desde GHL en caché (ghl_pages): ${ghlN}`,
      ],
    )
    return buildResult(config, startedAt, 0, 0, 0, 0, 0, [])
  }

  // Step 3: Map paths to GHL page IDs
  const enrichedPages = await mapPathsToGHLPages(siteId, allPages)
  const mappedCount   = enrichedPages.filter(p => p.ghlPageId !== null).length
  log(`  [${config.domain}] Mapped ${mappedCount}/${enrichedPages.length} pages to GHL`)

  // Step 4: Diagnose
  log(`  [${config.domain}] Running diagnostics...`)
  const allDiagnoses    = diagnosePages(enrichedPages)
  const actionableDiags = getActionableDiagnoses(allDiagnoses)
  summarizeDiagnoses(allDiagnoses)

  await sendAgentDiagnosticDigest(config.domain, config.dryRun, allDiagnoses)

  if (actionableDiags.length === 0) {
    log(`  [${config.domain}] No actionable issues found — site is in good shape!`)
    return buildResult(config, startedAt, enrichedPages.length, 0, 0, 0, 0, [])
  }

  // Step 5: Decide actions
  log(`  [${config.domain}] Deciding actions (max=${config.maxChangesPerDay})...`)
  const actions = await decideActions(
    actionableDiags,
    siteId,
    config.domain,
    config.maxChangesPerDay,
  )

  if (actions.length === 0) {
    log(`  [${config.domain}] No actionable decisions generated`)
    return buildResult(config, startedAt, enrichedPages.length, allDiagnoses.filter(d => d.needsAction).length, 0, 0, 0, [])
  }

  // Step 6: Execute actions
  log(`  [${config.domain}] Executing ${actions.length} actions...`)
  const results = await executeActions(actions, config)

  const applied = results.filter(r => r.status === 'applied' || r.status === 'dry_run').length
  const failed  = results.filter(r => r.status === 'failed').length

  log(`=== ${config.domain} complete: ${applied} applied, ${failed} failed ===`)

  return buildResult(
    config,
    startedAt,
    enrichedPages.length,
    allDiagnoses.filter(d => d.needsAction).length,
    actions.length,
    applied,
    failed,
    results,
  )
}

function buildResult(
  config: GHLSiteConfig,
  startedAt: Date,
  pagesAnalyzed: number,
  issuesFound: number,
  actionsDecided: number,
  actionsApplied: number,
  actionsFailed: number,
  results: any[],
): AgentRunResult {
  return {
    siteId:         config.siteId,
    domain:         config.domain,
    startedAt,
    completedAt:    new Date(),
    pagesAnalyzed,
    issuesFound,
    actionsDecided,
    actionsApplied,
    actionsFailed,
    dryRun:         config.dryRun,
    results,
  }
}

// ── Run agent for all enabled GHL sites ───────────────────

export async function runAgentForAllSites(): Promise<AgentRunResult[]> {
  const sites = await query<{ id: string; domain: string }>(`
    SELECT gs.site_id AS id, s.domain
    FROM ghl_sites gs
    JOIN sites s ON s.id = gs.site_id
    WHERE gs.agent_enabled = true
    ORDER BY gs.site_id
  `)

  log(`Starting agent run for ${sites.length} sites...`)

  const results: AgentRunResult[] = []

  for (const site of sites) {
    try {
      const result = await runAgentForSite(parseInt(site.id, 10))
      if (result) results.push(result)
    } catch (err) {
      log(`Fatal error on site ${site.domain}: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Pause between sites to avoid rate limits
    await new Promise(r => setTimeout(r, 2000))
  }

  return results
}
