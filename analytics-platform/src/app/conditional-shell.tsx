'use client'

import type { PropsWithChildren } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Layouts/sidebar'
import { Header } from '@/components/Layouts/header'

/**
 * El template NextAdmin (sidebar + header) solo aplica a rutas legacy/demo.
 * Las rutas /dashboard/* usan su propio layout (Nexphaz Analytics).
 */
export function ConditionalShell({ children }: PropsWithChildren) {
  const pathname = usePathname() ?? ''
  const hideNextAdminChrome = pathname.startsWith('/dashboard')

  if (hideNextAdminChrome) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="w-full bg-gray-2 dark:bg-[#020d1a]">
        <Header />

        <main className="isolate mx-auto w-full max-w-screen-2xl overflow-hidden p-4 md:p-6 2xl:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}
