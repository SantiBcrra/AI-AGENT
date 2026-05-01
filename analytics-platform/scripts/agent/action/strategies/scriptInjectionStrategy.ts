// ============================================================
// STRATEGY 2: SCRIPT INJECTION
// Injects code into the page's head or body tracking fields.
// This is the most reliable way to add schemas, tracking, and
// UX enhancements — every GHL page supports head/body code.
//
// Injection uses a unique scriptId marker:
//   <!-- ghl-agent:schema:FAQ:2025-04-16 -->
// This ensures idempotency — we never inject the same script twice.
// ============================================================

import type { AgentAction, BackupData } from '../../types'
import type { SchemaInjectPayload, ScriptInjectPayload } from '../../types'
import {
  GHLClient,
  type GHLFunnelPageUpdatePayload,
  type GHLSitePageUpdate,
} from '../ghl/ghlClient'
import { query, queryOne } from '@/lib/db'

const log = (msg: string) => console.log(`[ScriptInject] ${new Date().toISOString()} ${msg}`)

// Marker prefix to identify agent-injected scripts
const AGENT_MARKER_PREFIX = 'ghl-agent'

// ── Build the script to inject ────────────────────────────

export function buildSchemaScript(payload: SchemaInjectPayload, scriptId: string): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': payload.schemaType,
    ...payload.jsonLd,
  }

  return [
    `<!-- ${AGENT_MARKER_PREFIX}:schema:${payload.schemaType}:${scriptId} -->`,
    `<script type="application/ld+json">`,
    JSON.stringify(jsonLd, null, 2),
    `</script>`,
    `<!-- /${AGENT_MARKER_PREFIX}:schema:${payload.schemaType} -->`,
  ].join('\n')
}

export function buildCustomScript(payload: ScriptInjectPayload): string {
  return [
    `<!-- ${AGENT_MARKER_PREFIX}:script:${payload.scriptId} -->`,
    payload.code,
    `<!-- /${AGENT_MARKER_PREFIX}:script:${payload.scriptId} -->`,
  ].join('\n')
}

// ── Check idempotency ─────────────────────────────────────

function alreadyInjected(existingCode: string | null, marker: string): boolean {
  if (!existingCode) return false
  return existingCode.includes(`<!-- ${AGENT_MARKER_PREFIX}:${marker}`)
}

// ── Remove old injection by marker (for updates) ─────────

