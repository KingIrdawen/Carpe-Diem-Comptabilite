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

interface SyncStatus {
  lastSyncedBlock: string
  lastSyncedAt: string | null
}

const PRESETS = [
  { label: 'Cette semaine', days: 7 },
  { label: 'Ce mois', days: 30 },
  { label: '3 mois', days: 90 },
  { label: 'Tout (depuis déploiement)', days: 130 },
]

function subtractDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(subtractDays(30))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const router = useRouter()

  function loadData() {
    setLoading(true)
    setError(null)
    fetch('/api/events')
      .then(async r => {
        if (r.status === 401 || r.status === 403) { router.push('/'); return null }
        const text = await r.text()
        try { return JSON.parse(text) }
        catch { throw new Error(`Réponse serveur invalide : ${text.slice(0, 120)}`) }
      })
      .then(data => {
        if (!data) return
        if (data.error) { setError(data.error); return }
        setSyncStatus(data.syncStatus)
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
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      const data = await res.json()
      if (!res.ok) { setSyncError(data.error); return }
      const d = data.debug
      const debugMsg = d ? ` | blocs ${d.fromBlock}→${d.toBlock} (${d.chunkCount} chunks) | logs bruts: ${d.rawLogs} | décodés: ${d.decoded} | échecs décodage: ${d.failed}${d.rpcError ? ' | erreur RPC: ' + d.rpcError : ''}` : ''
      setSyncSuccess(`✓ ${data.synced} événement(s) synchronisé(s)${debugMsg}`)
      loadData()
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Erreur sync')
    } finally {
      setSyncing(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  function fmt(n: number, d = 2) {
    return n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
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

      <main className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Panneau de synchronisation */}
        <section className="border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Synchronisation blockchain</h3>
              {syncStatus?.lastSyncedAt ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  Dernière sync : {new Date(syncStatus.lastSyncedAt).toLocaleString('fr-FR')}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5">Aucune synchronisation effectuée</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setStartDate(subtractDays(p.days)); setEndDate(new Date().toISOString().slice(0, 10)) }}
                className="px-3 py-1 rounded-full text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Du</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Au</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {syncing ? 'Synchronisation…' : 'Synchroniser'}
            </button>
          </div>

          {syncError && <p className="text-sm text-red-400">{syncError}</p>}
          {syncSuccess && <p className="text-sm text-green-400">{syncSuccess}</p>}
        </section>

        <h2 className="text-2xl font-semibold">Tableau de bord</h2>

        {loading && <p className="text-gray-400 animate-pulse">Chargement depuis la base de données…</p>}
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg p-3">{error}</p>}

        {stats && (
          <>
            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Flux USDC</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Dépôts utilisateurs" value={`${fmt(stats.totalDepositsUsdc)} USDC`} sub={`${stats.depositCount} tx · ${stats.userCount} utilisateurs`} color="green" />
                <KpiCard label="Charges (services)" value={`${fmt(stats.totalChargedUsdc)} USDC`} sub="Converties en DIEM" color="blue" />
                <KpiCard label="Routes externes" value={`${fmt(stats.totalExternalUsdc)} USDC`} sub="Float + Treasury" color="purple" />
                <KpiCard label="Migrations" value={`${fmt(stats.totalMigratedUsdc)} USDC`} sub="Crédits remboursés" color="orange" />
              </div>
            </section>
            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Flux DIEM</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <KpiCard label="Frais protocole" value={`${fmt(stats.totalFeesDiem, 4)} DIEM`} sub="Fees sur charges" color="green" />
                <KpiCard label="Retraits providers" value={`${fmt(stats.totalProviderWithdrawalsDiem, 4)} DIEM`} sub="Claimés par providers" color="red" />
                <KpiCard label="Treasury" value={`${fmt(stats.totalTreasuryDiem, 4)} DIEM`} sub="Vers Treasury Safe" color="yellow" />
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
