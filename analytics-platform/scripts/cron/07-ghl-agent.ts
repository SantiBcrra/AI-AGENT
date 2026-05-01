#!/usr/bin/env tsx
// ============================================================
// CRON 07 — GHL AI Agent
// Schedule: daily at 06:00 (after 05:00 AI recommendations run)
//
// What it does:
//   1. Run the learning cycle (evaluate past changes + update scores)
//   2. Run the agent for all enabled GHL sites:
//      - Sync pages from GHL API
//      - Analyze metrics
//      - Detect issues
//      - Decide actions with Claude
//      - Apply changes via GHL API
//   3. Log a summary
//
// Environment variables required:
//   DATABASE_URL          — PostgreSQL connection string
//   ANTHROPIC_API_KEY     — For Claude-powered decision engine
//   (GHL API keys are stored per-site in ghl_sites table)
//
// To add a new site to the agent, run:
//   INSERT INTO ghl_sites (site_id, location_id, api_key)
//   VALUES (<id>, '<ghl_location_id>', '<ghl_api_key>');
// ============================================================

import 'dotenv/config'
import { runAgentForAllSites } from '../agent/orchestrator'
import { evaluatePendingChanges } from '../agent/learning/performanceTracker'
import { runLearningCycle } from '../agent/learning/strategyEvaluator'
import { expireStaleQueueItems } from '../agent/safety/changeQueue'

const log = (msg: string) => console.log(`[GHL-Agent] ${new Date().toISOString()} ${msg}`)

async function main() {
  log('=== GHL AI Agent — Starting ===')
  const startTime = Date.now()

  // ── Phase 0: Housekeeping ──────────────────────────────
  log('--- Phase 0: Expiring stale queue items ---')
  try {
    await expireStaleQueueItems()
  } catch (err) {
    log(`Warning: Queue expiry failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Phase 1: Learning loop ─────────────────────────────
  log('--- Phase 1: Evaluating past changes ---')
  try {
    const comparisons = await evaluatePendingChanges()
    log(`Evaluated ${comparisons.length} past changes`)

    const effective   = comparisons.filter(c => c.wasEffective).length
    const ineffective = comparisons.filter(c => !c.wasEffective).length
    if (comparisons.length > 0) {
      log(`Results: ${effective} effective (${(effective / comparisons.length * 100).toFixed(0)}%), ${ineffective} ineffective`)
    }
  } catch (err) {
    log(`Warning: Learning evaluation failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Phase 2: Update strategy scores ───────────────────
  log('--- Phase 2: Updating strategy confidence scores ---')
  try {
    await runLearningCycle()
  } catch (err) {
    log(`Warning: Strategy score update failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Phase 3: Run the agent ─────────────────────────────
  log('--- Phase 3: Running agent for all sites ---')
  const siteResults = await runAgentForAllSites()

  // ── Summary ────────────────────────────────────────────
  const totalApplied  = siteResults.reduce((a, r) => a + r.actionsApplied, 0)
  const totalFailed   = siteResults.reduce((a, r) => a + r.actionsFailed, 0)
  const totalIssues   = siteResults.reduce((a, r) => a + r.issuesFound, 0)
  const totalPages    = siteResults.reduce((a, r) => a + r.pagesAnalyzed, 0)
  const elapsedSec    = ((Date.now() - startTime) / 1000).toFixed(1)

  log('=== GHL AI Agent — Summary ===')
  log(`  Sites processed: ${siteResults.length}`)
  log(`  Pages analyzed:  ${totalPages}`)
  log(`  Issues found:    ${totalIssues}`)
  log(`  Changes applied: ${totalApplied}`)
  log(`  Changes failed:  ${totalFailed}`)
  log(`  Elapsed:         ${elapsedSec}s`)

  for (const r of siteResults) {
    const tag = r.dryRun ? '[DRY RUN]' : ''
    log(`  ${tag} ${r.domain}: ${r.actionsApplied} applied, ${r.actionsFailed} failed (${r.issuesFound} issues on ${r.pagesAnalyzed} pages)`)
  }

  log('=== Done ===')
  process.exit(0)
}

main().catch(err => {
  console.error('[GHL-Agent] Fatal error:', err)
  process.exit(1)
})
