// ============================================================
// Google Search Console API — cliente multi-sitio
// Maneja OAuth2 token refresh automático por sitio
// ============================================================

import { queryOne, query } from '@/lib/db'

interface GSCTokens {
  access_token:  string
  refresh_token: string
  expiry_date:   number   // timestamp ms
  token_type:    string
}

interface GSCSite {
  id:          number
  domain:      string
  gsc_property: string
  gsc_token:   GSCTokens
}

// ── Refrescar access_token si venció ──────────────────────

async function refreshTokenIfNeeded(site: GSCSite): Promise<string> {
  const { access_token, refresh_token, expiry_date } = site.gsc_token

  // Si el token vence en más de 5 minutos, usarlo tal cual
  if (expiry_date && expiry_date > Date.now() + 5 * 60_000) {
    return access_token
  }

  // Refrescar con Google OAuth2
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GSC token refresh failed for site ${site.id}: ${err}`)
  }

  const data = await res.json() as {
    access_token: string
    expires_in:   number
  }

  const newExpiry = Date.now() + data.expires_in * 1000

  // Guardar el nuevo token en la BD
  await queryOne(`
    UPDATE sites
    SET gsc_token = gsc_token || $1::jsonb
    WHERE id = $2
  `, [
    JSON.stringify({
      access_token: data.access_token,
      expiry_date:  newExpiry,
    }),
    site.id,
  ])

  return data.access_token
}

// ── Obtener todos los sitios con GSC configurado ───────────

export async function getActiveSites(): Promise<GSCSite[]> {
  const rows = await query<{
    id: number; domain: string; gsc_property: string; gsc_token: GSCTokens
  }>(`
    SELECT id, domain, gsc_property, gsc_token
    FROM sites
    WHERE is_active = true
      AND gsc_property IS NOT NULL
      AND gsc_token IS NOT NULL
  `)
  return rows
}

// ── Search Analytics: performance (clicks, impressiones…) ─

export interface PerformanceRow {
  keys:        string[]
  clicks:      number
  impressions: number
  ctr:         number
  position:    number
}

export interface PerformanceQuery {
  startDate:    string  // YYYY-MM-DD
  endDate:      string
  dimensions?:  string[]   // ['query', 'page', 'country', 'device']
  searchType?:  string     // 'web' | 'image' | 'video' | 'news'
  rowLimit?:    number
  startRow?:    number
  dimensionFilterGroups?: unknown[]
}

export async function fetchPerformance(
  site: GSCSite,
  queryParams: PerformanceQuery
): Promise<PerformanceRow[]> {
  const token    = await refreshTokenIfNeeded(site)
  const property = encodeURIComponent(site.gsc_property)
  const url      = `https://searchconsole.googleapis.com/webmasters/v3/sites/${property}/searchAnalytics/query`

  const body = {
    startDate:   queryParams.startDate,
    endDate:     queryParams.endDate,
    dimensions:  queryParams.dimensions  ?? [],
    type:        queryParams.searchType  ?? 'web',
    rowLimit:    queryParams.rowLimit    ?? 25000,
    startRow:    queryParams.startRow    ?? 0,
    ...( queryParams.dimensionFilterGroups
      ? { dimensionFilterGroups: queryParams.dimensionFilterGroups }
      : {}),
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GSC performance fetch failed (${res.status}): ${err}`)
  }

  const data = await res.json() as { rows?: PerformanceRow[] }
  return data.rows ?? []
}

// ── URL Inspection API ─────────────────────────────────────

export interface UrlInspectionResult {
  inspectionResult: {
    inspectionResultLink: string
    indexStatusResult: {
      verdict:             string
      coverageState:       string
      robotsTxtState:      string
      indexingState:       string
      lastCrawlTime?:      string
      pageFetchState?:     string
      crawledAs?:          string
      canonicalUrl?:       string
      referringUrls?:      string[]
      sitemaps?:           string[]
    }
    ampResult?:       unknown
    mobileUsabilityResult?: {
      verdict: string
      issues?: Array<{ issueType: string; message: string }>
    }
    richResultsResult?: {
      verdict: string
      detectedItems?: Array<{
        richResultType: string
        items: Array<{
          name: string
          issues: Array<{ issueMessage: string; severity: string }>
        }>
      }>
    }
  }
}

export async function inspectUrl(
  site: GSCSite,
  pageUrl: string
): Promise<UrlInspectionResult | null> {
  const token = await refreshTokenIfNeeded(site)
  const url   = `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inspectionUrl: pageUrl,
      siteUrl:       site.gsc_property,
    }),
  })

  if (res.status === 429) {
    // Rate limit — esperamos y reintentamos una vez
    await new Promise(r => setTimeout(r, 2000))
    return inspectUrl(site, pageUrl)
  }

  if (!res.ok) return null

  return res.json() as Promise<UrlInspectionResult>
}

// ── Sitemaps API ───────────────────────────────────────────

export async function fetchSitemaps(site: GSCSite) {
  const token    = await refreshTokenIfNeeded(site)
  const property = encodeURIComponent(site.gsc_property)
  const url      = `https://searchconsole.googleapis.com/webmasters/v3/sites/${property}/sitemaps`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) return []

  const data = await res.json() as { sitemap?: unknown[] }
  return data.sitemap ?? []
}

// ── Security Issues (vía URL inspection del sitio raíz) ───

export async function fetchSecurityIssues(site: GSCSite) {
  const token    = await refreshTokenIfNeeded(site)
  const property = encodeURIComponent(site.gsc_property)
  const url      = `https://searchconsole.googleapis.com/webmasters/v3/sites/${property}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) return null
  return res.json()
}
