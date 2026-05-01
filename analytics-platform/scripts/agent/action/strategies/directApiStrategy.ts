// ============================================================
// STRATEGY 1: DIRECT API UPDATE
// Updates metadata (title, meta description) directly via GHL API.
// Most reliable strategy — uses officially supported endpoints.
// Works for: funnel pages, blog posts, website pages.
// ============================================================

import type { AgentAction, BackupData } from '../../types'
import type { MetaUpdatePayload } from '../../types'
import {
  GHLClient,
  type GHLFunnelPageUpdatePayload,
  type GHLBlogPostUpdate,
  type GHLSitePageUpdate,
} from '../ghl/ghlClient'
import { query, queryOne } from '@/lib/db'

const log = (msg: string) => console.log(`[DirectAPI] ${new Date().toISOString()} ${msg}`)

export interface DirectApiResult {
  success: boolean
  previousValues: Record<string, string | null>
  appliedValues: Record<string, string | null>
  errorMessage?: string
}

// ── Get the page type so we call the right endpoint ───────

async function getPageType(
  siteId: number,
  ghlPageId: string,
): Promise<'funnel' | 'blog' | 'website' | 'landing' | null> {
  const row = await queryOne<{ ghl_page_type: string }>(`
    SELECT ghl_page_type FROM ghl_pages
    WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteId, ghlPageId])

  return (row?.ghl_page_type as 'funnel' | 'blog' | 'website' | 'landing') ?? null
}

// ── Execute meta update ────────────────────────────────────

export async function applyDirectApiUpdate(
  action: AgentAction,
  client: GHLClient,
  siteId: number,
): Promise<DirectApiResult> {
  const payload = action.payload as MetaUpdatePayload
  const pageType = await getPageType(siteId, action.ghlPageId)

  if (!pageType) {
    return {
      success: false,
      previousValues: {},
      appliedValues: {},
      errorMessage: `Page ${action.ghlPageId} not found in ghl_pages cache`,
    }
  }

  log(`Updating metadata on ${pageType} page ${action.ghlPageId} (${action.path})`)

  const previous: Record<string, string | null> = {}
  const applied: Record<string, string | null> = {}

  try {
    switch (pageType) {
      case 'funnel': {
        const current = await client.getFunnelPage(action.ghlPageId)
        previous.metaTitle       = current.title ?? null
        previous.metaDescription = current.metaDescription ?? null

        const updates: Partial<GHLFunnelPageUpdatePayload> = {}
        if (payload.metaTitle)       updates.title           = payload.metaTitle
        if (payload.metaDescription) updates.metaDescription = payload.metaDescription

        await client.updateFunnelPage(action.ghlPageId, updates)
        if (payload.metaTitle)       applied.metaTitle       = payload.metaTitle
        if (payload.metaDescription) applied.metaDescription = payload.metaDescription
        break
      }

      case 'blog': {
        const blogRow = await queryOne<{ ghl_funnel_id: string | null }>(`
          SELECT ghl_funnel_id FROM ghl_pages
          WHERE site_id = $1 AND ghl_page_id = $2
        `, [siteId, action.ghlPageId])
        const blogId = blogRow?.ghl_funnel_id
        if (!blogId) {
          return {
            success: false,
            previousValues: {},
            appliedValues: {},
            errorMessage:
              'Blog parent id missing in cache (ghl_funnel_id). Run GHL sync so blog posts include blogId.',
          }
        }

        const current = await client.getBlogPost(action.ghlPageId)
        previous.metaTitle       = current.metaTitle ?? null
        previous.metaDescription = current.metaDescription ?? null

        const updates: Partial<GHLBlogPostUpdate> = {}
        if (payload.metaTitle)       updates.metaTitle       = payload.metaTitle
        if (payload.metaDescription) updates.metaDescription = payload.metaDescription

        await client.updateBlogPost(action.ghlPageId, updates, blogId)
        if (payload.metaTitle)       applied.metaTitle       = payload.metaTitle
        if (payload.metaDescription) applied.metaDescription = payload.metaDescription
        break
      }

      case 'website':
      case 'landing': {
        const current = await client.getSitePage(action.ghlPageId)
        previous.metaTitle       = current.title ?? null
        previous.metaDescription = current.metaDescription ?? null

        const updates: Partial<GHLSitePageUpdate> = {}
        if (payload.metaTitle)       updates.title           = payload.metaTitle
        if (payload.metaDescription) updates.metaDescription = payload.metaDescription

        await client.updateSitePage(action.ghlPageId, updates)
        if (payload.metaTitle)       applied.metaTitle       = payload.metaTitle
        if (payload.metaDescription) applied.metaDescription = payload.metaDescription
        break
      }
    }

    // Update the local cache
    await query(`
      UPDATE ghl_pages
      SET
        meta_title       = COALESCE($3, meta_title),
        meta_description = COALESCE($4, meta_description),
        updated_at       = NOW()
      WHERE site_id = $1 AND ghl_page_id = $2
    `, [siteId, action.ghlPageId, applied.metaTitle ?? null, applied.metaDescription ?? null])

    log(`  ✓ Updated ${Object.keys(applied).join(', ')} on ${action.path}`)

    return { success: true, previousValues: previous, appliedValues: applied }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`  ✗ Direct API update failed: ${message}`)
    return { success: false, previousValues: previous, appliedValues: applied, errorMessage: message }
  }
}

// ── Build a backup record ──────────────────────────────────

export async function buildDirectApiBackup(
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
    FROM ghl_pages
    WHERE site_id = $1 AND ghl_page_id = $2
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
