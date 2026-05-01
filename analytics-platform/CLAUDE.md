# CLAUDE.md — Analytics Platform

## What This Project Is

A **full-stack SEO/CRO analytics platform** that combines:
- First-party tracking (JavaScript pixel → PostgreSQL)
- Google Search Console integration (keywords, rich results, security, sitemaps)
- An **autonomous AI agent** that analyzes page performance and applies optimizations to GoHighLevel (GHL) sites using Claude AI
- Next.js dashboard for clients to visualize data, alerts, and AI recommendations

**Core value:** The AI agent runs daily, detects underperforming pages, generates optimized content via Claude, and safely applies changes to GHL pages/funnels — with backups, rate limits, and human-approval gates.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Recharts, ApexCharts, Radix UI |
| Auth | NextAuth v4 (credentials + Google OAuth for GSC) |
| Backend | Next.js API Routes (serverless) |
| Database | PostgreSQL (primary), Redis (caching/sessions) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) via Anthropic SDK |
| GHL Integration | GoHighLevel REST API v2 (`https://services.leadconnectorhq.com`) |
| GSC Integration | Google Search Console API (OAuth2) |
| Email Parsing | Gmail API |
| Geolocation | MaxMind GeoLite2 |
| Scripts | tsx (TypeScript runtime for cron jobs) |

---

## Directory Map

```
src/
├── app/
│   ├── (home)/              # Public homepage
│   ├── (marketing)/         # /servicios, /contacto, /resultados, /nosotros
│   ├── auth/sign-in/        # Login page
│   ├── dashboard/
│   │   ├── page.tsx         # Site selector
│   │   └── [siteId]/        # Per-site dashboard views
│   │       ├── page.tsx         # Overview
│   │       ├── alerts/          # Alert center
│   │       ├── keywords/        # GSC keyword analysis
│   │       ├── rich-results/    # Schema markup status
│   │       ├── security/        # Security issues
│   │       ├── sitemaps/        # Sitemap coverage
│   │       └── merchant/        # E-commerce listings
│   └── api/
│       ├── collect/route.ts     # Pixel tracking endpoint
│       ├── auth/gsc/            # GSC OAuth (connect + callback)
│       ├── sites/               # Site management
│       └── dashboard/[siteId]/  # Per-site data APIs
└── lib/
    ├── db.ts                # PostgreSQL pool
    ├── redis.ts             # Redis client
    ├── gsc/client.ts        # Google Search Console API wrapper
    ├── gmail/client.ts      # Gmail API wrapper
    ├── geoip.ts             # MaxMind IP lookup
    ├── bot-detection.ts     # isbot filtering
    └── session-manager.ts   # Session tracking

scripts/
├── cron/
│   ├── 01-collect-gsc.ts        # Daily 02:00 — Fetch GSC data
│   ├── 02-inspect-rich-results.ts # Daily 03:00 — Check schema markup
│   ├── 03-parse-gsc-emails.ts   # Daily 04:00 — Parse Gmail alerts
│   ├── 04-aggregate-stats.ts    # Hourly — Pre-aggregate page_stats_daily
│   ├── 05-generate-ai-recommendations.ts # Daily 05:00 — Claude recommendations
│   ├── 06-update-geoip.ts       # Monthly — MaxMind DB update
│   └── 07-ghl-agent.ts          # Daily 06:00 — Main AI agent orchestration
└── agent/
    ├── orchestrator.ts          # Entry point: load → sync → analyze → decide → execute
    ├── types.ts                 # All interfaces + performance thresholds
    ├── analysis/analyticsEngine.ts   # Compute page metrics from page_stats_daily
    ├── decision/decisionEngine.ts    # Rule-based + Claude action generation
    ├── diagnostic/diagnosticEngine.ts # Detect issues (CTR, bounce, scroll, etc.)
    ├── action/
    │   ├── actionEngine.ts          # Execute with safety checks
    │   ├── ghl/ghlClient.ts         # GHL API wrapper
    │   └── strategies/
    │       ├── directApiStrategy.ts       # Update meta title/desc
    │       ├── scriptInjectionStrategy.ts # Inject JSON-LD / head/body code
    │       └── htmlPatchStrategy.ts       # DOM patch for CTA/heading text
    ├── safety/
    │   ├── backupManager.ts     # Snapshot before every change
    │   ├── changeLogger.ts      # Log all changes to ghl_changes
    │   ├── changeQueue.ts       # Queue high-impact changes for approval
    │   └── rateLimiter.ts       # Daily/weekly/cooldown limits
    └── learning/
        ├── performanceTracker.ts  # Evaluate changes after 14 days
        └── strategyEvaluator.ts   # Update strategy confidence scores

database/migrations/
    001_sites.sql              # clients, sites
    002_sessions.sql           # session tracking
    003_events.sql             # events (pageview, click, conversion)
    004_pages.sql              # page registry + page_stats_daily
    005_gsc.sql                # GSC tables
    006_alerts.sql             # alert system
    007_ai_recommendations.sql # AI output tables
    008_views.sql              # Materialized views
    009_functions.sql          # PG functions + triggers
    010_demo_data.sql          # Sample data
    011_analytics_indexes.sql  # Performance indexes
    012_ghl_agent.sql          # GHL integration tables ← run this if missing
```

