'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Stats {
  totalDepositsUsdc: number
  totalChargedUsdc: number
  totalExternalUsdc: number
  totalMigratedUsdc: number
  totalFeesDiem: number
  totalProviderWithdrawalsDiem: number
  totalRebatesUsdcIn: number
  totalTreasuryDiem: number
  depositCount: number
  userCount: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/events')
      .then(r => {
        if (r.status === 401 || r.status === 403) { router.push('/'); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (data.error) { setError(data.error); return }
        const s: Stats = {
          totalDepositsUsdc: data.deposits.reduce((a: number, d: { amountUsdc: number }) => a + d.amountUsdc, 0),
          totalChargedUsdc: data.charges.reduce((a: number, d: { amountUsdc: number }) => a + d.amountUsdc, 0) +
            data.batchCharges.reduce((a: number, d: { totalUsdc: number }) => a + d.totalUsdc, 0),
          totalExternalUsdc: data.externalRoutes.reduce((a: number, d: { toFloatUsdc: number; toTreasuryUsdc: number }) => a + d.toFloatUsdc + d.toTreasuryUsdc, 0),
          totalMigratedUsdc: data.migrations.reduce((a: number, d: { amountUsdc: number }) => a + d.amountUsdc, 0),
          totalFeesDiem: data.charges.reduce((a: number, d: { feesDiem: number }) => a + d.feesDiem, 0) +
            data.batchCharges.reduce((a: number, d: { feesDiem: number }) => a + d.feesDiem, 0),
          totalProviderWithdrawalsDiem: data.providerWithdrawals.reduce((a: number, d: { amountDiem: number }) => a + d.amountDiem, 0),
          totalRebatesUsdcIn: data.rebates.reduce((a: number, d: { usdcIn: number }) => a + d.usdcIn, 0),
          totalTreasuryDiem: data.treasuryFunds.reduce((a: number, d: { amountDiem: number }) => a + d.amountDiem, 0),
          depositCount: data.deposits.length,
          userCount: new Set(data.deposits.map((d: { user: string }) => d.user)).size,
        }
        setStats(s)
      })
      .catch((e: Error) => setError(e.message ?? 'Impossible de charger les données'))
      .finally(() => setLoading(false))
  }, [router])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-lg">Carpe Diem — Comptabilité</h1>
        <div className="flex items-center gap-4">
          <Link href="/transactions" className="text-sm text-gray-400 hover:text-white transition-colors">Transactions</Link>
          <Link href="/comptabilite" className="text-sm text-gray-400 hover:text-white transition-colors">Comptabilité</Link>
          <Link href="/exports" className="text-sm text-gray-400 hover:text-white transition-colors">Exports</Link>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-white transition-colors">Déconnexion</button>
        </div>
      </nav>

      <main className="p-6 max-w-7xl mx-auto space-y-8">
        <h2 className="text-2xl font-semibold">Tableau de bord</h2>

        {loading && <p className="text-gray-400 animate-pulse">Chargement des données blockchain…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {stats && (
          <>
            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Flux USDC</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Dépôts utilisateurs" value={`${stats.totalDepositsUsdc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} USDC`} sub={`${stats.depositCount} transactions · ${stats.userCount} utilisateurs`} color="green" />
                <KpiCard label="Charges (services)" value={`${stats.totalChargedUsdc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} USDC`} sub="Converties en DIEM" color="blue" />
                <KpiCard label="Routes externes" value={`${stats.totalExternalUsdc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} USDC`} sub="Float + Treasury" color="purple" />
                <KpiCard label="Migrations" value={`${stats.totalMigratedUsdc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} USDC`} sub="Crédits remboursés" color="orange" />
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Flux DIEM</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <KpiCard label="Frais protocole" value={`${stats.totalFeesDiem.toLocaleString('fr-FR', { minimumFractionDigits: 4 })} DIEM`} sub="Fees sur charges" color="green" />
                <KpiCard label="Retraits providers" value={`${stats.totalProviderWithdrawalsDiem.toLocaleString('fr-FR', { minimumFractionDigits: 4 })} DIEM`} sub="Claimés par providers" color="red" />
                <KpiCard label="Treasury (total)" value={`${stats.totalTreasuryDiem.toLocaleString('fr-FR', { minimumFractionDigits: 4 })} DIEM`} sub="Vers Treasury Safe" color="yellow" />
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Rebates</h3>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                <KpiCard label="USDC en rebates" value={`${stats.totalRebatesUsdcIn.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} USDC`} sub="Pool de rebates providers" color="blue" />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'border-green-500/30 bg-green-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
  }
  return (
    <div className={`rounded-xl border p-5 space-y-1 ${colors[color] ?? ''}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-semibold font-mono">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
