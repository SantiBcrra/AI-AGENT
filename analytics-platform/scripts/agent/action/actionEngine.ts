// ============================================================
// ACTION ENGINE
// Executes a list of AgentActions decided by the DecisionEngine.
//
// For each action:
//   1. Check rate limits (Safety Layer)
//   2. Create a backup (Safety Layer)
//   3. Log pending change (Safety Layer)
//   4. Execute via appropriate strategy
//   5. Log result (applied / failed / dry_run)
//   6. Return ActionResult
//
// Strategy selection:
//   direct_api     → update_meta_title, update_meta_desc
//   script_injection → inject_schema, inject_head_script, inject_body_script
//   html_patch     → update_cta_text, update_page_title, patch_html_section
// ============================================================

import type {
  AgentAction,
  ActionResult,
  GHLSiteConfig,
} from '../types'
import { GHLClient } from './ghl/ghlClient'
import { applyDirectApiUpdate } from './strategies/directApiStrategy'
import { applyScriptInjection } from './strategies/scriptInjectionStrategy'
import { applyHtmlPatch } from './strategies/htmlPatchStrategy'
import { checkRateLimit } from '../safety/rateLimiter'
import { createBackup, linkBackupToChange } from '../safety/backupManager'
import { queueHighImpactChange, processApprovedQueueItem } from '../safety/changeQueue'
import {
  logChangePending,
  logChangeApplied,
  logChangeFailed,
  logChangeDryRun,
} from '../safety/changeLogger'

const log = (msg: string) => console.log(`[ActionEngine] ${new Date().toISOString()} ${msg}`)

// ── Execute a single action ────────────────────────────────

