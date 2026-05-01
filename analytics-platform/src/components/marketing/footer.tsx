import Link from 'next/link'

const COLS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features',        href: '#features' },
      { label: 'Pricing',         href: '#pricing' },
      { label: 'Changelog',       href: '#' },
      { label: 'Roadmap',         href: '#' },
      { label: 'Open source',     href: '#' },
      { label: 'Status',          href: '#' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documentation',   href: '#' },
      { label: 'API reference',   href: '#' },
      { label: 'Integrations',    href: '#' },
      { label: 'Blog',            href: '#' },
      { label: 'Case studies',    href: '#' },
      { label: 'Community',       href: '#' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About us',        href: '#' },
      { label: 'Contact',         href: '#' },
      { label: 'Privacy policy',  href: '#' },
      { label: 'Data policy',     href: '#' },
      { label: 'DPA',             href: '#' },
      { label: 'Security',        href: '#' },
    ],
  },
  {
    heading: 'Comparisons',
    links: [
      { label: 'vs Google Analytics', href: '#' },
      { label: 'vs Fathom',           href: '#' },
      { label: 'vs Matomo',           href: '#' },
      { label: 'vs Simple Analytics', href: '#' },
      { label: 'vs Cloudflare',       href: '#' },
      { label: 'vs Mixpanel',         href: '#' },
    ],
  },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-16">

          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: '#6366f1' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 18 Q6 6 12 10 Q18 14 21 6" stroke="white" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="10" r="2" fill="white"/>
                </svg>
              </div>
              <span className="text-slate-900 font-bold text-[15px] tracking-tight">Plausible</span>
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs mb-5">
              Simple, open-source, lightweight and privacy-friendly web analytics.
              Made and hosted in the EU.
            </p>
            <div className="flex items-center gap-3">
              {[
                { label: 'Twitter / X', path: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z' },
                { label: 'GitHub',    path: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22' },
                { label: 'Mastodon', path: 'M21.327 8.566c0-4.339-2.843-5.61-2.843-5.61-1.433-.658-3.894-.935-6.451-.956h-.063c-2.557.021-5.016.298-6.45.956 0 0-2.843 1.272-2.843 5.61 0 .993-.019 2.181.012 3.441.103 4.243.778 8.425 4.701 9.463 1.809.479 3.362.579 4.612.51 2.268-.126 3.542-.822 3.542-.822l-.075-1.646s-1.621.511-3.441.449c-1.804-.062-3.707-.194-3.999-2.409a4.523 4.523 0 01-.04-.621s1.77.433 4.014.536c1.372.063 2.658-.08 3.965-.236 2.506-.299 4.688-1.843 4.962-3.254.434-2.223.398-5.424.398-5.424zm-3.353 5.59h-2.081V9.057c0-1.075-.452-1.62-1.357-1.62-1 0-1.501.647-1.501 1.927v2.791h-2.069V9.364c0-1.28-.501-1.927-1.502-1.927-.905 0-1.357.545-1.357 1.62v5.099H6.026V8.903c0-1.074.273-1.927.823-2.558.568-.631 1.313-.955 2.24-.955 1.07 0 1.82.41 2.24 1.229l.48.804.481-.804c.42-.819 1.17-1.229 2.24-1.229.927 0 1.672.324 2.24.955.549.631.822 1.484.822 2.558v5.253z' },
              ].map(s => (
                <a key={s.label} href="#" aria-label={s.label}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center
                    text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50
                    transition-all duration-150">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={s.path}/>
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.heading}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
                {col.heading}
              </p>
              <ul className="space-y-2.5">
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link href={l.href}
                      className="text-sm text-slate-500 hover:text-slate-900 transition-colors duration-150">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row
          items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            © {year} Plausible Analytics. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            {['Privacy', 'Terms', 'Cookies', 'DPA'].map(l => (
              <a key={l} href="#"
                className="text-xs text-slate-400 hover:text-slate-700 transition-colors duration-150">
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