---

## Database Key Tables

| Table | Purpose |
|---|---|
| `sites` | Sites being tracked (domain, gsc_property, tracking_id) |
| `sessions` | User sessions (duration, pages, is_bot, did_convert) |
| `events` | Raw tracking events (pageview, click, conversion, form_submit) |
| `page_stats_daily` | Pre-aggregated daily metrics per page (bounce, duration, scroll, cta_clicks, gsc data) |
| `gsc_performance` | GSC data by date/query/page/country/device |
| `gsc_keywords` | Keyword opportunity scores |
| `gsc_rich_results` | Schema markup status (FAQPage, Product, Article) |
| `ai_recommendations` | Claude-generated site/page recommendations |
| `ai_reports` | Weekly/monthly AI reports |
| `ghl_sites` | GHL config per site (location_id, api_key, agent limits, dry_run) |
| `ghl_pages` | Cached GHL pages/funnels (synced by agent) |
| `ghl_changes` | Full audit log of all agent changes + effectiveness data |
| `ghl_page_backups` | Pre-change snapshots (enables rollback) |
| `ghl_strategy_scores` | Learning: action type effectiveness by site |
| `ghl_change_queue` | High-impact changes awaiting human approval |

**Note:** Migration `012_ghl_agent.sql` must be applied before GHL agent tables exist.

---

## GHL Agent — How It Works

Runs daily at 06:00 via `npm run cron:ghl-agent`. Pipeline:

1. **Housekeeping** — Expire stale queue items (>7 days)
2. **Learning loop** — Evaluate changes applied >14 days ago, update `ghl_strategy_scores`
3. **Per-site loop** for each `ghl_sites` row with `agent_enabled = true`:
   a. Sync pages from GHL API → cache in `ghl_pages`
   b. Analyze metrics from `page_stats_daily` (28-day rolling window)
   c. Diagnose issues (CTR, bounce, scroll, duration, CTA)
   d. Generate actions with Claude (meta titles, meta descs, schemas, CTA text)
   e. Apply via safety layer (backup → log pending → rate check → execute → log result)

**Safety rules:**
- `dry_run = true` → simulates only, never applies
- Actions with `impact_score >= 8` or `html_patch` type → queued for human approval
- Max 5 changes/day per site, max 2 changes/page per week, 24h cooldown

**GHL API capabilities (via `ghlClient.ts`):**
- List funnels → get funnel pages → update funnel page metadata
- List website builder pages → update page metadata
- List blog posts → update blog metadata
- All via `https://services.leadconnectorhq.com`

---

## Performance Thresholds (from `scripts/agent/types.ts`)

| Metric | Critical | Low | Target |
|---|---|---|---|
| GSC CTR | < 0.5% | < 2% | 5% |
| Bounce rate | > 80% | > 65% | 45% |
| Scroll depth | < 20% | < 35% | 60% |
| Avg duration | < 15s | < 30s | 90s |
| CTA click rate | < 1% | < 3% | 8% |

Min 50 impressions required for CTR analysis. Min 20 visits for engagement analysis.

---

## Environment Variables

```bash
DATABASE_URL=postgresql://postgres:1234@127.0.0.1:5432/analytics_db
DATABASE_SSL=false
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...        # GSC OAuth
GOOGLE_CLIENT_SECRET=...    # GSC OAuth
ANTHROPIC_API_KEY=...       # Claude AI (required for cron 05 and 07)
REDIS_URL=redis://localhost:6379  # Optional
```

GHL API keys are stored **per-site** in `ghl_sites.api_key` (not in .env).

---

## Adding a New GHL Site

```sql
INSERT INTO ghl_sites (site_id, location_id, api_key, dry_run)
VALUES (<site_id>, '<GHL_Location_ID>', '<GHL_API_Key>', true);
-- Set dry_run=false only after verifying the connection works
```

Test the connection:
```bash
DATABASE_URL=... npx tsx scripts/test-ghl-connection.ts
```

Apply the GHL migration if needed:
```bash
psql $DATABASE_URL -f database/migrations/012_ghl_agent.sql
```

---

## Running the Platform

```bash
npm run dev              # Start Next.js dev server (port 3000)
npm run build            # Production build
npm run cron:gsc         # 01 — Fetch GSC data
npm run cron:rich        # 02 — Rich results inspection
npm run cron:emails      # 03 — Parse GSC email alerts
npm run cron:aggregate   # 04 — Aggregate page stats
npm run cron:ai          # 05 — Generate AI recommendations
npm run cron:geoip       # 06 — Update MaxMind GeoIP
npm run cron:ghl-agent   # 07 — Run GHL AI agent
```

---

## Tracked Clients / Sites

| site_id | Domain | GHL Location |
|---|---|---|
| 4 | usapelletmill.com | N7anUJ0ooIgRY4f6uypr |

---

## Frontend Design Rules (Keep)

- Invoke `frontend-design` skill before writing any frontend code
- Dev server: `node serve.mjs` at `http://localhost:3000`
- Screenshots via `node screenshot.mjs http://localhost:3000`
- Tailwind via CDN, single `index.html` unless told otherwise
- Check `brand_assets/` folder before designing
- Never use default Tailwind blue/indigo as primary color
- Never use `transition-all`
- Never stop after one screenshot pass
