// ============================================================
// GHL API CLIENT
// Thin, typed wrapper around the GoHighLevel v2 REST API.
//
// Official docs: https://marketplace.gohighlevel.com/docs/
// Scopes matrix: https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html
// Official TS SDK (path reference): https://github.com/GoHighLevel/highlevel-api-sdk
//
// GHL API constraints (as of 2025–2026):
//   - Base: https://services.leadconnectorhq.com
//   - Auth: Bearer (OAuth access token OR Location API key OR Private Integration Token)
//   - Version header: required (2021-07-28)
//   - Rate limits: ~100 req/min per location
//
// Authentication (critical):
//   - Funnels API docs state tokens must be Sub-Account (location) scoped:
//     "Access Token … user type as Sub-Account (OR) Private Integration Token of Sub-Account"
//     See: /docs/ghl/funnels/funnels-api
//   - Agency-level PITs or wrong user-type tokens often return 401
//     ("IAM Service … not yet supported", "Token's user type mismatch").
//   - Private Integration: enable only scopes that map to the endpoints you call
//     (e.g. funnels/funnel.readonly + funnels/page.readonly for listing).
//   - For full blog body + meta edits, OAuth / Location token with at least
//     blogs/post-update.write (and readonly scopes for reads) per scopes table.
//
// Website builder (non-funnel pages):
//   - There is no "Sites" module in the public highlevel-api-sdk; first-party
//     Website Builder coverage in API v2 is limited vs Funnels/Blogs.
//   - `/sites/pages` may 404 or be restricted; rich text / section content is
//     largely editor-driven. Feature requests: ideas.gohighlevel.com (website API).
//   - Practical content APIs today: Blog posts (HTML + meta) and Funnel pages
//     (metadata / tracking; full builder JSON not exposed here).
//
// What this client targets:
//   ✅ List funnels / pages (v2 paths: /funnels/funnel/list, /funnels/page)
//   ✅ Get/update funnel page fields where PUT is still accepted by GHL
//   ✅ List blog sites + posts (/blogs/site/all, /blogs/posts/all), update via PUT /blogs/posts/:id
//   ⚠️ List/update website builder pages via /sites/pages when the account exposes that route
//
// What it CANNOT do:
//   ❌ Full visual drag-and-drop or arbitrary section HTML on Website Builder
//   ❌ Guaranteed "full site copywriting" via API alone (use Blog + approved endpoints)
// ============================================================

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'

export interface GHLClientConfig {
  apiKey: string
  locationId: string
  apiVersion?: string
}

export class GHLClient {
  private headers: Record<string, string>
  private locationId: string

  constructor(config: GHLClientConfig) {
    this.locationId = config.locationId
    this.headers = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Version': config.apiVersion ?? '2021-07-28',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  // ── Internal fetch wrapper ───────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${GHL_BASE_URL}${path}`
    const opts: RequestInit = {
      method,
      headers: this.headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }

    const res = await fetch(url, opts)

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error')
      throw new GHLApiError(res.status, `GHL API ${method} ${path} failed: ${errText}`)
    }

