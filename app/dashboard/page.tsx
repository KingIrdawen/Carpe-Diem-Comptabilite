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

interface SyncedRange {
  start: string
  end: string
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
  const [syncedRanges, setSyncedRanges] = useState<SyncedRange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<string | null>(null)
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
        setSyncedRanges(data.syncedRanges ?? [])
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

  async function syncRange(start: string, end: string): Promise<number> {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end }),
    })
    const text = await res.text()
    try {
      const data = JSON.parse(text)
      if (!res.ok) throw new Error(data.error)
      return data.synced ?? 0
    } catch {
      throw new Error(`Réponse invalide : ${text.slice(0, 120)}`)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncSuccess(null)
    setSyncProgress(null)

    // Split into 7-day chunks to stay under Vercel's 10s function timeout
    const chunks: { start: string; end: string }[] = []
    let cur = new Date(startDate)
    const end = new Date(endDate)
    while (cur < end) {
      const next = new Date(cur)
      next.setDate(next.getDate() + 7)
      chunks.push({
        start: cur.toISOString().slice(0, 10),
        end: (next > end ? end : next).toISOString().slice(0, 10),
      })
      cur = next
    }

    let totalSynced = 0
    const failed: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      if (chunks.length > 1) setSyncProgress(`Partie ${i + 1}/${chunks.length} (${c.start} → ${c.end})…`)
      let ok = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt))
          totalSynced += await syncRange(c.start, c.end)
          ok = true
          break
        } catch { /* retry */ }
      }
      if (!ok) failed.push(`${c.start}→${c.end}`)
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000))
    }

    if (failed.length === 0) {
      setSyncSuccess(`✓ ${totalSynced} événement(s) synchronisé(s)`)
    } else {
      setSyncError(`${totalSynced} événement(s) synchronisé(s) — ${failed.length} tranche(s) en échec : ${failed.join(', ')}`)
    }
    loadData()
    setSyncing(false)
    setSyncProgress(null)
  }

  async function handleFullSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncSuccess(null)
    setSyncProgress(null)

    // Reset old synced_ranges so stale records don't pollute the calendar
    await fetch('/api/sync-reset', { method: 'POST' }).catch(() => null)

    const DEPLOY_DATE = '2026-05-08'
    const todayStr = new Date().toISOString().slice(0, 10)

    // Use the same calendar week boundaries as SyncCalendar (starting Jan 1)
    const allWeeks = generateCalendarWeeks(2026)
    const weeks = allWeeks.filter(w => w.end >= DEPLOY_DATE && w.start <= todayStr)

    let totalSynced = 0
    const failed: string[] = []

    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i]
      setSyncProgress(`Semaine ${i + 1} / ${weeks.length} (${w.start} → ${w.end})…`)

      let ok = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt))
          totalSynced += await syncRange(w.start, w.end)
          ok = true
          break
        } catch { /* retry */ }
      }
      if (!ok) failed.push(`${w.start}→${w.end}`)

      if (i < weeks.length - 1) await new Promise(r => setTimeout(r, 2000))
    }

    if (failed.length === 0) {
      setSyncSuccess(`✓ Historique complet synchronisé — ${totalSynced} événement(s)`)
    } else {
      setSyncSuccess(`✓ ${totalSynced} événement(s) synchronisé(s) — ${failed.length} semaine(s) en échec : ${failed.join(', ')}`)
    }
    loadData()
    setSyncing(false)
    setSyncProgress(null)
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
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {syncing && !syncProgress ? 'Synchronisation…' : 'Synchroniser'}
              </button>
              <button
                onClick={handleFullSync}
                disabled={syncing}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {syncProgress ? '…' : 'Tout l\'historique'}
              </button>
              {startDate && endDate && (() => {
                const diff = new Date(endDate).getTime() - new Date(startDate).getTime()
                const blocks = Math.max(0, Math.round(diff / 1000 / 2))
                return <span className="text-xs text-gray-400">({blocks.toLocaleString('fr-FR')} blocs)</span>
              })()}
            </div>
          </div>

          {syncProgress && <p className="text-sm text-blue-400 animate-pulse">{syncProgress}</p>}
          {syncError && <p className="text-sm text-red-400">{syncError}</p>}
          {syncSuccess && <p className="text-sm text-green-400">{syncSuccess}</p>}
        </section>

        <SyncCalendar syncedRanges={syncedRanges} />

        <h2 className="text-2xl font-semibold">Tableau de bord</h2>

        {loading && <p className="text-gray-400 animate-pulse">Chargement depuis la base de données…</p>}
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg p-3">{error}</p>}

        {stats && (
          <>
            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Flux USDC</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Dépôts utilisateurs" value={`${fmt(stats.totalDepositsUsdc)} USDC`} sub={`${stats.depositCount} tx · ${stats.userCount} utilisateurs`} color="green" tooltip="USDC entrant dans le contrat. Inclut les dépôts manuels (Deposit) et les paiements automatiques pull (X402Pull). Représente le chiffre d'affaires brut." />
                <KpiCard label="Charges (services)" value={`${fmt(stats.totalChargedUsdc)} USDC`} sub="Converties en DIEM" color="blue" tooltip="USDC prélevé sur le solde des utilisateurs pour payer des services, puis converti en DIEM. Correspond à la consommation de crédits (Charge et BatchCharge)." />
                <KpiCard label="Routes externes" value={`${fmt(stats.totalExternalUsdc)} USDC`} sub="Float + Treasury" color="purple" tooltip="USDC envoyé hors du protocole via des routes de paiement externes (vers un float de liquidité ou la treasury). Paiements sortants vers des tiers." />
                <KpiCard label="Migrations" value={`${fmt(stats.totalMigratedUsdc)} USDC`} sub="Crédits remboursés" color="orange" tooltip="USDC remboursé lors de la migration de crédits d'un compte vers un autre. Sortie de liquidité sans contrepartie de service rendu." />
              </div>
            </section>
            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Flux DIEM</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <KpiCard label="Frais protocole" value={`${fmt(stats.totalFeesDiem, 4)} DIEM`} sub="Fees sur charges" color="green" tooltip="Part du DIEM généré lors des charges qui revient au protocole Carpe Diem. Revenu net du protocole en token interne." />
                <KpiCard label="Retraits providers" value={`${fmt(stats.totalProviderWithdrawalsDiem, 4)} DIEM`} sub="Claimés par providers" color="red" tooltip="DIEM retiré par les prestataires de services (providers). Rémunération sortante vers les providers enregistrés dans le contrat." />
                <KpiCard label="Treasury" value={`${fmt(stats.totalTreasuryDiem, 4)} DIEM`} sub="Vers Treasury Safe" color="yellow" tooltip="DIEM envoyé vers le Safe treasury de l'association. Mise en réserve ou dotation de trésorerie de Carpe Diem." />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function generateCalendarWeeks(year: number) {
  const weeks: { start: string; end: string; label: string; month: string }[] = []
  let cur = new Date(`${year}-01-01`)
  let weekNum = 1
  const yearEnd = new Date(`${year}-12-31`)
  while (cur <= yearEnd) {
    const end = new Date(cur)
    end.setDate(end.getDate() + 6)
    const endCapped = end > yearEnd ? yearEnd : end
    weeks.push({
      start: cur.toISOString().slice(0, 10),
      end: endCapped.toISOString().slice(0, 10),
      label: `S${weekNum}`,
      month: cur.toLocaleString('fr-FR', { month: 'short' }),
    })
    cur = new Date(end)
    cur.setDate(cur.getDate() + 1)
    weekNum++
  }
  return weeks
}

function SyncCalendar({ syncedRanges }: { syncedRanges: SyncedRange[] }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const YEAR = 2026

  const weeks = generateCalendarWeeks(YEAR).map(w => ({
    ...w,
    future: w.start > todayStr,
  }))

  // A week is synced only when there is a recorded range whose start matches exactly
  // (handleFullSync records ranges aligned to these exact calendar week boundaries)
  function isSynced(weekStart: string, weekEnd: string) {
    if (weekEnd > todayStr) return false // partial/future week never green
    return syncedRanges.some(r => r.start === weekStart)
  }

  const byMonth: Record<string, typeof weeks> = {}
  for (const w of weeks) {
    if (!byMonth[w.month]) byMonth[w.month] = []
    byMonth[w.month].push(w)
  }

  const syncedCount = weeks.filter(w => isSynced(w.start, w.end)).length
  const pastCount = weeks.filter(w => !w.future).length

  return (
    <section className="border border-gray-700 rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-sm">Calendrier des synchronisations — {YEAR}</h3>
      <div className="space-y-2">
        {Object.entries(byMonth).map(([month, ws]) => (
          <div key={month} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-14 shrink-0">{month}</span>
            <div className="flex flex-wrap gap-1">
              {ws.map(w => {
                const synced = isSynced(w.start, w.end)
                return (
                  <div
                    key={w.start}
                    title={`${w.start} → ${w.end}`}
                    className={`w-9 h-7 rounded text-xs flex items-center justify-center font-mono cursor-default
                      ${synced ? 'bg-green-600 text-white'
                        : w.future ? 'bg-gray-800 text-gray-600'
                        : 'bg-gray-400 text-gray-800'}`}
                  >
                    {w.label}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{syncedCount}/{pastCount} semaine(s) synchronisée(s)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-600" /> synchronisée</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-400" /> non synchronisée</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-800" /> future</span>
      </div>
    </section>
  )
}

function KpiCard({ label, value, sub, color, tooltip }: { label: string; value: string; sub?: string; color: string; tooltip?: string }) {
  const colors: Record<string, string> = {
    green: 'border-green-500/30 bg-green-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
  }
  return (
    <div className={`relative group rounded-xl border p-5 space-y-1 ${colors[color] ?? ''}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-semibold font-mono">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full left-0 mb-2 z-10 w-64 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-300 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
          {tooltip}
        </div>
      )}
    </div>
  )
}
