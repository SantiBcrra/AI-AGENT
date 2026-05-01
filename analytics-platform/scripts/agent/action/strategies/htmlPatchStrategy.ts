// ============================================================
// STRATEGY 3: HTML PATCH (FALLBACK)
// When direct API or script injection can't do the job
// (e.g., updating visible text, CTA buttons, H1 headings),
// this strategy generates a JS snippet that modifies the DOM
// at runtime. It's injected into the body tracking code.
//
// This is the fallback for:
//   - Updating H1/headings visible to users
//   - Changing CTA button text
//   - Replacing intro section copy
//
// Trade-off: DOM manipulation runs client-side, so Google
// may see the original HTML. Best combined with direct API
// updates to title/meta when possible.
//
// Also generates "manual patch instructions" as a fallback
// when API access is not sufficient.
// ============================================================

import type { AgentAction, BackupData } from '../../types'
import type { CTAUpdatePayload, HtmlPatchPayload } from '../../types'
import { GHLClient, type GHLFunnelPageUpdatePayload, type GHLSitePageUpdate } from '../ghl/ghlClient'
import { query, queryOne } from '@/lib/db'

const log = (msg: string) => console.log(`[HtmlPatch] ${new Date().toISOString()} ${msg}`)

const AGENT_MARKER = 'ghl-agent:patch'

// ── Build DOM manipulation script ─────────────────────────

