'use client'

// Replica exacta del <nav> del HTML de referencia (plausible.io/plausible.io)
// Clases originales: relative z-20 py-8 · container · flex items-center justify-between
import Link from 'next/link'

export function Navbar() {
  return (
    <nav className="relative z-20 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="relative flex items-center justify-between sm:h-10 md:justify-center">

          {/* Logo — referencia: md:absolute md:inset-y-0 md:left-0 */}
          <div className="flex items-center flex-1 md:absolute md:inset-y-0 md:left-0">
            <Link href="/">
              {/* Logo SVG inline — versión dark (texto blanco) */}
              <svg width="130" height="32" viewBox="0 0 130 32" fill="none" aria-label="Plausible logo">
                <rect width="28" height="28" rx="6" y="2" fill="#5850EC"/>
                <path d="M7 22 L11 12 L15 17 L19 11 L23 22 Z" fill="white" opacity="0.9"/>
                <text x="36" y="22" fontFamily="Inter, sans-serif" fontWeight="700"
                  fontSize="16" fill="#F9FAFB" letterSpacing="-0.3">
                  Plausible
                </text>
              </svg>
            </Link>
          </div>

          {/* Right — Login + Sign up (referencia exacta) */}
          <div className="absolute inset-y-0 right-0 flex items-center justify-end">
            <ul className="flex">
              <li>
                <div className="inline-flex">
                  <Link href="/dashboard"
                    className="font-medium transition duration-150 ease-in-out"
                    style={{ color: '#9CA3AF' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#9CA3AF')}>
                    Login
                  </Link>
                </div>
                {/* Botón Sign up — referencia: px-5 py-2 text-base bg-indigo-600 rounded-md */}
                <div className="inline-flex ml-6 rounded shadow-sm">
                  <Link href="/dashboard"
                    className="inline-flex items-center justify-center px-5 py-2 text-base font-medium
                      text-white border border-transparent leading-6 rounded-md
                      transition duration-150 ease-in-out focus:outline-none"
                    style={{ background: '#5850EC' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#4F46E5')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#5850EC')}>
                    Sign up
                  </Link>
                </div>
              </li>
            </ul>
          </div>

        </nav>
      </div>
    </nav>
  )
}
