// ============================================================
// AGENT TYPES — Shared interfaces for the GHL AI Agent system
// ============================================================

// ── Site context ──────────────────────────────────────────────

export interface GHLSiteConfig {
  siteId: number
  domain: string
  locationId: string
  apiKey: string
  apiVersion: string
  maxChangesPerDay: number
  maxChangesPerPage: number
  cooldownHours: number
  agentEnabled: boolean
  dryRun: boolean
}

export interface GHLPage {
  id: number
  siteId: number
  ghlFunnelId: string | null
  ghlPageId: string
  ghlPageType: 'funnel' | 'website' | 'blog' | 'landing'
  title: string | null
  metaTitle: string | null
  metaDescription: string | null
  path: string | null
  fullUrl: string | null
  headCode: string | null
  bodyCode: string | null
  lastSyncedAt: Date | null
}

// ── Metrics ───────────────────────────────────────────────────

export interface PageMetrics {
  path: string
  title: string | null
  ghlPageId: string | null

  // Traffic (own tracker)
  uniqueVisits: number
  sessions: number
  bounces: number
  bounceRate: number            // 0-100

  // Engagement
  avgDurationSec: number
  avgScrollDepthPct: number     // 0-100
  interactions: number          // clicks + conversions + forms

  // CTA performance
  ctaClicks: number
  ctaClickRate: number          // ctaClicks / pageviews

  // Funnel
  funnelDropOffRate: number     // 0-100
  exitRate: number              // 0-100

  // GSC
  gscClicks: number
  gscImpressions: number
  gscCtr: number                // 0-1
  gscPosition: number           // 1-100+

  // Schema
  hasSchema: boolean
  schemaTypes: string[]         // ['Product', 'FAQ', ...]

  // Score (higher = more improvement needed)
  underperformanceScore: number
}

export interface SiteMetrics {
  siteId: number
  domain: string
  periodDays: number

  totalVisits: number
  avgBounceRate: number
  avgEngagementScore: number
  avgScrollDepth: number
  conversionRate: number

  topUnderperformingPages: PageMetrics[]
}

// ── Issues ────────────────────────────────────────────────────

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export type IssueType =
  | 'low_ctr'
  | 'high_bounce'
  | 'low_scroll'
  | 'low_engagement'
  | 'weak_cta'
  | 'missing_schema'
  | 'dead_page'
  | 'poor_meta'
  | 'no_outbound_links'
  | 'funnel_drop_off'
  | 'low_conversion'

export interface PageIssue {
  type: IssueType
  severity: IssueSeverity
  metric: string
  value: number
  threshold: number
  message: string
  suggestedAction: ActionType
}

export interface PageDiagnosis {
  metrics: PageMetrics
  issues: PageIssue[]
  priority: IssueSeverity          // highest severity found
  totalIssues: number
  needsAction: boolean
}

// ── Actions ───────────────────────────────────────────────────

export type ActionType =
  | 'update_meta_title'
  | 'update_meta_desc'
  | 'inject_schema'
  | 'inject_head_script'
  | 'inject_body_script'
  | 'update_page_title'
  | 'update_cta_text'
  | 'patch_html_section'

export type ActionStrategy =
  | 'direct_api'
  | 'script_injection'
  | 'html_patch'
  | 'fallback'

export interface AgentAction {
  actionType: ActionType
  strategy: ActionStrategy
  ghlPageId: string
  path: string

  // Decision context
  triggerIssue: IssueType
  triggerMetric: string
  triggerValue: number
  triggerThreshold: number
  reason: string
  expectedImpact: string
  impactScore: number              // 1-10, higher = higher priority

  // What to apply
  payload: ActionPayload
  previousValue?: string
}

export type ActionPayload =
  | MetaUpdatePayload
  | SchemaInjectPayload
  | ScriptInjectPayload
  | HtmlPatchPayload
  | CTAUpdatePayload

export interface MetaUpdatePayload {
  type: 'meta'
  metaTitle?: string
  metaDescription?: string
}

export interface SchemaInjectPayload {
  type: 'schema'
  schemaType: 'Product' | 'FAQ' | 'LocalBusiness' | 'Review' | 'VideoObject' | 'Article' | 'BreadcrumbList'
  jsonLd: Record<string, unknown>
}

