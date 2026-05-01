// ============================================================
// DIAGNOSTIC ENGINE
// Receives PageMetrics and produces structured PageDiagnoses.
// Each diagnosis lists all detected issues with severity,
// the specific metric that triggered them, and a suggested action.
// ============================================================

import type {
  PageMetrics,
  PageDiagnosis,
  PageIssue,
  IssueType,
  IssueSeverity,
  ActionType,
} from '../types'
import { THRESHOLDS } from '../types'

const SEVERITY_ORDER: IssueSeverity[] = ['critical', 'high', 'medium', 'low']

function highestSeverity(issues: PageIssue[]): IssueSeverity {
  for (const s of SEVERITY_ORDER) {
    if (issues.some(i => i.severity === s)) return s
  }
  return 'low'
}

function makeIssue(
  type: IssueType,
  severity: IssueSeverity,
  metric: string,
  value: number,
  threshold: number,
  message: string,
  suggestedAction: ActionType,
): PageIssue {
  return { type, severity, metric, value, threshold, message, suggestedAction }
}

// ── Individual detectors ───────────────────────────────────

function detectLowCTR(m: PageMetrics): PageIssue | null {
  if (m.gscImpressions < THRESHOLDS.MIN_IMPRESSIONS_FOR_CTR) return null

  if (m.gscCtr < THRESHOLDS.CTR_CRITICAL) {
    return makeIssue(
      'low_ctr', 'critical',
      'gsc_ctr', m.gscCtr, THRESHOLDS.CTR_CRITICAL,
      `CTR is ${(m.gscCtr * 100).toFixed(2)}% with ${m.gscImpressions.toLocaleString()} impressions — critically low. Title/description not compelling enough.`,
      'update_meta_title',
    )
  }
  if (m.gscCtr < THRESHOLDS.CTR_LOW) {
    return makeIssue(
      'low_ctr', 'high',
      'gsc_ctr', m.gscCtr, THRESHOLDS.CTR_LOW,
      `CTR is ${(m.gscCtr * 100).toFixed(2)}% — below the 2% benchmark. Meta title or description likely needs improvement.`,
      'update_meta_title',
    )
  }
  return null
}

function detectHighBounce(m: PageMetrics): PageIssue | null {
  if (m.sessions < THRESHOLDS.MIN_VISITS_FOR_ANALYSIS) return null

  if (m.bounceRate > THRESHOLDS.BOUNCE_CRITICAL) {
    return makeIssue(
      'high_bounce', 'critical',
      'bounce_rate', m.bounceRate, THRESHOLDS.BOUNCE_CRITICAL,
      `Bounce rate is ${m.bounceRate}% — users are leaving immediately. Intro content, load speed, or misaligned expectations.`,
      'update_page_title',
    )
  }
  if (m.bounceRate > THRESHOLDS.BOUNCE_HIGH) {
    return makeIssue(
      'high_bounce', 'high',
      'bounce_rate', m.bounceRate, THRESHOLDS.BOUNCE_HIGH,
      `Bounce rate is ${m.bounceRate}% — above the 65% threshold. Page content or CTA may not match user intent.`,
      'update_cta_text',
    )
  }
  return null
}

function detectLowScroll(m: PageMetrics): PageIssue | null {
  if (m.sessions < THRESHOLDS.MIN_VISITS_FOR_ANALYSIS) return null

  if (m.avgScrollDepthPct < THRESHOLDS.SCROLL_CRITICAL) {
    return makeIssue(
      'low_scroll', 'high',
      'avg_scroll_depth_pct', m.avgScrollDepthPct, THRESHOLDS.SCROLL_CRITICAL,
      `Average scroll depth is only ${m.avgScrollDepthPct}%. Users stop reading almost immediately — intro section likely needs rewriting.`,
      'patch_html_section',
    )
  }
  if (m.avgScrollDepthPct < THRESHOLDS.SCROLL_LOW) {
    return makeIssue(
      'low_scroll', 'medium',
      'avg_scroll_depth_pct', m.avgScrollDepthPct, THRESHOLDS.SCROLL_LOW,
      `Average scroll depth is ${m.avgScrollDepthPct}% — below 35%. Content structure or hook may need improvement.`,
      'patch_html_section',
    )
  }
  return null
}

