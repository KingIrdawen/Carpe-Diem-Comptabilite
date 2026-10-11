'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import PrintButton from './PrintButton'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/comptabilite', label: 'Comptabilité' },
  { href: '/statistiques', label: 'Statistiques' },
  { href: '/exports', label: 'Exports' },
]

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  return (
    <nav className="border-b border-gray-800 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-bold text-lg">Carpe Diem — Comptabilité</h1>
      <div className="flex flex-wrap items-center gap-4">
        {LINKS.map(l => l.href === pathname
          // La page courante reste du texte : elle reste visible à l'impression (les liens sont masqués)
          ? <span key={l.href} aria-current="page" className="text-sm text-gray-100 font-medium">{l.label}</span>
          : <Link key={l.href} href={l.href} className="text-sm text-gray-400 hover:text-white transition-colors">{l.label}</Link>
        )}
        {/* Les statistiques (graphiques + tableau large) s'impriment en paysage */}
        <PrintButton landscape={pathname === '/statistiques'} />
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-white transition-colors">Déconnexion</button>
      </div>
    </nav>
  )
}