function removeInjection(code: string, markerType: string): string {
  // Removes everything between <!-- ghl-agent:X --> and <!-- /ghl-agent:X -->
  const pattern = new RegExp(
    `<!-- ${AGENT_MARKER_PREFIX}:${escapeRegex(markerType)}[^>]*-->[\\s\\S]*?<!-- \\/${AGENT_MARKER_PREFIX}:${escapeRegex(markerType)} -->`,
    'g',
  )
  return code.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Apply injection to a page ──────────────────────────────

export interface ScriptInjectionResult {
  success: boolean
  previousCode: string | null
  newCode: string | null
  target: 'head' | 'body'
  skipped?: boolean
  skipReason?: string
  errorMessage?: string
}

export async function applyScriptInjection(
  action: AgentAction,
  client: GHLClient,
  siteId: number,
): Promise<ScriptInjectionResult> {
  // Determine what we're injecting
  let scriptCode: string
  let target: 'head' | 'body'
  let markerKey: string

  if (action.actionType === 'inject_schema') {
    const payload = action.payload as SchemaInjectPayload
    const scriptId = new Date().toISOString().slice(0, 10)
    scriptCode = buildSchemaScript(payload, scriptId)
    target = 'head'
    markerKey = `schema:${payload.schemaType}`
  } else {
    const payload = action.payload as ScriptInjectPayload
    scriptCode = buildCustomScript(payload)
    target = payload.target
    markerKey = `script:${payload.scriptId}`
  }

  // Get current code from cache
  const cached = await queryOne<{
    head_code: string | null
    body_code: string | null
    ghl_page_type: string
  }>(`
    SELECT head_code, body_code, ghl_page_type
    FROM ghl_pages WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteId, action.ghlPageId])

  if (!cached) {
    return {
      success: false, previousCode: null, newCode: null, target,
      errorMessage: `Page ${action.ghlPageId} not in cache`,
    }
  }

  const currentCode = target === 'head' ? cached.head_code : cached.body_code

  // Idempotency check
  if (alreadyInjected(currentCode, markerKey)) {
    log(`  Skipped: ${markerKey} already injected on ${action.path}`)
    return {
      success: true,
      previousCode: currentCode,
      newCode: currentCode,
      target,
      skipped: true,
      skipReason: 'Already injected',
    }
  }

  // Clean up any old version of the same injection type
  let baseCode = currentCode ?? ''
  if (action.actionType === 'inject_schema') {
    const payload = action.payload as SchemaInjectPayload
    baseCode = removeInjection(baseCode, `schema:${payload.schemaType}`)
  }

  const newCode = baseCode ? `${baseCode}\n\n${scriptCode}` : scriptCode

  log(`Injecting ${markerKey} into ${target} of ${action.path} (${cached.ghl_page_type})`)

  try {
    const pageType = cached.ghl_page_type as 'funnel' | 'blog' | 'website' | 'landing'

    switch (pageType) {
      case 'funnel': {
        const updates: Partial<GHLFunnelPageUpdatePayload> = {}
        if (target === 'head') updates.headTrackingCode = newCode
        else updates.bodyTrackingCode = newCode
        await client.updateFunnelPage(action.ghlPageId, updates)
        break
      }

      case 'website':
      case 'landing': {
        const updates: Partial<GHLSitePageUpdate> = {}
        if (target === 'head') updates.headTrackingCode = newCode
        else updates.bodyTrackingCode = newCode
        await client.updateSitePage(action.ghlPageId, updates)
        break
      }

      case 'blog':
        // Blog posts don't have head/body tracking code in GHL API
        // Return fallback info so action engine can provide manual instructions
        return {
          success: false, previousCode: currentCode, newCode: null, target,
          errorMessage: 'Blog posts do not support script injection via GHL API. Use HTML patch fallback.',
        }
    }

    // Update local cache
    const col = target === 'head' ? 'head_code' : 'body_code'
    await query(`
      UPDATE ghl_pages SET ${col} = $3, updated_at = NOW()
      WHERE site_id = $1 AND ghl_page_id = $2
    `, [siteId, action.ghlPageId, newCode])

    log(`  ✓ Injected ${markerKey} into ${target} of ${action.path}`)

    return { success: true, previousCode: currentCode, newCode, target }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`  ✗ Script injection failed: ${message}`)
    return { success: false, previousCode: currentCode, newCode: null, target, errorMessage: message }
  }
}

// ── Backup before injection ────────────────────────────────

export async function buildInjectionBackup(
  action: AgentAction,
  siteId: number,
): Promise<BackupData> {
  const row = await queryOne<{
    title: string | null
    meta_title: string | null
    meta_description: string | null
    head_code: string | null
    body_code: string | null
  }>(`
    SELECT title, meta_title, meta_description, head_code, body_code
    FROM ghl_pages WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteId, action.ghlPageId])

  return {
    ghlPageId:       action.ghlPageId,
    snapshotAt:      new Date().toISOString(),
    title:           row?.title ?? null,
    metaTitle:       row?.meta_title ?? null,
    metaDescription: row?.meta_description ?? null,
    headCode:        row?.head_code ?? null,
    bodyCode:        row?.body_code ?? null,
  }
}

// ── Rollback: restore previous head/body code ─────────────

export async function rollbackInjection(
  ghlPageId: string,
  backup: BackupData,
  client: GHLClient,
  siteId: number,
): Promise<void> {
  const pageType = await queryOne<{ ghl_page_type: string }>(`
    SELECT ghl_page_type FROM ghl_pages WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteId, ghlPageId])

  if (!pageType) return

  const type = pageType.ghl_page_type

  if (type === 'funnel') {
    await client.updateFunnelPage(ghlPageId, {
      headTrackingCode: backup.headCode ?? '',
      bodyTrackingCode: backup.bodyCode ?? '',
    })
  } else if (type === 'website' || type === 'landing') {
    await client.updateSitePage(ghlPageId, {
      headTrackingCode: backup.headCode ?? '',
      bodyTrackingCode: backup.bodyCode ?? '',
    })
  }

  await query(`
    UPDATE ghl_pages SET head_code = $3, body_code = $4, updated_at = NOW()
    WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteId, ghlPageId, backup.headCode, backup.bodyCode])

  log(`Rolled back script injection on ${ghlPageId}`)
}
