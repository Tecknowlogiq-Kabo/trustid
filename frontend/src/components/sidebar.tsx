'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'New Verification', href: '/verification/create' },
  { label: 'Delegated Verification', href: '/delegation/create' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-[#1E293B] min-h-screen">
      <div className="px-5 pt-6 pb-2">
        <span className="text-white text-lg font-bold tracking-tight">TrustID</span>
      </div>
      <div className="mx-4 h-px bg-[#334155] my-3" />
      <nav className="flex flex-col gap-1 px-2">
        {navItems.map(({ label, href }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#334155]'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