function buildDomPatchScript(
  selector: string,
  newContent: string,
  scriptId: string,
): string {
  // Escape for JS string literal
  const escapedSelector = selector.replace(/'/g, "\\'")
  const escapedContent  = newContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')

  return `<!-- ${AGENT_MARKER}:${scriptId} -->
<script>
(function() {
  function applyPatch() {
    var el = document.querySelector('${escapedSelector}');
    if (el && !el.dataset.agentPatched) {
      el.innerHTML = '${escapedContent}';
      el.dataset.agentPatched = '${scriptId}';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPatch);
  } else {
    applyPatch();
  }
})();
</script>
<!-- /${AGENT_MARKER}:${scriptId} -->`
}

function buildCtaPatchScript(
  selector: string,
  newText: string,
  newHref: string | undefined,
  scriptId: string,
): string {
  const escapedSelector = selector.replace(/'/g, "\\'")
  const escapedText     = newText.replace(/'/g, "\\'")
  const hrefLine = newHref
    ? `    if (el.tagName === 'A') el.href = '${newHref.replace(/'/g, "\\'")}';`
    : ''

  return `<!-- ${AGENT_MARKER}:cta:${scriptId} -->
<script>
(function() {
  function patchCTA() {
    // Target the most prominent CTA on the page
    var selectors = ['${escapedSelector}'];
    var found = false;
    for (var i = 0; i < selectors.length; i++) {
      var candidates = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < candidates.length; j++) {
        var el = candidates[j];
        // Skip if already patched or if it's a nav/header element
        if (el.dataset.agentPatched) continue;
        if (el.closest('nav, header, footer')) continue;
        // Only patch elements that look like CTAs
        var text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 60) {
          el.textContent = '${escapedText}';
${hrefLine}
          el.dataset.agentPatched = '${scriptId}';
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchCTA);
  } else {
    patchCTA();
  }
})();
</script>
<!-- /${AGENT_MARKER}:cta:${scriptId} -->`
}

// ── Generate manual patch instructions (fallback fallback) ─

export function generateManualInstructions(action: AgentAction): string {
  const instructions: string[] = [
    `=== MANUAL PATCH INSTRUCTIONS ===`,
    `Page: ${action.path} (GHL Page ID: ${action.ghlPageId})`,
    `Action: ${action.actionType}`,
    `Reason: ${action.reason}`,
    `Expected impact: ${action.expectedImpact}`,
    ``,
    `Steps:`,
  ]

  switch (action.actionType) {
    case 'update_page_title':
    case 'update_cta_text': {
      const p = action.payload as CTAUpdatePayload
      instructions.push(
        `1. Open GHL → Funnels/Websites → Find page "${action.path}"`,
        `2. Click "Edit Page"`,
        `3. Locate the element matching: ${p.selector}`,
        `4. Change the text to: "${p.newText}"`,
        `5. Save and publish the page`,
      )
      break
    }

    case 'patch_html_section': {
      const p = action.payload as HtmlPatchPayload
      instructions.push(
        `1. Open GHL → Funnels/Websites → Find page "${action.path}"`,
        `2. Click "Edit Page"`,
        `3. Locate the section matching: ${p.selector}`,
        `4. Replace the content with:`,
        ``,
        p.newContent || p.fullSectionHtml || '[Content not generated]',
        ``,
        `5. Save and publish the page`,
      )
      break
    }
  }

  return instructions.join('\n')
}

// ── Apply HTML patch ───────────────────────────────────────

export interface HtmlPatchResult {
  success: boolean
  method: 'dom_injection' | 'manual_instructions_only'
  patchScript?: string
  manualInstructions?: string
  previousBodyCode?: string | null
  errorMessage?: string
}

export async function applyHtmlPatch(
  action: AgentAction,
  client: GHLClient,
  siteId: number,
): Promise<HtmlPatchResult> {
  const scriptId = `${action.actionType}-${Date.now()}`

  let patchScript: string

  if (action.actionType === 'update_cta_text' || action.actionType === 'update_page_title') {
    const p = action.payload as CTAUpdatePayload
    if (!p.newText) {
      return {
        success: false,
        method: 'manual_instructions_only',
        manualInstructions: generateManualInstructions(action),
        errorMessage: 'No content generated for CTA patch',
      }
    }
    patchScript = buildCtaPatchScript(p.selector, p.newText, p.newHref, scriptId)

  } else {
    const p = action.payload as HtmlPatchPayload
    if (!p.newContent && !p.fullSectionHtml) {
      return {
        success: false,
        method: 'manual_instructions_only',
        manualInstructions: generateManualInstructions(action),
        errorMessage: 'No content generated for HTML patch',
      }
    }
    const content = p.fullSectionHtml ?? p.newContent
    patchScript = buildDomPatchScript(p.selector, content, scriptId)
  }

  // Get current body code
  const cached = await queryOne<{
    body_code: string | null
    ghl_page_type: string
  }>(`
    SELECT body_code, ghl_page_type FROM ghl_pages
    WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteId, action.ghlPageId])

  if (!cached) {
    return {
      success: false,
      method: 'manual_instructions_only',
      manualInstructions: generateManualInstructions(action),
      patchScript,
      errorMessage: `Page ${action.ghlPageId} not found in cache`,
    }
  }

  const currentBody = cached.body_code ?? ''
  const newBody = currentBody ? `${currentBody}\n\n${patchScript}` : patchScript

  log(`Applying DOM patch for ${action.actionType} on ${action.path} (${cached.ghl_page_type})`)

  try {
    const pageType = cached.ghl_page_type as string

    if (pageType === 'funnel') {
      await client.updateFunnelPage(action.ghlPageId, {
        bodyTrackingCode: newBody,
      } as Partial<GHLFunnelPageUpdatePayload>)
    } else if (pageType === 'website' || pageType === 'landing') {
      await client.updateSitePage(action.ghlPageId, {
        bodyTrackingCode: newBody,
      } as Partial<GHLSitePageUpdate>)
    } else {
      // Blog pages don't support body injection; return manual instructions
      return {
        success: false,
        method: 'manual_instructions_only',
        patchScript,
        manualInstructions: generateManualInstructions(action),
        previousBodyCode: currentBody,
        errorMessage: 'Blog pages do not support body code injection',
      }
    }

    // Update cache
    await query(`
      UPDATE ghl_pages SET body_code = $3, updated_at = NOW()
      WHERE site_id = $1 AND ghl_page_id = $2
    `, [siteId, action.ghlPageId, newBody])

    log(`  ✓ DOM patch injected on ${action.path}`)

    return {
      success: true,
      method: 'dom_injection',
      patchScript,
      previousBodyCode: currentBody,
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`  ✗ HTML patch failed: ${message}`)

    // Always provide manual instructions as fallback
    return {
      success: false,
      method: 'manual_instructions_only',
      patchScript,
      manualInstructions: generateManualInstructions(action),
      previousBodyCode: currentBody,
      errorMessage: message,
    }
  }
}

// ── Backup ────────────────────────────────────────────────

export async function buildHtmlPatchBackup(
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
