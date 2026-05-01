// ============================================================
// DECISION ENGINE — The brain of the agent
//
// Takes PageDiagnoses and produces a ranked list of AgentActions.
// Uses two modes:
//   1. Rule-based fast path: deterministic, high-confidence decisions
//   2. Claude AI path: for complex multi-issue pages or content generation
//
// Rules:
//   - Avoid conflicting changes on the same page
//   - Never apply more than MAX_ACTIONS_PER_SITE_PER_RUN total
//   - Prioritize by: severity → underperformance score → expected ROI
//   - Skip pages where strategy scores indicate past failures
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import type {
  PageDiagnosis,
  AgentAction,
  ActionType,
  ActionStrategy,
  PageIssue,
  PageMetrics,
  StrategyScore,
} from '../types'
import {
  THRESHOLDS,
  type MetaUpdatePayload,
  type SchemaInjectPayload,
  type CTAUpdatePayload,
  type HtmlPatchPayload,
} from '../types'
import { query } from '@/lib/db'

const log = (msg: string) => console.log(`[Decision] ${new Date().toISOString()} ${msg}`)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Strategy → best fit ────────────────────────────────────

function selectStrategy(actionType: ActionType): ActionStrategy {
  switch (actionType) {
    case 'update_meta_title':
    case 'update_meta_desc':
      return 'direct_api'           // GHL supports direct metadata updates
    case 'inject_schema':
    case 'inject_head_script':
    case 'inject_body_script':
      return 'script_injection'     // inject into head/body tracking code
    case 'update_page_title':
    case 'update_cta_text':
    case 'patch_html_section':
      return 'html_patch'           // patch visible HTML sections
    default:
      return 'fallback'
  }
}

// ── Impact scoring ─────────────────────────────────────────

function computeImpactScore(issue: PageIssue, metrics: PageMetrics): number {
  // 1-10 scale. Higher = higher priority
  let score = 0

  // Base from severity
  const severityBase = { critical: 8, high: 6, medium: 4, low: 2 }
  score += severityBase[issue.severity]

  // Bonus for volume (more impressions/visits = higher ROI)
  if (metrics.gscImpressions > 1000) score += 2
  else if (metrics.gscImpressions > 200) score += 1

  if (metrics.uniqueVisits > 200) score += 1

  // Bonus for easy wins
  if (issue.type === 'missing_schema') score += 0.5   // low effort, high reward
  if (issue.type === 'poor_meta') score += 0.5        // text-only change
  if (issue.type === 'low_ctr' && issue.metric === 'gsc_ctr') score += 1

  return Math.min(Math.round(score * 10) / 10, 10)
}

// ── Conflict detection ─────────────────────────────────────
// Ensure we don't generate conflicting changes for the same page

function hasConflict(existing: AgentAction[], newAction: AgentAction): boolean {
  return existing.some(a => {
    if (a.ghlPageId !== newAction.ghlPageId) return false
    // Two changes to the same meta type conflict
    if (
      (a.actionType === 'update_meta_title' && newAction.actionType === 'update_meta_title') ||
      (a.actionType === 'update_meta_desc' && newAction.actionType === 'update_meta_desc') ||
      (a.actionType === 'update_cta_text' && newAction.actionType === 'update_cta_text')
    ) return true
    // Injecting duplicate schema types conflict
    if (a.actionType === 'inject_schema' && newAction.actionType === 'inject_schema') {
      const aSchema = (a.payload as SchemaInjectPayload).schemaType
      const bSchema = (newAction.payload as SchemaInjectPayload).schemaType
      return aSchema === bSchema
    }
    return false
  })
}

// ── Load strategy scores (learning loop data) ─────────────

