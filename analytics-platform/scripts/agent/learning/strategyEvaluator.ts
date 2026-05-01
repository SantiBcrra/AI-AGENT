// ============================================================
// STRATEGY EVALUATOR
// Aggregates performance data from evaluated changes into
// ghl_strategy_scores. The Decision Engine reads these scores
// to avoid repeating strategies that don't work.
//
// Confidence scoring:
//   - Starts at 0.5 (neutral / no data)
//   - Increases toward 1.0 with consistent successes
//   - Decreases toward 0.0 with consistent failures
//   - Requires min 3 samples before applying confidence gating
// ============================================================

import { query, queryOne } from '@/lib/db'
import type { StrategyScore, ActionType } from '../types'

const log = (msg: string) => console.log(`[StrategyEval] ${new Date().toISOString()} ${msg}`)

// ── Recompute scores for a site ────────────────────────────

export async function updateStrategyScores(siteId: number): Promise<void> {
  // Pull all evaluated changes for this site
  const rows = await query<{
    action_type: string
    trigger_metric: string
    total_applied: string
    total_effective: string
    total_failed: string
    avg_delta: string
  }>(`
    SELECT
      action_type,
      trigger_metric,
      COUNT(*)                                              AS total_applied,
      COUNT(*) FILTER (WHERE was_effective = true)         AS total_effective,
      COUNT(*) FILTER (WHERE was_effective = false)        AS total_failed,
      ROUND(AVG(metric_delta)::NUMERIC, 2)                 AS avg_delta
    FROM ghl_changes
    WHERE site_id = $1
      AND status = 'applied'
      AND evaluated_at IS NOT NULL
      AND trigger_metric IS NOT NULL
    GROUP BY action_type, trigger_metric
  `, [siteId])

  for (const r of rows) {
    const totalApplied   = parseInt(r.total_applied, 10)
    const totalEffective = parseInt(r.total_effective, 10)
    const totalFailed    = parseInt(r.total_failed, 10)
    const avgDelta       = parseFloat(r.avg_delta)

    // Confidence formula:
    //   With fewer than 3 samples, keep at 0.5 (neutral)
    //   With enough data, bayesian-style estimate:
    //     confidence = (successes + 1) / (total + 2)   [Laplace smoothing]
    let confidence = 0.5
    if (totalApplied >= 3) {
      confidence = (totalEffective + 1) / (totalApplied + 2)
      // Clamp to [0.1, 0.95] to never fully exclude a strategy
      confidence = Math.max(0.1, Math.min(0.95, confidence))
    }

    await query(`
      INSERT INTO ghl_strategy_scores (
        site_id, action_type, trigger_metric,
        total_applied, total_effective, total_failed,
        avg_metric_delta, confidence_score, last_updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (site_id, action_type, trigger_metric) DO UPDATE SET
        total_applied    = EXCLUDED.total_applied,
        total_effective  = EXCLUDED.total_effective,
        total_failed     = EXCLUDED.total_failed,
        avg_metric_delta = EXCLUDED.avg_metric_delta,
        confidence_score = EXCLUDED.confidence_score,
        last_updated_at  = NOW()
    `, [
      siteId, r.action_type, r.trigger_metric,
      totalApplied, totalEffective, totalFailed,
      avgDelta, confidence,
    ])

    log(`  ${r.action_type}::${r.trigger_metric}: confidence=${confidence.toFixed(2)} (${totalEffective}/${totalApplied} effective, avg_delta=${avgDelta > 0 ? '+' : ''}${avgDelta}%)`)
  }
}

// ── Get top/bottom strategies for a site ──────────────────

export async function getStrategyReport(siteId: number): Promise<{
  top: StrategyScore[]
  bottom: StrategyScore[]
}> {
  const rows = await query<{
    action_type: string
    trigger_metric: string
    total_applied: string
    total_effective: string
    total_failed: string
    avg_metric_delta: string
    confidence_score: string
  }>(`
    SELECT action_type, trigger_metric, total_applied, total_effective,
           total_failed, avg_metric_delta, confidence_score
    FROM ghl_strategy_scores
    WHERE site_id = $1 AND total_applied >= 2
    ORDER BY confidence_score DESC
  `, [siteId])

  const scores: StrategyScore[] = rows.map(r => ({
    actionType:      r.action_type as ActionType,
    triggerMetric:   r.trigger_metric,
    totalApplied:    parseInt(r.total_applied, 10),
    totalEffective:  parseInt(r.total_effective, 10),
    totalFailed:     parseInt(r.total_failed, 10),
    avgMetricDelta:  parseFloat(r.avg_metric_delta),
    confidenceScore: parseFloat(r.confidence_score),
  }))

  return {
    top:    scores.slice(0, 5),
    bottom: scores.slice(-5).reverse(),
  }
}

// ── Run full learning cycle for all active sites ──────────

export async function runLearningCycle(): Promise<void> {
  const sites = await query<{ id: string; domain: string }>(`
    SELECT gs.site_id AS id, s.domain
    FROM ghl_sites gs
    JOIN sites s ON s.id = gs.site_id
    WHERE gs.agent_enabled = true
  `)

  log(`Running learning cycle for ${sites.length} sites...`)

  for (const site of sites) {
    try {
      await updateStrategyScores(parseInt(site.id, 10))
      log(`  ✓ Updated strategy scores for ${site.domain}`)
    } catch (err) {
      log(`  ✗ Error for ${site.domain}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