function detectLowEngagement(m: PageMetrics): PageIssue | null {
  if (m.sessions < THRESHOLDS.MIN_VISITS_FOR_ANALYSIS) return null

  if (m.avgDurationSec < THRESHOLDS.DURATION_CRITICAL) {
    return makeIssue(
      'low_engagement', 'critical',
      'avg_duration_sec', m.avgDurationSec, THRESHOLDS.DURATION_CRITICAL,
      `Average time on page is only ${m.avgDurationSec}s — users are not reading. Content or page load may be the issue.`,
      'patch_html_section',
    )
  }
  if (m.avgDurationSec < THRESHOLDS.DURATION_LOW) {
    return makeIssue(
      'low_engagement', 'medium',
      'avg_duration_sec', m.avgDurationSec, THRESHOLDS.DURATION_LOW,
      `Average time on page is ${m.avgDurationSec}s — low engagement. Content density or readability may need improvement.`,
      'patch_html_section',
    )
  }
  return null
}

function detectWeakCTA(m: PageMetrics): PageIssue | null {
  // Only flag if we have actual session data and low CTA performance
  if (m.sessions < THRESHOLDS.MIN_VISITS_FOR_ANALYSIS) return null
  if (m.interactions === 0) return null   // no interaction tracking on this page

  if (m.ctaClickRate < THRESHOLDS.CTA_CRITICAL && m.sessions >= 50) {
    return makeIssue(
      'weak_cta', 'high',
      'cta_click_rate', m.ctaClickRate, THRESHOLDS.CTA_CRITICAL,
      `CTA click rate is ${(m.ctaClickRate * 100).toFixed(2)}% across ${m.sessions} sessions. CTA text, placement, or visibility is likely the issue.`,
      'update_cta_text',
    )
  }
  if (m.ctaClickRate < THRESHOLDS.CTA_LOW && m.sessions >= 30) {
    return makeIssue(
      'weak_cta', 'medium',
      'cta_click_rate', m.ctaClickRate, THRESHOLDS.CTA_LOW,
      `CTA click rate is ${(m.ctaClickRate * 100).toFixed(2)}% — below 3%. Consider A/B testing CTA text or color.`,
      'update_cta_text',
    )
  }
  return null
}

function detectMissingSchema(m: PageMetrics): PageIssue | null {
  if (m.hasSchema) return null
  if (m.gscImpressions < 20 && m.uniqueVisits < 30) return null // not enough traffic to bother

  // Determine which schema type would be most appropriate based on path heuristics
  const path = m.path.toLowerCase()
  let message = 'No structured data (JSON-LD) detected on this page.'
  let action: ActionType = 'inject_schema'

  if (path.includes('/product') || path.includes('/producto') || path.includes('/shop')) {
    message = 'No Product schema detected. Adding it can unlock rich results in Google Shopping.'
  } else if (path.includes('/faq') || path.includes('/pregunta')) {
    message = 'No FAQ schema detected. FAQ rich results can significantly increase CTR.'
  } else if (path.includes('/blog') || path.includes('/post') || path.includes('/articulo')) {
    message = 'No Article schema detected. Can improve visibility in Google News and rich results.'
  } else if (path.includes('/review') || path.includes('/reseña') || path.includes('/opinion')) {
    message = 'No Review schema detected. Star ratings in SERP can boost CTR by 20-35%.'
  }

  return makeIssue(
    'missing_schema', 'medium',
    'has_schema', 0, 1,
    message,
    action,
  )
}

function detectPoorMeta(m: PageMetrics): PageIssue | null {
  // Flag when title/description are likely auto-generated or missing
  // We can only detect "poor" quality when we have a title to inspect
  if (!m.title) {
    return makeIssue(
      'poor_meta', 'medium',
      'meta_title', 0, 1,
      'No page title detected. This will hurt SEO rankings and SERP appearance.',
      'update_meta_title',
    )
  }

  const title = m.title.trim()

  // Generic/templated titles
  if (
    title.length < 10 ||
    /^(home|inicio|page|página|untitled|default)/i.test(title) ||
    title.length > 70
  ) {
    const issue =
      title.length < 10
        ? 'too short (< 10 chars)'
        : title.length > 70
        ? 'too long (> 70 chars, will be truncated in SERP)'
        : 'generic/templated (not descriptive)'

    return makeIssue(
      'poor_meta', 'medium',
      'meta_title', title.length, 1,
      `Meta title is ${issue}: "${title.slice(0, 50)}...". Optimized titles improve CTR by 15-30%.`,
      'update_meta_title',
    )
  }

  return null
}