    const text = await res.text()
    return text ? JSON.parse(text) as T : ({} as T)
  }

  // ── Funnel endpoints ─────────────────────────────────────
  // v2 list paths per official SDK: lib/code/funnels/funnels.ts

  /** GHL rejects limit > 20 on funnel/page in many accounts (422). */
  private static readonly FUNNEL_PAGE_LIMIT = 20

  async listFunnels(): Promise<GHLFunnelListResponse> {
    const raw = await this.request<unknown>(
      'GET',
      `/funnels/funnel/list?locationId=${encodeURIComponent(this.locationId)}&limit=100`,
    )
    return normalizeFunnelList(raw)
  }

  async getFunnelPages(funnelId: string): Promise<GHLFunnelPagesResponse> {
    const limit = GHLClient.FUNNEL_PAGE_LIMIT
    const merged: GHLFunnelPagesResponse = { pages: [], total: 0 }
    let offset = 0
    for (;;) {
      const raw = await this.request<unknown>(
        'GET',
        `/funnels/page?locationId=${encodeURIComponent(this.locationId)}&funnelId=${encodeURIComponent(funnelId)}&limit=${limit}&offset=${offset}`,
      )
      const batch = normalizeFunnelPages(raw)
      const chunk = batch.pages ?? []
      merged.pages!.push(...chunk)
      merged.total = (merged.total ?? 0) + chunk.length
      if (chunk.length < limit) break
      offset += limit
    }
    return merged
  }

  async getFunnelPage(pageId: string): Promise<GHLFunnelPageDetail> {
    const raw = await this.request<unknown>(
      'GET',
      `/funnels/page/${encodeURIComponent(pageId)}`,
    )
    return normalizeFunnelPageDetail(raw)
  }

  async updateFunnelPage(
    pageId: string,
    updates: Partial<GHLFunnelPageUpdatePayload>,
  ): Promise<GHLFunnelPageDetail> {
    const raw = await this.request<unknown>(
      'PUT',
      `/funnels/page/${encodeURIComponent(pageId)}`,
      updates,
    )
    return normalizeFunnelPageDetail(raw)
  }

  // ── Blog / CMS endpoints ─────────────────────────────────
  // v2 paths per official SDK: lib/code/blogs/blogs.ts

  /** Lists blog *sites* for the location (each has an id used as blogId elsewhere). */
  async listBlogSites(skip = 0, limit = 50): Promise<GHLBlogSitesResponse> {
    const raw = await this.request<unknown>(
      'GET',
      `/blogs/site/all?locationId=${encodeURIComponent(this.locationId)}&skip=${skip}&limit=${limit}`,
    )
    return normalizeBlogSites(raw)
  }

  /** Posts for one blog container (blogId from listBlogSites). */
  async listBlogPostsForBlog(
    blogId: string,
    offset = 0,
    limit = 50,
  ): Promise<GHLBlogListResponse> {
    const raw = await this.request<unknown>(
      'GET',
      `/blogs/posts/all?locationId=${encodeURIComponent(this.locationId)}&blogId=${encodeURIComponent(blogId)}&limit=${limit}&offset=${offset}`,
    )
    return normalizeBlogPostsList(raw, blogId)
  }

  /** All posts across every blog site in the location (aggregated). */
  async listBlogPosts(maxPosts = 500): Promise<GHLBlogListResponse> {
    const sites = await this.listBlogSites(0, 50)
    const posts: GHLBlogListResponse['posts'] = []
    for (const blog of sites.blogs ?? []) {
      let offset = 0
      while (posts.length < maxPosts) {
        const batch = await this.listBlogPostsForBlog(blog.id, offset, 100)
        const chunk = batch.posts ?? []
        if (chunk.length === 0) break
        posts.push(...chunk)
        offset += chunk.length
        if (chunk.length < 100) break
      }
      if (posts.length >= maxPosts) break
    }
    const trimmed = posts.slice(0, maxPosts)
    return { posts: trimmed, total: trimmed.length }
  }

  async getBlogPost(postId: string): Promise<GHLBlogPost> {
    const raw = await this.request<unknown>(
      'GET',
      `/blogs/posts/${encodeURIComponent(postId)}?locationId=${encodeURIComponent(this.locationId)}`,
    )
    return normalizeBlogPost(raw)
  }

  async updateBlogPost(
    postId: string,
    updates: Partial<GHLBlogPostUpdate>,
    blogId: string,
  ): Promise<GHLBlogPost> {
    const current = await this.getBlogPost(postId)
    const body = buildBlogPutBody(this.locationId, blogId, current, updates)
    const raw = await this.request<unknown>(
      'PUT',
      `/blogs/posts/${encodeURIComponent(postId)}`,
      body,
    )
    return normalizeBlogPost(raw)
  }

  // ── Website pages (if using GHL website builder) ─────────

  async listSitePages(): Promise<GHLSitePagesResponse> {
    const raw = await this.request<unknown>(
      'GET',
      `/sites/pages?locationId=${encodeURIComponent(this.locationId)}&limit=20`,
    )
    return normalizeSitePages(raw)
  }

  async getSitePage(pageId: string): Promise<GHLSitePage> {
    const raw = await this.request<unknown>(
      'GET',
      `/sites/pages/${encodeURIComponent(pageId)}?locationId=${encodeURIComponent(this.locationId)}`,
    )
    return normalizeSitePage(raw)
  }

  async updateSitePage(
    pageId: string,
    updates: Partial<GHLSitePageUpdate>,
  ): Promise<GHLSitePage> {
    const raw = await this.request<unknown>(
      'PUT',
      `/sites/pages/${encodeURIComponent(pageId)}`,
      updates,
    )
    return normalizeSitePage(raw)
  }

  // ── Convenience: sync all pages to local cache ───────────

  async discoverAllPages(): Promise<DiscoveredPage[]> {
    const discovered: DiscoveredPage[] = []

    // 1. Funnel pages
    try {
      const { funnels } = await this.listFunnels()
      for (const funnel of funnels ?? []) {
        const { pages } = await this.getFunnelPages(funnel.id)
        for (const page of pages ?? []) {
          let pathFromUrl: string | null = null
          if (page.url) {
            try {
              pathFromUrl = new URL(page.url).pathname
            } catch {
              pathFromUrl = page.url.startsWith('/') ? page.url : `/${page.url}`
            }
          }
          discovered.push({
            ghlPageId:   page.id,
            ghlFunnelId: funnel.id,
            ghlPageType: 'funnel',
            title:          page.name ?? null,
            metaTitle:      page.title ?? null,
            metaDescription: page.metaDescription ?? null,
            path:           pathFromUrl,
            fullUrl:        page.url || null,
            headCode:       page.headTrackingCode ?? null,
            bodyCode:       page.bodyTrackingCode ?? null,
          })
        }
        await sleep(100)  // be gentle with the API
      }
    } catch (err) {
      console.warn('[GHLClient] Funnel pages discovery failed:', err instanceof Error ? err.message : err)
    }

    // 2. Blog posts (blogId stored in ghlFunnelId for DB sync — GHL PUT requires blogId)
    try {
      const { posts } = await this.listBlogPosts(500)
      for (const post of posts ?? []) {
        discovered.push({
          ghlPageId:   post.id,
          ghlFunnelId: post.blogId ?? null,
          ghlPageType: 'blog',
          title:          post.title ?? null,
          metaTitle:      post.metaTitle ?? null,
          metaDescription: post.metaDescription ?? null,
          path:           post.slug ? `/blog/${post.slug}` : null,
          fullUrl:        post.canonicalLink ?? null,
          headCode:       null,
          bodyCode:       null,
        })
      }
    } catch {
      console.warn('[GHLClient] Blog posts discovery failed (may not be enabled for this location)')
    }

    // 3. Website builder pages
    try {
      const { pages } = await this.listSitePages()
      for (const page of pages ?? []) {
        discovered.push({
          ghlPageId:   page.id,
          ghlFunnelId: null,
          ghlPageType: 'website',
          title:          page.name ?? null,
          metaTitle:      page.title ?? null,
          metaDescription: page.metaDescription ?? null,
          path:           page.path ?? null,
          fullUrl:        page.url ?? null,
          headCode:       page.headTrackingCode ?? null,
          bodyCode:       page.bodyTrackingCode ?? null,
        })
      }
    } catch {
      console.warn('[GHLClient] Site pages discovery failed (may not be enabled for this location)')
    }

    return discovered
  }
}

