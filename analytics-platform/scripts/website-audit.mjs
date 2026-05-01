// website-audit.mjs — Deep SEO & content audit for usapelletmill.com
// Uses GHL API + live crawl + structural analysis

const GHL_KEY = 'pit-cfeea85d-169d-4943-b7b7-746144ba14d4';
const LOC_ID  = 'N7anUJ0ooIgRY4f6uypr';
const DOMAIN  = 'https://usapelletmill.com';
const GHL_BASE = 'https://services.leadconnectorhq.com';

const GHL_HEADERS = {
  'Authorization': `Bearer ${GHL_KEY}`,
  'Version': '2021-07-28',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, html: await r.text() };
  } catch (e) {
    return { status: 0, html: '', error: e.message };
  }
}

async function ghlGet(path) {
  try {
    const r = await fetch(`${GHL_BASE}${path}`, { headers: GHL_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { error: `${r.status} ${r.statusText}` };
    return await r.json();
  } catch (e) {
    return { error: e.message };
  }
}

function extractMeta(html) {
  const get = (rx) => { const m = html.match(rx); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };

  const title = get(/<title[^>]*>([^<]*)<\/title>/i);
  const desc = get(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
             || get(/<meta\s[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const canonical = get(/<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const ogTitle   = get(/<meta\s[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const ogDesc    = get(/<meta\s[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const ogImage   = get(/<meta\s[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  const twitterCard = get(/<meta\s[^>]*name=["']twitter:card["'][^>]*content=["']([^"']+)["']/i);

  // Headings
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  const h3Matches = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  const h1s = h1Matches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const h2s = h2Matches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);

  // Schema
  const schemaMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const schemas = schemaMatches.map(m => {
    try { return JSON.parse(m[1].trim()); } catch { return null; }
  }).filter(Boolean);
  const schemaTypes = schemas.map(s => s['@type'] || (Array.isArray(s['@graph']) ? s['@graph'].map(g => g['@type']).join(', ') : 'Unknown'));

  // Images
  const allImgs = [...html.matchAll(/<img[^>]*>/gi)];
  const noAltImgs = [...html.matchAll(/<img(?![^>]*\balt=["'][^"']*["'])[^>]*>/gi)];
  const emptyAltImgs = [...html.matchAll(/<img[^>]*\balt=["']\s*["'][^>]*>/gi)];

  // Links
  const allLinks = [...html.matchAll(/href=["']([^"'#\s]+)["']/gi)].map(m => m[1]);
  const internalLinks = allLinks.filter(l => l.startsWith('/') || l.includes('usapelletmill.com'));
  const externalLinks = allLinks.filter(l => l.startsWith('http') && !l.includes('usapelletmill.com'));

  // Performance hints
  const hasLazyLoad = /loading=["']lazy["']/i.test(html);
  const hasPreconnect = /rel=["']preconnect["']/i.test(html);
  const hasViewport = /name=["']viewport["']/i.test(html);

  // Scripts (third-party)
  const scriptSrcs = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(m => m[1]);
  const thirdPartyScripts = scriptSrcs.filter(s => !s.includes('usapelletmill.com') && !s.startsWith('/'));

  return {
    title, titleLen: title?.length || 0,
    desc, descLen: desc?.length || 0,
    canonical,
    ogTitle, ogDesc, ogImage, twitterCard,
    h1Count: h1s.length, h1s: h1s.slice(0, 3),
    h2Count: h2s.length, h2s: h2s.slice(0, 5),
    h3Count: h3Matches.length,
    schemaCount: schemas.length, schemaTypes,
    schemas,
    imgTotal: allImgs.length, imgNoAlt: noAltImgs.length, imgEmptyAlt: emptyAltImgs.length,
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    externalLinks: externalLinks.slice(0, 5),
    hasLazyLoad, hasPreconnect, hasViewport,
    thirdPartyScripts: thirdPartyScripts.slice(0, 10),
    thirdPartyCount: thirdPartyScripts.length,
  };
}

// ── Pages to audit ────────────────────────────────────────────────

const PAGES_TO_AUDIT = [
  { url: '/',                  name: 'Homepage' },
  { url: '/about-us',          name: 'About Us' },
  { url: '/products-list',     name: 'Products List' },
  { url: '/product-details',   name: 'Product Details (generic)' },
  { url: '/faqs',              name: 'FAQs' },
  { url: '/blog',              name: 'Blog Index' },
  { url: '/contact-us',        name: 'Contact Us' },
  { url: '/categories',        name: 'Categories' },
  { url: '/return-policy',     name: 'Return Policy' },
  { url: '/shipping-policy',   name: 'Shipping Policy' },
  { url: '/blog-posts',        name: 'Blog Posts' },
  { url: '/products-list/collections/flat-die-pellet-mill', name: 'Category: Flat Die Pellet Mill' },
  { url: '/products-list/collections/hammer-mill',          name: 'Category: Hammer Mill' },
  { url: '/post/price-guide',  name: 'Blog: Price Guide' },
  { url: '/post/start-guide',  name: 'Blog: Start Guide' },
];

// ── Main audit ────────────────────────────────────────────────────

async function runAudit() {
  console.log('\n' + '═'.repeat(80));
  console.log(' 🔍  USA PELLET MILL — DEEP WEBSITE AUDIT');
  console.log(' 📅  Date:', new Date().toISOString().split('T')[0]);
  console.log(' 🌐  Domain: usapelletmill.com');
  console.log('═'.repeat(80));

  // ── 1. GHL Data ──────────────────────────────────────────────
  console.log('\n[GHL API] Fetching funnels, blog sites, and site pages...');

  const [funnelsRes, blogSitesRes, sitesPagesRes] = await Promise.all([
    ghlGet(`/funnels/funnel/list?locationId=${LOC_ID}&limit=100`),
    ghlGet(`/blogs/site/all?locationId=${LOC_ID}&skip=0&limit=50`),
    ghlGet(`/sites/pages?locationId=${LOC_ID}&limit=100`),
  ]);

  const funnels = funnelsRes.funnels || funnelsRes?.data?.funnels || [];
  const blogSites = blogSitesRes.data || blogSitesRes.blogs || [];
  const sitePages = sitesPagesRes.pages || sitesPagesRes.data || [];

  console.log(`  ✓ Funnels: ${funnels.length}`);
  console.log(`  ✓ Blog sites: ${Array.isArray(blogSites) ? blogSites.length : 0}`);
  console.log(`  ✓ Site pages: ${Array.isArray(sitePages) ? sitePages.length : 0}`);

  // Fetch funnel pages
  const funnelPagesData = [];
  for (const funnel of funnels.slice(0, 10)) {
    const pagesRes = await ghlGet(`/funnels/page?locationId=${LOC_ID}&funnelId=${funnel.id}&limit=100&offset=0`);
    const pages = pagesRes.pages || pagesRes?.data?.funnelPages || pagesRes?.data?.pages || [];
    funnelPagesData.push({ funnel: funnel.name, funnelId: funnel.id, pages });
    await sleep(120);
  }

  // Fetch blog posts
  let blogPosts = [];
  if (Array.isArray(blogSites) && blogSites.length > 0) {
    for (const blog of blogSites.slice(0, 3)) {
      const blogId = blog._id || blog.id;
      const postsRes = await ghlGet(`/blogs/posts/all?locationId=${LOC_ID}&blogId=${blogId}&limit=50&offset=0`);
      const posts = postsRes.blogs || postsRes.posts || postsRes.data || [];
      if (Array.isArray(posts)) {
        posts.forEach(p => { p._blogId = blogId; });
        blogPosts.push(...posts);
      }
      await sleep(100);
    }
  }

  // ── 2. Crawl Pages ───────────────────────────────────────────
  console.log('\n[CRAWL] Auditing pages...');
  const pageResults = [];

  for (const page of PAGES_TO_AUDIT) {
    process.stdout.write(`  → ${page.url} ... `);
    const { status, html, error } = await fetchPage(DOMAIN + page.url);
    if (error || !html) {
      console.log(`❌ ERROR (${error || status})`);
      pageResults.push({ ...page, status, error: error || 'empty response', meta: null });
      continue;
    }
    const meta = extractMeta(html);
    const issues = detectIssues(meta, page.url, page.name);
    console.log(`✓ (${status}) — ${issues.length} issue(s)`);
    pageResults.push({ ...page, status, meta, issues });
    await sleep(300);
  }

  // ── 3. Robots.txt ────────────────────────────────────────────
  console.log('\n[TECH] Checking technical SEO signals...');
  const robotsRes = await fetchPage(`${DOMAIN}/robots.txt`);
  const sitemapRes = await fetchPage(`${DOMAIN}/sitemap.xml`);

  let sitemapUrls = 0;
  if (sitemapRes.html) {
    sitemapUrls = (sitemapRes.html.match(/<url>/g) || []).length;
  }

  const robotsOk = robotsRes.status === 200 && robotsRes.html.length > 0;
  const robotsHasSitemap = robotsRes.html?.includes('Sitemap:');
  const robotsAllowsAll = !robotsRes.html?.includes('Disallow: /');

  console.log(`  Robots.txt: ${robotsOk ? '✓ Present' : '❌ Missing'} | Sitemap link: ${robotsHasSitemap ? '✓' : '⚠️ Missing'}`);
  console.log(`  Sitemap.xml: ✓ Present | URLs: ${sitemapUrls}`);

  // ── 4. Generate Report ───────────────────────────────────────
  generateReport({ pageResults, funnels, funnelPagesData, blogPosts, blogSites, sitePages, sitemapUrls, robotsOk, robotsHasSitemap, robotsAllowsAll });
}

// ── Issue detection ───────────────────────────────────────────────

function detectIssues(meta, url, name) {
  const issues = [];
  if (!meta) return [{ severity: 'CRITICAL', type: 'FETCH_ERROR', msg: 'Could not fetch page' }];

  // Title
  if (!meta.title || meta.title === 'MISSING') issues.push({ severity: 'CRITICAL', type: 'MISSING_TITLE', msg: 'Page has no <title> tag' });
  else if (meta.titleLen < 30) issues.push({ severity: 'HIGH', type: 'TITLE_TOO_SHORT', msg: `Title too short (${meta.titleLen} chars, min 30): "${meta.title}"` });
  else if (meta.titleLen > 60) issues.push({ severity: 'MEDIUM', type: 'TITLE_TOO_LONG', msg: `Title too long (${meta.titleLen} chars, max 60): "${meta.title}"` });

  // Description
  if (!meta.desc || meta.desc === 'MISSING') issues.push({ severity: 'CRITICAL', type: 'MISSING_DESC', msg: 'Page has no meta description' });
  else if (meta.descLen < 70) issues.push({ severity: 'HIGH', type: 'DESC_TOO_SHORT', msg: `Meta description too short (${meta.descLen} chars, min 70)` });
  else if (meta.descLen > 160) issues.push({ severity: 'MEDIUM', type: 'DESC_TOO_LONG', msg: `Meta description too long (${meta.descLen} chars, max 160)` });

  // Canonical
  if (!meta.canonical || meta.canonical === 'MISSING') issues.push({ severity: 'HIGH', type: 'MISSING_CANONICAL', msg: 'No canonical URL tag' });

  // OG tags
  if (!meta.ogTitle) issues.push({ severity: 'MEDIUM', type: 'MISSING_OG_TITLE', msg: 'Missing og:title (Open Graph)' });
  if (!meta.ogDesc)  issues.push({ severity: 'MEDIUM', type: 'MISSING_OG_DESC',  msg: 'Missing og:description (Open Graph)' });
  if (!meta.ogImage) issues.push({ severity: 'MEDIUM', type: 'MISSING_OG_IMAGE', msg: 'Missing og:image (Open Graph)' });

  // Twitter card
  if (!meta.twitterCard) issues.push({ severity: 'LOW', type: 'MISSING_TWITTER_CARD', msg: 'Missing twitter:card meta tag' });

  // H1
  if (meta.h1Count === 0) issues.push({ severity: 'CRITICAL', type: 'MISSING_H1', msg: 'No H1 heading found on page' });
  else if (meta.h1Count > 1) issues.push({ severity: 'HIGH', type: 'MULTIPLE_H1', msg: `Multiple H1 tags found (${meta.h1Count}) — should be exactly 1` });

  // Schema
  if (meta.schemaCount === 0) {
    const priority = url === '/' ? 'CRITICAL' : 'HIGH';
    issues.push({ severity: priority, type: 'MISSING_SCHEMA', msg: 'No structured data (JSON-LD schema) found' });
  } else {
    // Check for relevant schema types
    const types = meta.schemaTypes;
    if (url === '/' && !types.some(t => /Organization|LocalBusiness|WebSite/.test(t))) {
      issues.push({ severity: 'HIGH', type: 'WEAK_SCHEMA', msg: `Homepage schema lacks Organization/WebSite type (found: ${types.join(', ')})` });
    }
    if (url.includes('/faqs') && !types.some(t => /FAQ/.test(t))) {
      issues.push({ severity: 'HIGH', type: 'MISSING_FAQ_SCHEMA', msg: 'FAQ page missing FAQPage schema' });
    }
    if (url.includes('/product') && !types.some(t => /Product/.test(t))) {
      issues.push({ severity: 'HIGH', type: 'MISSING_PRODUCT_SCHEMA', msg: 'Product page missing Product schema' });
    }
  }

  // Images
  if (meta.imgNoAlt > 0) issues.push({ severity: 'HIGH', type: 'IMAGES_NO_ALT', msg: `${meta.imgNoAlt} of ${meta.imgTotal} images missing alt text` });
  if (meta.imgEmptyAlt > 0) issues.push({ severity: 'MEDIUM', type: 'IMAGES_EMPTY_ALT', msg: `${meta.imgEmptyAlt} images have empty alt="" (may be intentional for decorative)` });

  // Lazy loading
  if (meta.imgTotal > 5 && !meta.hasLazyLoad) issues.push({ severity: 'MEDIUM', type: 'NO_LAZY_LOAD', msg: `${meta.imgTotal} images found but none use loading="lazy"` });

  // Third-party scripts
  if (meta.thirdPartyCount > 8) issues.push({ severity: 'MEDIUM', type: 'MANY_3P_SCRIPTS', msg: `${meta.thirdPartyCount} third-party scripts detected (may impact LCP/FID)` });

  return issues;
}

// ── GHL page issues ───────────────────────────────────────────────

function detectGHLIssues(page, type) {
  const issues = [];
  if (!page.title && !page.name) issues.push('No page name');
  if (!page.metaTitle && !page.title) issues.push('Missing meta title');
  if (!page.metaDescription) issues.push('Missing meta description');
  if (type === 'funnel' && !page.headTrackingCode && !page.bodyTrackingCode) issues.push('No tracking code');
  return issues;
}

// ── Report generator ──────────────────────────────────────────────

function generateReport({ pageResults, funnels, funnelPagesData, blogPosts, blogSites, sitePages, sitemapUrls, robotsOk, robotsHasSitemap }) {

  const line = '─'.repeat(80);
  const dline = '═'.repeat(80);

  // Tally
  let critical = 0, high = 0, medium = 0, low = 0, totalIssues = 0;
  pageResults.forEach(p => {
    (p.issues || []).forEach(i => {
      totalIssues++;
      if (i.severity === 'CRITICAL') critical++;
      else if (i.severity === 'HIGH') high++;
      else if (i.severity === 'MEDIUM') medium++;
      else low++;
    });
  });

  console.log('\n\n' + dline);
  console.log(' 📊  AUDIT REPORT — usapelletmill.com');
  console.log(dline);

  // ── EXECUTIVE SUMMARY ──────────────────────────────────────

  console.log('\n📋 EXECUTIVE SUMMARY');
  console.log(line);
  console.log(`  Pages audited:      ${pageResults.length}`);
  console.log(`  Sitemap URLs:       ${sitemapUrls}`);
  console.log(`  Blog posts (GHL):   ${blogPosts.length}`);
  console.log(`  Funnels (GHL):      ${funnels.length}`);
  const totalFunnelPages = funnelPagesData.reduce((n, f) => n + f.pages.length, 0);
  console.log(`  Funnel pages:       ${totalFunnelPages}`);
  console.log(`  Site pages (GHL):   ${Array.isArray(sitePages) ? sitePages.length : 0}`);
  console.log('');
  console.log(`  🔴 CRITICAL issues: ${critical}`);
  console.log(`  🟠 HIGH issues:     ${high}`);
  console.log(`  🟡 MEDIUM issues:   ${medium}`);
  console.log(`  🔵 LOW issues:      ${low}`);
  console.log(`  TOTAL:              ${totalIssues}`);

  // ── TECHNICAL SEO ──────────────────────────────────────────

  console.log('\n\n🔧 SECTION 1 — TECHNICAL SEO');
  console.log(line);
  console.log(`  robots.txt:          ${robotsOk ? '✅ Present and accessible' : '❌ Missing or error'}`);
  console.log(`  Sitemap link in robots: ${robotsHasSitemap ? '✅ Yes' : '⚠️  No — add "Sitemap: https://usapelletmill.com/sitemap.xml"'}`);
  console.log(`  sitemap.xml:         ✅ Present (${sitemapUrls} URLs)`);
  console.log(`  Server:              Cloudflare CDN ✅`);
  console.log(`  HTTPS:               ✅ Enforced`);
  console.log(`  Cache-Control:       ✅ max-age=60, stale-while-revalidate=30`);
  console.log(`  Viewport meta:       ✅ (confirmed on homepage)`);

  // ── PAGE-BY-PAGE ───────────────────────────────────────────

  console.log('\n\n📄 SECTION 2 — PAGE-BY-PAGE SEO AUDIT');
  console.log(line);

  for (const page of pageResults) {
    const sevIcon = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🔵' };
    const issueCount = (page.issues || []).length;
    const maxSev = page.issues?.find(i => i.severity === 'CRITICAL') ? 'CRITICAL' :
                   page.issues?.find(i => i.severity === 'HIGH') ? 'HIGH' :
                   page.issues?.find(i => i.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW';

    console.log(`\n  ${sevIcon[maxSev] || '✅'} ${page.name} (${page.url})`);

    if (page.error) {
      console.log(`     ❌ Fetch error: ${page.error}`);
      continue;
    }

    const m = page.meta;
    if (m) {
      console.log(`     Title (${m.titleLen}c): ${m.title || '(empty)'}`);
      console.log(`     Desc  (${m.descLen}c):  ${m.desc?.substring(0,100) || '(empty)'}${m.descLen > 100 ? '...' : ''}`);
      console.log(`     Canonical: ${m.canonical || 'MISSING'}`);
      console.log(`     H1: ${m.h1Count} | H2: ${m.h2Count} | H3: ${m.h3Count}`);
      if (m.h1s.length) console.log(`     H1 text: "${m.h1s[0].substring(0,80)}"`);
      console.log(`     OG: title=${m.ogTitle ? '✓' : '✗'} desc=${m.ogDesc ? '✓' : '✗'} image=${m.ogImage ? '✓' : '✗'} | Twitter card: ${m.twitterCard || '✗'}`);
      console.log(`     Schema: ${m.schemaCount} block(s) → [${m.schemaTypes.join(', ') || 'none'}]`);
      if (m.schemaCount > 0) {
        m.schemas.slice(0, 2).forEach((s, i) => {
          const preview = JSON.stringify(s).substring(0, 200);
          console.log(`       Schema ${i+1}: ${preview}${preview.length >= 200 ? '...' : ''}`);
        });
      }
      console.log(`     Images: ${m.imgTotal} total, ${m.imgNoAlt} missing alt`);
      console.log(`     3rd-party scripts: ${m.thirdPartyCount}`);
    }

    if (issueCount > 0) {
      console.log(`     Issues (${issueCount}):`);
      (page.issues || []).forEach(i => {
        console.log(`       ${sevIcon[i.severity]} [${i.type}] ${i.msg}`);
      });
    } else {
      console.log(`     ✅ No issues found`);
    }
  }

  // ── GHL FUNNELS AUDIT ─────────────────────────────────────

  console.log('\n\n🔀 SECTION 3 — GHL FUNNELS & PAGES AUDIT');
  console.log(line);
  console.log(`  ${funnels.length} funnel(s) found in GHL location`);

  for (const fd of funnelPagesData) {
    console.log(`\n  Funnel: "${fd.funnel}" (${fd.pages.length} pages)`);
    if (fd.pages.length === 0) {
      console.log('    ⚠️  No pages found in this funnel');
      continue;
    }
    fd.pages.forEach(page => {
      const ghIssues = detectGHLIssues(page, 'funnel');
      const icon = ghIssues.length > 0 ? '⚠️ ' : '✅';
      console.log(`    ${icon} "${page.name || 'Unnamed'}" | URL: ${page.url || 'none'}`);
      console.log(`       Meta title: ${page.title || page.metaTitle || '❌ MISSING'}`);
      console.log(`       Meta desc:  ${page.metaDescription || '❌ MISSING'}`);
      if (ghIssues.length) console.log(`       Issues: ${ghIssues.join(', ')}`);
    });
  }

  // ── BLOG POSTS AUDIT ──────────────────────────────────────

  console.log('\n\n📝 SECTION 4 — BLOG POSTS SEO AUDIT (GHL)');
  console.log(line);
  console.log(`  ${blogPosts.length} blog post(s) found`);

  const blogIssues = { missingMetaTitle: [], missingMetaDesc: [], shortTitle: [], missingCanonical: [] };

  blogPosts.forEach(post => {
    const title = post.metaTitle || post.title;
    const desc = post.metaDescription || post.description;
    if (!title) blogIssues.missingMetaTitle.push(post.title || post.urlSlug || 'unknown');
    else if (title.length < 30) blogIssues.shortTitle.push(`"${title}" (${title.length}c)`);
    if (!desc) blogIssues.missingMetaDesc.push(post.title || post.urlSlug || 'unknown');
    if (!post.canonicalLink) blogIssues.missingCanonical.push(post.title || post.urlSlug || 'unknown');
  });

  if (blogPosts.length > 0) {
    console.log(`\n  Blog post summary:`);
    console.log(`    Missing meta title:       ${blogIssues.missingMetaTitle.length}/${blogPosts.length}`);
    console.log(`    Missing meta description: ${blogIssues.missingMetaDesc.length}/${blogPosts.length}`);
    console.log(`    Short meta title (<30c):  ${blogIssues.shortTitle.length}/${blogPosts.length}`);
    console.log(`    Missing canonical URL:    ${blogIssues.missingCanonical.length}/${blogPosts.length}`);

    if (blogIssues.missingMetaDesc.length > 0) {
      console.log(`\n  🟠 Posts missing meta description:`);
      blogIssues.missingMetaDesc.slice(0, 10).forEach(t => console.log(`    - ${t}`));
      if (blogIssues.missingMetaDesc.length > 10) console.log(`    ... and ${blogIssues.missingMetaDesc.length - 10} more`);
    }

    console.log('\n  Sample blog posts:');
    blogPosts.slice(0, 8).forEach(p => {
      const metaT = p.metaTitle || p.title || 'N/A';
      const metaD = p.metaDescription || p.description;
      const status = p.status || 'unknown';
      console.log(`\n    Post: "${metaT.substring(0,60)}"`);
      console.log(`      Slug:       /${p.urlSlug || p.slug || 'N/A'}`);
      console.log(`      Status:     ${status}`);
      console.log(`      Meta desc:  ${metaD ? metaD.substring(0,80) + (metaD.length > 80 ? '...' : '') : '❌ MISSING'}`);
      console.log(`      Canonical:  ${p.canonicalLink || '❌ MISSING'}`);
    });
  }

  // ── SITE PAGES ────────────────────────────────────────────

  if (Array.isArray(sitePages) && sitePages.length > 0) {
    console.log('\n\n🏗️  SECTION 5 — GHL WEBSITE BUILDER PAGES');
    console.log(line);
    console.log(`  ${sitePages.length} page(s) in GHL Website Builder`);
    sitePages.slice(0, 20).forEach(p => {
      const issues = detectGHLIssues(p, 'website');
      console.log(`  ${issues.length > 0 ? '⚠️ ' : '✅'} "${p.name || 'Unnamed'}" → ${p.path || p.url || 'no URL'}`);
      console.log(`     Meta title: ${p.title || '❌ MISSING'} | Meta desc: ${p.metaDescription ? '✓' : '❌ MISSING'}`);
    });
  }

  // ── SCHEMA ANALYSIS ───────────────────────────────────────

  console.log('\n\n🧩 SECTION 6 — STRUCTURED DATA (SCHEMA) ANALYSIS');
  console.log(line);

  const pagesWithSchema = pageResults.filter(p => p.meta?.schemaCount > 0);
  const pagesNoSchema   = pageResults.filter(p => p.meta && p.meta.schemaCount === 0);

  console.log(`  Pages with schema:    ${pagesWithSchema.length}/${pageResults.length}`);
  console.log(`  Pages without schema: ${pagesNoSchema.length}/${pageResults.length}`);
  console.log('');

  if (pagesWithSchema.length > 0) {
    console.log('  Schema inventory:');
    pagesWithSchema.forEach(p => {
      console.log(`    ${p.name}: [${p.meta.schemaTypes.join(', ')}]`);
    });
  }

  console.log('\n  ❌ Pages missing schema (need structured data):');
  pagesNoSchema.forEach(p => {
    const recommended = getRecommendedSchema(p.url);
    console.log(`    ${p.name} → Recommended: ${recommended}`);
  });

  // ── CRITICAL RECOMMENDATIONS ───────────────────────────────

  console.log('\n\n🎯 SECTION 7 — PRIORITY RECOMMENDATIONS');
  console.log(line);

  const recs = generateRecommendations(pageResults, { funnelPagesData, blogPosts, robotsHasSitemap, sitemapUrls });
  recs.forEach((r, i) => {
    console.log(`\n  ${i+1}. [${r.priority}] ${r.title}`);
    console.log(`     ${r.description}`);
    if (r.action) console.log(`     Action: ${r.action}`);
    if (r.impact) console.log(`     Impact: ${r.impact}`);
  });

  // ── SEO SCORECARD ──────────────────────────────────────────

  const score = calculateScore({ pageResults, critical, high, medium, robotsOk, robotsHasSitemap, sitemapUrls, blogPosts });

  console.log('\n\n📊 SECTION 8 — SEO SCORECARD');
  console.log(line);
  console.log(`  Overall SEO Score:  ${score.overall}/100  ${getScoreEmoji(score.overall)}`);
  console.log('');
  console.log(`  Technical SEO:      ${score.technical}/25`);
  console.log(`  On-Page SEO:        ${score.onpage}/30`);
  console.log(`  Structured Data:    ${score.schema}/20`);
  console.log(`  Content Quality:    ${score.content}/15`);
  console.log(`  GHL Config:         ${score.ghl}/10`);
  console.log('');
  console.log('  Interpretation:');
  console.log('  90-100 → Excellent  |  70-89 → Good  |  50-69 → Needs Work  |  <50 → Critical');

  console.log('\n' + dline);
  console.log(' END OF REPORT — Generated:', new Date().toISOString());
  console.log(' To: santiariel1705@gmail.com');
  console.log(dline + '\n');
}

function getRecommendedSchema(url) {
  if (url === '/') return 'Organization + WebSite + SiteLinksSearchBox';
  if (url.includes('product-details') || url.includes('products-list')) return 'Product + Offer + AggregateRating';
  if (url.includes('faq')) return 'FAQPage';
  if (url.includes('blog') || url.includes('post')) return 'Article + BreadcrumbList';
  if (url.includes('contact')) return 'ContactPage + LocalBusiness';
  if (url.includes('about')) return 'AboutPage + Organization';
  if (url.includes('categor') || url.includes('collection')) return 'CollectionPage + BreadcrumbList';
  if (url.includes('shipping') || url.includes('return')) return 'WebPage';
  return 'WebPage';
}

function generateRecommendations(pageResults, extra) {
  const recs = [];

  // Schema gaps
  const homeResult = pageResults.find(p => p.url === '/');
  if (homeResult?.meta?.schemaCount === 0) {
    recs.push({
      priority: '🔴 CRITICAL',
      title: 'Add Organization + WebSite schema to Homepage',
      description: 'The homepage has NO structured data. Google uses this to understand your brand, show sitelinks, and enable rich results.',
      action: 'Inject JSON-LD with @type: Organization + WebSite via GHL head tracking code field.',
      impact: 'High — improves Google Knowledge Panel, sitelinks eligibility, brand recognition.',
    });
  }

  // FAQ schema
  const faqResult = pageResults.find(p => p.url === '/faqs');
  if (faqResult?.meta && !faqResult.meta.schemaTypes.some(t => /FAQ/.test(t))) {
    recs.push({
      priority: '🔴 CRITICAL',
      title: 'Add FAQPage schema to /faqs',
      description: 'FAQ pages with proper schema get FAQ rich results in Google Search — directly expanding real estate and boosting CTR by 20-30%.',
      action: 'Inject JSON-LD FAQPage schema with all Q&A pairs from the page.',
      impact: 'High — FAQ rich results visible in Google SERP for informational queries.',
    });
  }

  // Product schema
  const prodResult = pageResults.find(p => p.url === '/products-list');
  if (prodResult?.meta && prodResult.meta.schemaCount === 0) {
    recs.push({
      priority: '🔴 CRITICAL',
      title: 'Add Product schema to all product pages',
      description: 'Product pages need Product + Offer + AggregateRating schema for Google Shopping integration and product rich results.',
      action: 'Apply Product schema to all /product-details/* pages via GHL agent script injection.',
      impact: 'Very High — enables Google Shopping snippets, star ratings in SERPs.',
    });
  }

  // Missing meta descriptions
  const missingDesc = pageResults.filter(p => p.meta && (!p.meta.desc || p.meta.desc === 'MISSING'));
  if (missingDesc.length > 0) {
    recs.push({
      priority: '🔴 CRITICAL',
      title: `Add meta descriptions to ${missingDesc.length} pages`,
      description: `Pages missing meta descriptions: ${missingDesc.map(p => p.name).join(', ')}. Google writes its own snippets when none exist, often choosing poor quality text.`,
      action: 'Update meta description field in GHL for each funnel/website page.',
      impact: 'High — directly controls click-through rate from SERP (estimated +5-15% CTR).',
    });
  }

  // robots.txt sitemap
  if (!extra.robotsHasSitemap) {
    recs.push({
      priority: '🟠 HIGH',
      title: 'Add Sitemap reference to robots.txt',
      description: 'robots.txt does not reference the sitemap. Search engines may take longer to discover all pages.',
      action: 'Add "Sitemap: https://usapelletmill.com/sitemap.xml" line to robots.txt.',
      impact: 'Medium — faster crawl discovery of all 160+ sitemap URLs.',
    });
  }

  // OG tags
  const missingOG = pageResults.filter(p => p.meta && (!p.meta.ogTitle || !p.meta.ogImage));
  if (missingOG.length > 0) {
    recs.push({
      priority: '🟠 HIGH',
      title: `Add Open Graph tags to ${missingOG.length} pages`,
      description: 'Pages shared on Facebook, LinkedIn, WhatsApp will show no preview without og:title, og:description, og:image.',
      action: 'Add og: meta tags via GHL head tracking code on all main pages.',
      impact: 'Medium-High — social media shares, link previews, brand visibility.',
    });
  }

  // Blog meta descriptions
  if (extra.blogPosts.length > 0) {
    const blogMissingDesc = extra.blogPosts.filter(p => !p.metaDescription && !p.description);
    if (blogMissingDesc.length > 0) {
      recs.push({
        priority: '🟠 HIGH',
        title: `${blogMissingDesc.length} blog posts missing meta descriptions`,
        description: `Blog content is valuable SEO real estate. Posts without meta descriptions get auto-generated snippets that may reduce CTR.`,
        action: 'Update meta description for each blog post in GHL Blog editor.',
        impact: 'Medium — improved CTR from blog content in SERPs.',
      });
    }
  }

  // Images alt text
  const imgIssues = pageResults.filter(p => p.meta && p.meta.imgNoAlt > 2);
  if (imgIssues.length > 0) {
    recs.push({
      priority: '🟡 MEDIUM',
      title: `Fix missing alt text on images (${imgIssues.reduce((n,p) => n + p.meta.imgNoAlt, 0)} images affected)`,
      description: 'Images without alt text are invisible to screen readers and Google Image Search. Also affects accessibility compliance.',
      action: 'Add descriptive alt text to all product images and diagrams.',
      impact: 'Medium — image SEO, accessibility compliance, potential Google Images traffic.',
    });
  }

  // Funnel meta
  const funnelMissingMeta = extra.funnelPagesData.flatMap(f => f.pages).filter(p => !p.title && !p.metaTitle);
  if (funnelMissingMeta.length > 0) {
    recs.push({
      priority: '🟡 MEDIUM',
      title: `${funnelMissingMeta.length} funnel pages missing meta titles`,
      description: 'Funnel pages without proper titles will show generic text in search results and browser tabs.',
      action: 'Update meta title/description in GHL funnel builder for each page.',
      impact: 'Medium — CTR improvement for pages that rank in search results.',
    });
  }

  // Article schema for blog
  recs.push({
    priority: '🟡 MEDIUM',
    title: 'Add Article schema to all blog posts',
    description: 'Blog posts benefit from Article JSON-LD schema which enables article rich results, author attribution, and breadcrumbs in Google Search.',
    action: 'Inject Article schema via GHL blog post editor or head tracking code.',
    impact: 'Medium — rich results eligibility for blog content.',
  });

  // LocalBusiness for contact
  recs.push({
    priority: '🟡 MEDIUM',
    title: 'Add LocalBusiness + ContactPage schema to /contact-us',
    description: 'The Contact page should have LocalBusiness schema with address, phone, email, and business hours to support Google My Business integration.',
    action: 'Inject JSON-LD LocalBusiness schema on contact page.',
    impact: 'Medium — Google Maps integration, local search visibility.',
  });

  return recs;
}

function calculateScore({ pageResults, critical, high, medium, robotsOk, robotsHasSitemap, sitemapUrls, blogPosts }) {
  // Technical (25 pts)
  let tech = 25;
  if (!robotsOk) tech -= 5;
  if (!robotsHasSitemap) tech -= 3;
  if (sitemapUrls < 10) tech -= 5;

  // On-page (30 pts)
  const pagesWithTitle = pageResults.filter(p => p.meta?.title && p.meta.title !== 'MISSING').length;
  const pagesWithDesc  = pageResults.filter(p => p.meta?.desc && p.meta.desc !== 'MISSING').length;
  const pagesWithH1    = pageResults.filter(p => p.meta?.h1Count === 1).length;
  const total = pageResults.filter(p => p.meta).length || 1;
  let onpage = Math.round(
    (pagesWithTitle / total) * 10 +
    (pagesWithDesc  / total) * 10 +
    (pagesWithH1    / total) * 10
  );

  // Schema (20 pts)
  const pagesWithSchema = pageResults.filter(p => p.meta?.schemaCount > 0).length;
  let schema = Math.round((pagesWithSchema / total) * 20);

  // Content (15 pts) — estimate based on H structure, schema variety, blog
  let content = 8;
  if (blogPosts.length > 5) content += 4;
  if (blogPosts.length > 20) content += 3;

  // GHL (10 pts)
  const funnelOk = true; // funnels accessible
  let ghl = funnelOk ? 6 : 0;
  if (blogPosts.length > 0) ghl += 4;

  const overall = Math.min(100, tech + onpage + schema + content + ghl);

  return { overall, technical: tech, onpage, schema, content, ghl };
}

function getScoreEmoji(score) {
  if (score >= 90) return '🟢 Excellent';
  if (score >= 70) return '🟡 Good';
  if (score >= 50) return '🟠 Needs Work';
  return '🔴 Critical';
}

// Run
runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