function detectPoorMetaDesc(m: PageMetrics): PageIssue | null {
  // Only flag if page has real traffic — no point rewriting unseen pages
  if (m.gscImpressions < 20 && m.uniqueVisits < 30) return null

  // We get the description via the title field fallback; check for absence
  // The analytics engine stores meta_description as `title` when no H1 exists,
  // but ghlPageId being present means we have a cached GHL page with a description.
  // Flag when: no title at all (description field likely empty too) OR
  // the CTR is low and no schema — description is likely the culprit.
  if (m.gscCtr < THRESHOLDS.CTR_LOW && m.gscImpressions >= THRESHOLDS.MIN_IMPRESSIONS_FOR_CTR) {
    // Title may be fine but description may be pulling CTR down.
    // Only trigger if low CTR wasn't already captured by detectLowCTR
    // (detectLowCTR triggers update_meta_title; here we target the description).
    if (m.gscCtr >= THRESHOLDS.CTR_CRITICAL) {
      return makeIssue(
        'poor_meta', 'medium',
        'meta_description', m.gscCtr, THRESHOLDS.CTR_LOW,
        `CTR is ${(m.gscCtr * 100).toFixed(2)}% with ${m.gscImpressions.toLocaleString()} impressions. Meta description likely not compelling enough — rewriting it can recover 10-20% CTR.`,
        'update_meta_desc',
      )
    }
  }

  return null
}

function detectDeadPage(m: PageMetrics): PageIssue | null {
  // Traffic but zero interaction = content doesn't engage
  const hasTraffic = m.uniqueVisits >= 30
  const noInteraction = m.interactions === 0 && m.ctaClicks === 0
  const lowEngagement = m.avgDurationSec < 10 && m.avgScrollDepthPct < 15

  if (hasTraffic && noInteraction && lowEngagement) {
    return makeIssue(
      'dead_page', 'high',
      'interactions', 0, 1,
      `${m.uniqueVisits} visitors but zero tracked interactions and ${m.avgDurationSec}s avg time. Page is not engaging users at all.`,
      'patch_html_section',
    )
  }

  return null
}

function detectFunnelDropOff(m: PageMetrics): PageIssue | null {
  if (m.funnelDropOffRate > 70 && m.sessions >= 20) {
    return makeIssue(
      'funnel_drop_off', 'high',
      'funnel_drop_off_rate', m.funnelDropOffRate, 70,
      `${m.funnelDropOffRate}% of users leave from this page in funnel flows. CTA or friction may be the issue.`,
      'update_cta_text',
    )
  }
  return null
}

// ── Main diagnosis function ────────────────────────────────

export function diagnosePages(pages: PageMetrics[]): PageDiagnosis[] {
  return pages.map(m => {
    const potentialIssues: (PageIssue | null)[] = [
      detectDeadPage(m),         // dead page wins over all, check first
      detectHighBounce(m),
      detectLowCTR(m),
      detectPoorMetaDesc(m),     // after CTR check: targets description specifically
      detectLowScroll(m),
      detectLowEngagement(m),
      detectWeakCTA(m),
      detectMissingSchema(m),
      detectPoorMeta(m),
      detectFunnelDropOff(m),
    ]

    const issues = potentialIssues.filter((i): i is PageIssue => i !== null)
    const priority = issues.length > 0 ? highestSeverity(issues) : 'low'

    return {
      metrics: m,
      issues,
      priority,
      totalIssues: issues.length,
      needsAction: issues.length > 0 && priority !== 'low',
    }
  })
}

// ── Filter to pages that need action ───────────────────────

export function getActionableDiagnoses(diagnoses: PageDiagnosis[]): PageDiagnosis[] {
  return diagnoses
    .filter(d => d.needsAction && d.metrics.ghlPageId !== null)
    .sort((a, b) => {
      // Sort by severity then underperformance score
      const sa = SEVERITY_ORDER.indexOf(a.priority)
      const sb = SEVERITY_ORDER.indexOf(b.priority)
      if (sa !== sb) return sa - sb
      return b.metrics.underperformanceScore - a.metrics.underperformanceScore
    })
}

// ── Summary log ────────────────────────────────────────────

export function summarizeDiagnoses(diagnoses: PageDiagnosis[]): void {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
  const byType: Record<string, number> = {}

  for (const d of diagnoses) {
    bySeverity[d.priority]++
    for (const issue of d.issues) {
      byType[issue.type] = (byType[issue.type] ?? 0) + 1
    }
  }

  const actionable = diagnoses.filter(d => d.needsAction).length
  console.log(`[Diagnostic] ${diagnoses.length} pages diagnosed: ${actionable} need action`)
  console.log(`[Diagnostic] Severity: critical=${bySeverity.critical} high=${bySeverity.high} medium=${bySeverity.medium} low=${bySeverity.low}`)
  console.log(`[Diagnostic] Issue types: ${JSON.stringify(byType)}`)
}