// ── Custom error class ────────────────────────────────────

export class GHLApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'GHLApiError'
  }
}

// ── GHL API response types ────────────────────────────────

export interface GHLFunnelListResponse {
  funnels: Array<{
    id: string
    name: string
    locationId: string
    type: string
    createdAt: string
    updatedAt: string
  }>
  total: number
}

export interface GHLFunnelPagesResponse {
  /** Opcional: rellenado al agregar páginas de varias peticiones (paginación). */
  total?: number
  pages: Array<{
    id: string
    name: string
    stepId: string
    funnelId: string
    url: string
    title?: string
    metaDescription?: string
    headTrackingCode?: string
    bodyTrackingCode?: string
    sequence?: number
  }>
}

export interface GHLFunnelPageDetail {
  id: string
  name: string
  stepId: string
  funnelId: string
  url: string
  title?: string
  metaDescription?: string
  headTrackingCode?: string
  bodyTrackingCode?: string
  content?: string
}

export interface GHLFunnelPageUpdatePayload {
  title: string
  metaDescription: string
  headTrackingCode: string
  bodyTrackingCode: string
  name: string
}

export interface GHLBlogSitesResponse {
  blogs: Array<{
    id: string
    name: string
  }>
}

export interface GHLBlogListResponse {
  posts: Array<{
    id: string
    /** Parent blog site id (from /blogs/site/all); required for PUT updates. */
    blogId?: string
    title: string
    slug: string
    metaTitle?: string
    metaDescription?: string
    canonicalLink?: string
    status: string
    publishedAt?: string
  }>
  total: number
}