async function executeAction(
  action: AgentAction,
  client: GHLClient,
  siteConfig: GHLSiteConfig,
): Promise<ActionResult> {
  const { siteId, dryRun } = siteConfig

  // 1. Rate limit check
  const rateLimit = await checkRateLimit(siteConfig, action.ghlPageId)
  if (!rateLimit.allowed) {
    log(`  Rate limited on ${action.path}: ${rateLimit.reason}`)
    return { action, status: 'rate_limited', errorMessage: rateLimit.reason }
  }

  // 1b. High-impact gate: queue for human review instead of auto-applying
  // html_patch actions are inherently higher-risk (DOM manipulation, content changes)
  // and all actions scoring >= 8 touch pages that matter most — require approval.
  const HIGH_IMPACT_THRESHOLD = 8
  const isHighRisk =
    action.impactScore >= HIGH_IMPACT_THRESHOLD ||
    action.actionType === 'patch_html_section'

  if (isHighRisk && !dryRun) {
    try {
      const queueId = await queueHighImpactChange(action, siteId)
      log(`  [QUEUED] ${action.actionType} on ${action.path} (score=${action.impactScore}) — awaiting approval (queue_id=${queueId})`)
      return { action, status: 'skipped', errorMessage: `Queued for approval (id=${queueId})` }
    } catch (err) {
      log(`  Queue insertion failed, falling through to auto-apply: ${err instanceof Error ? err.message : String(err)}`)
      // If queue insert fails, fall through to normal execution
    }
  }

  // 2. Create backup
  let backupId: bigint
  try {
    backupId = await createBackup(action, siteId)
  } catch (err) {
    const msg = `Backup creation failed: ${err instanceof Error ? err.message : String(err)}`
    log(`  ${msg}`)
    return { action, status: 'failed', errorMessage: msg }
  }

  // 3. Log pending change
  let changeId: bigint
  try {
    changeId = await logChangePending(action, siteId, backupId)
    await linkBackupToChange(backupId, changeId)
  } catch (err) {
    const msg = `Change log failed: ${err instanceof Error ? err.message : String(err)}`
    log(`  ${msg}`)
    return { action, status: 'failed', errorMessage: msg, backupId }
  }

  // 4. Dry-run mode — simulate without applying
  if (dryRun) {
    const simulatedValue = JSON.stringify(action.payload).slice(0, 200)
    await logChangeDryRun(changeId, simulatedValue)
    log(`  [DRY RUN] Would apply ${action.actionType} on ${action.path}`)
    return { action, status: 'dry_run', changeId, backupId, appliedAt: new Date() }
  }

  // 5. Execute via strategy
  log(`Executing ${action.actionType} (${action.strategy}) on ${action.path}`)

  try {
    let success = false
    let newValue = ''
    let errorMessage: string | undefined

    switch (action.strategy) {
      case 'direct_api': {
        const result = await applyDirectApiUpdate(action, client, siteId)
        success      = result.success
        newValue     = JSON.stringify(result.appliedValues)
        errorMessage = result.errorMessage
        break
      }

      case 'script_injection': {
        const result = await applyScriptInjection(action, client, siteId)
        if (result.skipped) {
          log(`  Skipped (already applied): ${action.actionType} on ${action.path}`)
          await logChangeFailed(changeId, 'Skipped: already injected')
          return { action, status: 'skipped', changeId, backupId }
        }
        success      = result.success
        newValue     = `injected ${result.target} code`
        errorMessage = result.errorMessage
        break
      }

      case 'html_patch': {
        const result = await applyHtmlPatch(action, client, siteId)
        success      = result.success
        newValue     = result.method === 'dom_injection'
          ? `dom_injection: ${result.patchScript?.slice(0, 100)}`
          : `manual_instructions: ${result.manualInstructions?.slice(0, 100)}`
        errorMessage = result.errorMessage

        // Even if DOM injection failed, if we have manual instructions that's still useful
        if (!result.success && result.manualInstructions) {
          log(`  ⚠ DOM injection failed, manual instructions generated`)
          // Log as partial success with the instructions embedded in new_value
          await logChangeFailed(changeId, errorMessage ?? 'API fallback — manual instructions generated')
          return {
            action,
            status: 'failed',
            changeId,
            backupId,
            errorMessage: `${errorMessage}\n\n--- MANUAL PATCH ---\n${result.manualInstructions}`,
          }
        }
        break
      }

      default: {
        const msg = `Unknown strategy: ${action.strategy}`
        await logChangeFailed(changeId, msg)
        return { action, status: 'failed', changeId, backupId, errorMessage: msg }
      }
    }

    // 6. Log final result
    if (success) {
      await logChangeApplied(changeId, newValue)
      log(`  ✓ Applied ${action.actionType} on ${action.path}`)
      return { action, status: 'applied', changeId, backupId, appliedAt: new Date() }
    } else {
      await logChangeFailed(changeId, errorMessage ?? 'Unknown error')
      return { action, status: 'failed', changeId, backupId, errorMessage }
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`  ✗ Unexpected error on ${action.path}: ${message}`)
    await logChangeFailed(changeId, message).catch(() => {})
    return { action, status: 'failed', changeId, backupId, errorMessage: message }
  }
}

// ── Execute all actions for a site ────────────────────────

export async function executeActions(
  actions: AgentAction[],
  siteConfig: GHLSiteConfig,
): Promise<ActionResult[]> {
  if (actions.length === 0) {
    log(`No actions to execute for site ${siteConfig.siteId}`)
    return []
  }

  const client = new GHLClient({
    apiKey:     siteConfig.apiKey,
    locationId: siteConfig.locationId,
    apiVersion: siteConfig.apiVersion,
  })

  const results: ActionResult[] = []

  for (const action of actions) {
    const result = await executeAction(action, client, siteConfig)
    results.push(result)

    // Small delay between actions to be gentle on the GHL API
    await new Promise(r => setTimeout(r, 300))
  }

  const applied      = results.filter(r => r.status === 'applied').length
  const failed       = results.filter(r => r.status === 'failed').length
  const rateLimited  = results.filter(r => r.status === 'rate_limited').length
  const dryRun       = results.filter(r => r.status === 'dry_run').length

  log(`Site ${siteConfig.siteId}: applied=${applied} failed=${failed} rate_limited=${rateLimited} dry_run=${dryRun}`)

  return results
}