async function loadStrategyScores(siteId: number): Promise<Map<string, StrategyScore>> {
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
    WHERE site_id = $1
  `, [siteId])

  const map = new Map<string, StrategyScore>()
  for (const r of rows) {
    const key = `${r.action_type}::${r.trigger_metric}`
    map.set(key, {
      actionType: r.action_type as ActionType,
      triggerMetric: r.trigger_metric,
      totalApplied: parseInt(r.total_applied, 10),
      totalEffective: parseInt(r.total_effective, 10),
      totalFailed: parseInt(r.total_failed, 10),
      avgMetricDelta: parseFloat(r.avg_metric_delta),
      confidenceScore: parseFloat(r.confidence_score),
    })
  }
  return map
}

// ── Determine best schema type for a page ──────────────────

function inferSchemaType(metrics: PageMetrics): SchemaInjectPayload['schemaType'] {
  const path = metrics.path.toLowerCase()
  if (path.includes('/product') || path.includes('/producto') || path.includes('/item')) {
    return 'Product'
  }
  if (path.includes('/faq') || path.includes('/pregunta') || path.includes('/ayuda')) {
    return 'FAQ'
  }
  if (path.includes('/blog') || path.includes('/post') || path.includes('/articulo') || path.includes('/noticia')) {
    return 'Article'
  }
  if (path.includes('/review') || path.includes('/reseña') || path.includes('/opinion')) {
    return 'Review'
  }
  if (path.includes('/video')) {
    return 'VideoObject'
  }
  // Default: LocalBusiness for landing pages
  return 'LocalBusiness'
}

// ── Rule-based decision for single high-confidence issues ──

function makeRuleBasedAction(
  issue: PageIssue,
  metrics: PageMetrics,
  strategyScores: Map<string, StrategyScore>,
): AgentAction | null {
  const key = `${issue.suggestedAction}::${issue.metric}`
  const score = strategyScores.get(key)

  // Skip if we have enough data and this strategy has been ineffective
  if (score && score.totalApplied >= 3 && score.confidenceScore < 0.3) {
    log(`  Skipping ${issue.suggestedAction} for ${metrics.path} — low confidence (${score.confidenceScore.toFixed(2)})`)
    return null
  }

  const actionType = issue.suggestedAction
  const strategy = selectStrategy(actionType)
  const impactScore = computeImpactScore(issue, metrics)

  const base = {
    actionType,
    strategy,
    ghlPageId: metrics.ghlPageId!,
    path: metrics.path,
    triggerIssue: issue.type,
    triggerMetric: issue.metric,
    triggerValue: issue.value,
    triggerThreshold: issue.threshold,
    reason: issue.message,
    expectedImpact: '',
    impactScore,
  }

  switch (actionType) {
    case 'update_meta_title':
      return {
        ...base,
        expectedImpact: `Improve GSC CTR from ${(metrics.gscCtr * 100).toFixed(2)}% toward 3-5% target`,
        payload: {
          type: 'meta',
          metaTitle: '',              // filled by Claude in AI pass
        } as MetaUpdatePayload,
      }

    case 'update_meta_desc':
      return {
        ...base,
        expectedImpact: `Improve CTR through more compelling description with clear value prop`,
        payload: {
          type: 'meta',
          metaDescription: '',        // filled by Claude
        } as MetaUpdatePayload,
      }

    case 'inject_schema': {
      const schemaType = inferSchemaType(metrics)
      return {
        ...base,
        expectedImpact: `Unlock ${schemaType} rich results, potentially +20-35% CTR boost`,
        payload: {
          type: 'schema',
          schemaType,
          jsonLd: {},                  // filled by Claude
        } as SchemaInjectPayload,
      }
    }

    case 'update_cta_text':
      return {
        ...base,
        expectedImpact: `Improve CTA click rate from ${(metrics.ctaClickRate * 100).toFixed(2)}% toward 5-8%`,
        payload: {
          type: 'cta',
          selector: 'a[href], button',  // will be refined
          newText: '',                   // filled by Claude
        } as CTAUpdatePayload,
      }

    case 'update_page_title':
      return {
        ...base,
        expectedImpact: `Reduce bounce rate from ${metrics.bounceRate}% by improving content-intent match`,
        payload: {
          type: 'cta',
          selector: 'h1',
          newText: '',                   // filled by Claude
        } as CTAUpdatePayload,
      }

    case 'patch_html_section':
      return {
        ...base,
        expectedImpact: `Increase avg scroll depth from ${metrics.avgScrollDepthPct}% and reduce bounce rate`,
        payload: {
          type: 'html_patch',
          selector: 'section:first-of-type, .hero, [class*="intro"]',
          newContent: '',              // filled by Claude
        } as HtmlPatchPayload,
      }

    default:
      return null
  }
}

// ── Claude AI pass: fills content + handles complex cases ──

async function enrichActionsWithClaude(
  actions: AgentAction[],
  diagnoses: PageDiagnosis[],
  domain: string,
): Promise<AgentAction[]> {
  if (actions.length === 0) return []

  const diagByPage = new Map(diagnoses.map(d => [d.metrics.ghlPageId, d]))

  const enriched: AgentAction[] = []

  for (const action of actions) {
    const diagnosis = diagByPage.get(action.ghlPageId)
    if (!diagnosis) {
      enriched.push(action)
      continue
    }

    const m = diagnosis.metrics

    try {
      const enrichedAction = await generateContent(action, m, domain)
      enriched.push(enrichedAction)
    } catch (err) {
      log(`  Claude enrichment failed for ${action.path}: ${err instanceof Error ? err.message : String(err)}`)
      enriched.push(action)  // keep action without content, action engine will fallback
    }

    // Rate limit Claude calls
    await new Promise(r => setTimeout(r, 500))
  }

  return enriched
}

async function generateContent(
  action: AgentAction,
  metrics: PageMetrics,
  domain: string,
): Promise<AgentAction> {
  const prompt = buildContentPrompt(action, metrics, domain)

  const response = await anthropic.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: 'You are a CRO and SEO expert. Respond with valid JSON only. No markdown, no explanation.',
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return action

  const generated = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  const updated = { ...action }

  switch (action.actionType) {
    case 'update_meta_title':
    case 'update_meta_desc': {
      const p = { ...(action.payload as MetaUpdatePayload) }
      if (generated.meta_title)       p.metaTitle       = String(generated.meta_title)
      if (generated.meta_description) p.metaDescription = String(generated.meta_description)
      updated.payload = p
      break
    }

    case 'inject_schema': {
      const p = { ...(action.payload as SchemaInjectPayload) }
      if (generated.json_ld && typeof generated.json_ld === 'object') {
        p.jsonLd = generated.json_ld as Record<string, unknown>
        // Ensure @context and @type
        p.jsonLd['@context'] = 'https://schema.org'
        p.jsonLd['@type'] = p.schemaType
      }
      updated.payload = p
      break
    }

    case 'update_cta_text':
    case 'update_page_title': {
      const p = { ...(action.payload as CTAUpdatePayload) }
      if (generated.text) p.newText = String(generated.text)
      if (generated.selector) p.selector = String(generated.selector)
      updated.payload = p
      break
    }

    case 'patch_html_section': {
      const p = { ...(action.payload as HtmlPatchPayload) }
      if (generated.html) p.newContent = String(generated.html)
      if (generated.selector) p.selector = String(generated.selector)
      updated.payload = p
      break
    }
  }

  return updated
}

function buildContentPrompt(action: AgentAction, m: PageMetrics, domain: string): string {
  const context = `
Site: ${domain}
Page: ${m.path} (title: "${m.title ?? 'unknown'}")
Visits (28d): ${m.uniqueVisits} | Bounce rate: ${m.bounceRate}% | Avg duration: ${m.avgDurationSec}s
GSC CTR: ${(m.gscCtr * 100).toFixed(2)}% | GSC impressions: ${m.gscImpressions} | Position: ${m.gscPosition}
Avg scroll: ${m.avgScrollDepthPct}% | CTA click rate: ${(m.ctaClickRate * 100).toFixed(2)}%
Problem: ${action.reason}
`.trim()

  switch (action.actionType) {
    case 'update_meta_title':
      return `${context}

Generate an optimized meta title for this page. Rules:
- 50-60 characters max
- Include primary keyword naturally
- Be specific and compelling
- Avoid clickbait
- Match the page's apparent intent

Respond with JSON: {"meta_title": "..."}`

    case 'update_meta_desc':
      return `${context}

Generate an optimized meta description for this page. Rules:
- 140-160 characters max
- Include a clear value proposition
- End with an implicit call to action
- Match the page's intent
- Naturally include 1-2 relevant keywords

Respond with JSON: {"meta_description": "..."}`

    case 'inject_schema': {
      const schemaType = (action.payload as SchemaInjectPayload).schemaType
      return `${context}

Generate a JSON-LD schema for type "${schemaType}" for this page.
- Use real-looking but generic placeholder data appropriate for the page
- Keep it minimal but complete (required fields only)
- For LocalBusiness include name, description, url
- For FAQ include at least 3 Q&A pairs inferred from the page path/title
- For Product include name, description, offers (with price placeholder)

Respond with JSON: {"json_ld": { ... the schema object ... }}`
    }

    case 'update_cta_text':
      return `${context}

Generate improved CTA button text for this page.
The CTA click rate is very low (${(m.ctaClickRate * 100).toFixed(2)}%).
- Make it action-oriented and specific
- 2-5 words max
- Create urgency or communicate value
- Suggest the most appropriate CSS selector to target the CTA

Respond with JSON: {"text": "...", "selector": "..."}`

    case 'update_page_title':
      return `${context}

Generate an improved H1 headline for this page.
Bounce rate is ${m.bounceRate}% — users leave immediately after landing.
- Make it clear, specific, and benefit-focused
- Match what users searching for this page likely want
- 5-12 words max
- No hype or vague claims

Respond with JSON: {"text": "...", "selector": "h1"}`

    case 'patch_html_section':
      return `${context}

The intro section of this page has very low engagement (${m.avgScrollDepthPct}% avg scroll, ${m.avgDurationSec}s avg time).
Generate improved intro section HTML. Rules:
- Replace only the first visible section/hero
- Keep the same structure (div > h2 + p)
- Write a compelling headline + 2-3 short sentences
- Include a benefit statement
- No inline styles, use existing class names if possible
- Target the first hero/intro section

Respond with JSON: {"html": "<div>...</div>", "selector": "section:first-of-type, .hero, [class*='hero'], [class*='intro']"}`

    default:
      return `${context}\nGenerate appropriate content for this action. Respond with JSON: {}`
  }
}

// ── Main decision function ─────────────────────────────────

export async function decideActions(
  diagnoses: PageDiagnosis[],
  siteId: number,
  domain: string,
  maxActions: number = THRESHOLDS.MAX_ACTIONS_PER_SITE_PER_RUN,
): Promise<AgentAction[]> {
  const strategyScores = await loadStrategyScores(siteId)
  const decidedActions: AgentAction[] = []

  // Only process pages that have a known GHL page ID
  const actionable = diagnoses
    .filter(d => d.needsAction && d.metrics.ghlPageId !== null)
    .slice(0, 10)   // consider top 10 at most

  log(`Considering ${actionable.length} actionable pages...`)

  for (const diagnosis of actionable) {
    if (decidedActions.length >= maxActions) break

    const m = diagnosis.metrics

    // Pick the single highest-priority issue per page
    // (avoid multiple changes to the same page in one run)
    const issues = diagnosis.issues.sort((a, b) => {
      const si = ['critical', 'high', 'medium', 'low'].indexOf(a.severity)
      const sj = ['critical', 'high', 'medium', 'low'].indexOf(b.severity)
      if (si !== sj) return si - sj
      return computeImpactScore(b, m) - computeImpactScore(a, m)
    })

    for (const issue of issues) {
      const action = makeRuleBasedAction(issue, m, strategyScores)
      if (!action) continue
      if (hasConflict(decidedActions, action)) continue

      decidedActions.push(action)
      log(`  + ${action.actionType} on ${m.path} (score=${action.impactScore}, trigger=${issue.metric}=${issue.value})`)
      break  // one action per page per run
    }
  }

  // AI enrichment: fill in the actual content values
  log(`Enriching ${decidedActions.length} actions with Claude...`)
  const enriched = await enrichActionsWithClaude(decidedActions, diagnoses, domain)

  // Filter out actions where content generation failed (empty payload)
  const valid = enriched.filter(a => {
    switch (a.actionType) {
      case 'update_meta_title':
      case 'update_meta_desc': {
        const p = a.payload as MetaUpdatePayload
        return !!(p.metaTitle || p.metaDescription)
      }
      case 'inject_schema':
        return Object.keys((a.payload as SchemaInjectPayload).jsonLd).length > 1
      case 'update_cta_text':
      case 'update_page_title':
        return !!((a.payload as CTAUpdatePayload).newText)
      case 'patch_html_section':
        return !!((a.payload as HtmlPatchPayload).newContent)
      default:
        return true
    }
  })

  log(`Decision complete: ${valid.length} valid actions out of ${decidedActions.length} decided`)
  return valid
}