export interface GHLBlogPost {
  id: string
  title: string
  slug: string
  metaTitle?: string
  metaDescription?: string
  canonicalLink?: string
  content?: string
  status: string
  author?: string
  categories?: string[]
  imageUrl?: string
  imageAltText?: string
}

export interface GHLBlogPostUpdate {
  title: string
  metaTitle: string
  metaDescription: string
  content: string
}

export interface GHLSitePagesResponse {
  pages: Array<{
    id: string
    name: string
    path: string
    url?: string
    title?: string
    metaDescription?: string
    headTrackingCode?: string
    bodyTrackingCode?: string
  }>
}

export interface GHLSitePage {
  id: string
  name: string
  path: string
  url?: string
  title?: string
  metaDescription?: string
  headTrackingCode?: string
  bodyTrackingCode?: string
}

export interface GHLSitePageUpdate {
  title: string
  metaDescription: string
  headTrackingCode: string
  bodyTrackingCode: string
}

// ── Internal types ────────────────────────────────────────

export interface DiscoveredPage {
  ghlPageId: string
  /** Funnel id for funnel pages; for `blog` rows this holds the GHL blog site id (blogs/site/all `_id`) for PUT /blogs/posts. */
  ghlFunnelId: string | null
  ghlPageType: 'funnel' | 'blog' | 'website' | 'landing'
  title: string | null
  metaTitle: string | null
  metaDescription: string | null
  path: string | null
  fullUrl: string | null
  headCode: string | null
  bodyCode: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Response normalizers (GHL wraps payloads inconsistently) ─

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function normalizeFunnelList(raw: unknown): GHLFunnelListResponse {
  const r = asRecord(raw)
  const inner = asRecord(r.data)
  let list: unknown[] = []
  if (Array.isArray(r.funnels)) list = r.funnels as unknown[]
  else if (Array.isArray(inner.funnels)) list = inner.funnels as unknown[]
  else if (Array.isArray(r.data)) list = r.data as unknown[]

  const funnels = list.map((item) => {
    const o = asRecord(item)
    return {
      id:           String(o.id ?? o._id ?? ''),
      name:         String(o.name ?? ''),
      locationId:   String(o.locationId ?? ''),
      type:         String(o.type ?? ''),
      createdAt:    String(o.createdAt ?? o.created_at ?? ''),
      updatedAt:    String(o.updatedAt ?? o.updated_at ?? ''),
    }
  }).filter((f) => f.id)

  return {
    funnels,
    total: Number(r.total ?? inner.total ?? funnels.length),
  }
}

function normalizeFunnelPages(raw: unknown): GHLFunnelPagesResponse {
  if (Array.isArray(raw)) {
    return { pages: mapFunnelPageRows(raw) }
  }
  const r = asRecord(raw)
  const inner = asRecord(r.data)
  let list: unknown[] = []
  if (Array.isArray(r.pages)) list = r.pages as unknown[]
  else if (Array.isArray(r.tracks)) list = r.tracks as unknown[]
  else if (Array.isArray(inner.pages)) list = inner.pages as unknown[]
  else if (Array.isArray(inner.funnelPages)) list = inner.funnelPages as unknown[]

  return { pages: mapFunnelPageRows(list) }
}

function mapFunnelPageRows(list: unknown[]): GHLFunnelPagesResponse['pages'] {
  return list.map((item) => {
    const o = asRecord(item)
    const urlRaw = o.url ?? o.pageUrl
    return {
      id:               String(o.id ?? o._id ?? ''),
      name:             String(o.name ?? ''),
      stepId:           String(o.stepId ?? o.step_id ?? ''),
      funnelId:         String(o.funnelId ?? o.funnel_id ?? ''),
      url:              urlRaw != null && String(urlRaw) ? String(urlRaw) : '',
      title:            o.title != null ? String(o.title) : undefined,
      metaDescription:  o.metaDescription != null ? String(o.metaDescription) : undefined,
      headTrackingCode: o.headTrackingCode != null ? String(o.headTrackingCode) : undefined,
      bodyTrackingCode: o.bodyTrackingCode != null ? String(o.bodyTrackingCode) : undefined,
      sequence:         typeof o.sequence === 'number' ? o.sequence : undefined,
    }
  }).filter((p) => p.id)
}

function normalizeFunnelPageDetail(raw: unknown): GHLFunnelPageDetail {
  const r = asRecord(raw)
  const o = asRecord(r.page ?? r.data ?? r.funnelPage ?? r)
  return {
    id:               String(o.id ?? o._id ?? ''),
    name:             String(o.name ?? ''),
    stepId:           String(o.stepId ?? o.step_id ?? ''),
    funnelId:         String(o.funnelId ?? o.funnel_id ?? ''),
    url:              String(o.url ?? ''),
    title:            o.title != null ? String(o.title) : undefined,
    metaDescription:  o.metaDescription != null ? String(o.metaDescription) : undefined,
    headTrackingCode: o.headTrackingCode != null ? String(o.headTrackingCode) : undefined,
    bodyTrackingCode: o.bodyTrackingCode != null ? String(o.bodyTrackingCode) : undefined,
    content:          o.content != null ? String(o.content) : undefined,
  }
}

function normalizeBlogSites(raw: unknown): GHLBlogSitesResponse {
  const r = asRecord(raw)
  let list: unknown[] = []
  if (Array.isArray(r.data)) list = r.data as unknown[]
  else if (Array.isArray(r.blogs)) list = r.blogs as unknown[]
  else {
    const inner = asRecord(r.data)
    if (Array.isArray(inner.blogs)) list = inner.blogs as unknown[]
  }

  const blogs = list.map((item) => {
    const o = asRecord(item)
    return {
      id:   String(o._id ?? o.id ?? ''),
      name: String(o.name ?? ''),
    }
  }).filter((b) => b.id)

  return { blogs }
}

function normalizeBlogPostsList(raw: unknown, blogId: string): GHLBlogListResponse {
  const r = asRecord(raw)
  let list: unknown[] = []
  if (Array.isArray(r.blogs)) list = r.blogs as unknown[]
  else if (Array.isArray(r.posts)) list = r.posts as unknown[]
  else if (Array.isArray(r.data)) list = r.data as unknown[]

  const posts = list.map((item) => mapBlogPostListItem(asRecord(item), blogId))
  return { posts, total: posts.length }
}

function mapBlogPostListItem(o: Record<string, unknown>, blogId: string): GHLBlogListResponse['posts'][0] {
  const id = String(o._id ?? o.id ?? '')
  const urlSlug = String(o.urlSlug ?? o.slug ?? '')
  return {
    id,
    blogId,
    title: String(o.title ?? ''),
    slug: urlSlug,
    metaTitle:       o.metaTitle != null ? String(o.metaTitle) : String(o.title ?? ''),
    metaDescription: o.metaDescription != null
      ? String(o.metaDescription)
      : (o.description != null ? String(o.description) : undefined),
    canonicalLink: o.canonicalLink != null ? String(o.canonicalLink) : undefined,
    status: String(o.status ?? ''),
    publishedAt: o.publishedAt != null ? String(o.publishedAt) : undefined,
  }
}

function normalizeBlogPost(raw: unknown): GHLBlogPost {
  const r = asRecord(raw)
  const o = asRecord(r.post ?? r.updatedBlogPost ?? r.data ?? r)
  const id = String(o._id ?? o.id ?? '')
  const urlSlug = String(o.urlSlug ?? o.slug ?? '')
  const categories = Array.isArray(o.categories)
    ? (o.categories as unknown[]).map((c) => String(c))
    : undefined
  return {
    id,
    title: String(o.title ?? ''),
    slug: urlSlug,
    metaTitle:       o.metaTitle != null ? String(o.metaTitle) : String(o.title ?? ''),
    metaDescription: o.metaDescription != null
      ? String(o.metaDescription)
      : (o.description != null ? String(o.description) : undefined),
    canonicalLink: o.canonicalLink != null ? String(o.canonicalLink) : undefined,
    content: o.rawHTML != null ? String(o.rawHTML) : (o.content != null ? String(o.content) : undefined),
    status: String(o.status ?? ''),
    author:       o.author != null ? String(o.author) : undefined,
    categories,
    imageUrl:     o.imageUrl != null ? String(o.imageUrl) : undefined,
    imageAltText: o.imageAltText != null ? String(o.imageAltText) : undefined,
  }
}

/** Builds PUT body aligned with highlevel-api-sdk UpdateBlogPostParams. */
function buildBlogPutBody(
  locationId: string,
  blogId: string,
  current: GHLBlogPost,
  updates: Partial<GHLBlogPostUpdate>,
): Record<string, unknown> {
  const title = updates.metaTitle ?? updates.title ?? current.metaTitle ?? current.title
  const description = updates.metaDescription ?? current.metaDescription ?? ''
  const rawHTML = updates.content ?? current.content ?? ''
  return {
    title,
    locationId,
    blogId,
    imageUrl:      current.imageUrl ?? '',
    description,
    rawHTML,
    status:        current.status || 'draft',
    imageAltText:  current.imageAltText ?? '',
    categories:    current.categories ?? [],
    author:        current.author ?? '',
    urlSlug:       current.slug || 'post',
    canonicalLink: current.canonicalLink ?? '',
    publishedAt:   new Date().toISOString(),
  }
}

function normalizeSitePages(raw: unknown): GHLSitePagesResponse {
  const r = asRecord(raw)
  let list: unknown[] = []
  if (Array.isArray(r.pages)) list = r.pages as unknown[]
  else if (Array.isArray(r.data)) list = r.data as unknown[]

  const pages = list.map((item) => {
    const o = asRecord(item)
    return {
      id:               String(o.id ?? o._id ?? ''),
      name:             String(o.name ?? ''),
      path:             String(o.path ?? o.urlSlug ?? ''),
      url:              o.url != null ? String(o.url) : undefined,
      title:            o.title != null ? String(o.title) : undefined,
      metaDescription:  o.metaDescription != null ? String(o.metaDescription) : undefined,
      headTrackingCode: o.headTrackingCode != null ? String(o.headTrackingCode) : undefined,
      bodyTrackingCode: o.bodyTrackingCode != null ? String(o.bodyTrackingCode) : undefined,
    }
  }).filter((p) => p.id)

  return { pages }
}

function normalizeSitePage(raw: unknown): GHLSitePage {
  const r = asRecord(raw)
  const o = asRecord(r.page ?? r.data ?? r)
  return {
    id:               String(o.id ?? o._id ?? ''),
    name:             String(o.name ?? ''),
    path:             String(o.path ?? ''),
    url:              o.url != null ? String(o.url) : undefined,
    title:            o.title != null ? String(o.title) : undefined,
    metaDescription:  o.metaDescription != null ? String(o.metaDescription) : undefined,
    headTrackingCode: o.headTrackingCode != null ? String(o.headTrackingCode) : undefined,
    bodyTrackingCode: o.bodyTrackingCode != null ? String(o.bodyTrackingCode) : undefined,
  }
}