export interface ScriptInjectPayload {
  type: 'script'
  target: 'head' | 'body'
  scriptId: string                // unique id so we don't duplicate
  code: string
}

export interface HtmlPatchPayload {
  type: 'html_patch'
  selector: string                // CSS selector for target element
  newContent: string
  fullSectionHtml?: string        // full replacement if needed
}

export interface CTAUpdatePayload {
  type: 'cta'
  selector: string
  newText: string
  newHref?: string
}

// ── Results ───────────────────────────────────────────────────

export interface ActionResult {
  action: AgentAction
  status: 'applied' | 'failed' | 'dry_run' | 'rate_limited' | 'skipped'
  changeId?: bigint
  backupId?: bigint
  errorMessage?: string
  appliedAt?: Date
}

export interface AgentRunResult {
  siteId: number
  domain: string
  startedAt: Date
  completedAt: Date
  pagesAnalyzed: number
  issuesFound: number
  actionsDecided: number
  actionsApplied: number
  actionsFailed: number
  dryRun: boolean
  results: ActionResult[]
}

// ── GHL API types ─────────────────────────────────────────────

export interface GHLFunnel {
  id: string
  name: string
  locationId: string
  steps: GHLFunnelStep[]
  createdAt: string
  updatedAt: string
}

export interface GHLFunnelStep {
  id: string
  name: string
  funnelId: string
  pages: GHLFunnelPage[]
  sequence: number
}

export interface GHLFunnelPage {
  id: string
  name: string
  stepId: string
  url: string
  title?: string
  metaTitle?: string
  metaDescription?: string
  headTrackingCode?: string
  bodyTrackingCode?: string
}

export interface GHLApiResponse<T> {
  data?: T
  error?: string
  status?: number
}

// ── Safety types ──────────────────────────────────────────────

export interface BackupData {
  ghlPageId: string
  snapshotAt: string
  title: string | null
  metaTitle: string | null
  metaDescription: string | null
  headCode: string | null
  bodyCode: string | null
  rawApiResponse?: Record<string, unknown>
}

export interface RateLimitStatus {
  allowed: boolean
  reason?: string
  changesAppliedToday: number
  maxChangesPerDay: number
  changesOnPageThisWeek: number
  maxChangesPerPage: number
  lastChangeOnPage?: Date
  cooldownRemainingHours?: number
}

// ── Learning types ────────────────────────────────────────────

export interface StrategyScore {
  actionType: ActionType
  triggerMetric: string
  totalApplied: number
  totalEffective: number
  totalFailed: number
  avgMetricDelta: number
  confidenceScore: number
}

export interface PerformanceComparison {
  changeId: bigint
  ghlPageId: string
  actionType: ActionType
  triggerMetric: string
  metricBefore: number
  metricAfter: number
  metricDelta: number            // % change
  wasEffective: boolean
  daysAfterChange: number
}

// ── Thresholds (tunable) ──────────────────────────────────────

export const THRESHOLDS = {
  // CTR thresholds (GSC click-through rate, 0-1)
  CTR_CRITICAL: 0.005,           // < 0.5% with 100+ impressions
  CTR_LOW: 0.02,                 // < 2% with 50+ impressions
  CTR_TARGET: 0.05,              // 5% is a good target

  // Bounce rate (0-100%)
  BOUNCE_CRITICAL: 80,
  BOUNCE_HIGH: 65,
  BOUNCE_TARGET: 45,

  // Scroll depth (0-100%)
  SCROLL_CRITICAL: 20,
  SCROLL_LOW: 35,
  SCROLL_TARGET: 60,

  // Engagement (avg duration in seconds)
  DURATION_CRITICAL: 15,
  DURATION_LOW: 30,
  DURATION_TARGET: 90,

  // CTA click rate (clicks on CTA / pageviews)
  CTA_CRITICAL: 0.01,
  CTA_LOW: 0.03,
  CTA_TARGET: 0.08,

  // Minimum impressions to trigger CTR recommendations
  MIN_IMPRESSIONS_FOR_CTR: 50,

  // Minimum visits to be worth optimizing
  MIN_VISITS_FOR_ANALYSIS: 20,

  // Max changes per run per site
  MAX_ACTIONS_PER_SITE_PER_RUN: 3,
} as const
