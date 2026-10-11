'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts'

// Palettes catégorielles validées (contraste et daltonisme) pour chaque thème de l'app
const THEMES = {
  light: { series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], surface: '#ffffff', grid: '#e5e7eb', muted: '#6b7280', label: '#4b5563', cursor: 'rgba(0,0,0,0.04)' },
  dark: { series: ['#3987e5', '#d95926', '#199e70', '#c98500'], surface: '#0a0a0a', grid: '#262626', muted: '#898781', label: '#c3c2b7', cursor: 'rgba(255,255,255,0.04)' },
}
type Theme = typeof THEMES.light

const darkQuery = '(prefers-color-scheme: dark)'
function useTheme(): Theme {
  const dark = useSyncExternalStore(
    cb => { const mq = matchMedia(darkQuery); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb) },
    () => matchMedia(darkQuery).matches,
    () => true,
  )
  return dark ? THEMES.dark : THEMES.light
}

interface MonthStats {
  key: string
  label: string
  partial: boolean
  activeUsers: number
  newUsers: number
  txCount: number
  depositsUsdc: number
  chargesUsdc: number
  externalUsdc: number
  migrationsUsdc: number
  rebatesUsdc: number
  netUsdc: number
  feesDiem: number
  feesUsdc: number
  withdrawalsDiem: number
  withdrawalsUsdc: number
  treasuryDiem: number
  treasuryUsdc: number
}

type Ev = { timestamp: number; blockNumber: string; user?: string } & Record<string, unknown>

// Sur Base, 2 s/bloc depuis la genèse : sert de repli si le timestamp est absent
function resolveTs(e: Ev): number {
  return e.timestamp || (1686789347 + 2 * Number(e.blockNumber || 0))
}

function monthKey(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function emptyMonth(key: string, currentKey: string): MonthStats {
  const [y, m] = key.split('-').map(Number)
  const label = new Date(y, m - 1).toLocaleString('fr-FR', { month: 'short', year: '2-digit' })
  return {
    key, label: key === currentKey ? `${label} (en cours)` : label, partial: key === currentKey,
    activeUsers: 0, newUsers: 0, txCount: 0,
    depositsUsdc: 0, chargesUsdc: 0, externalUsdc: 0, migrationsUsdc: 0, rebatesUsdc: 0, netUsdc: 0,
    feesDiem: 0, feesUsdc: 0, withdrawalsDiem: 0, withdrawalsUsdc: 0, treasuryDiem: 0, treasuryUsdc: 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStats(data: any): MonthStats[] {
  const now = new Date()
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const months: Record<string, MonthStats> = {}
  const usersByMonth: Record<string, Set<string>> = {}
  const firstSeen: Record<string, string> = {}

  function add(events: Ev[], apply: (m: MonthStats, e: Ev) => void) {
    for (const e of events) {
      const k = monthKey(resolveTs(e))
      const m = months[k] ??= emptyMonth(k, currentKey)
      m.txCount++
      apply(m, e)
      if (e.user) {
        const u = String(e.user).toLowerCase()
        ;(usersByMonth[k] ??= new Set()).add(u)
        if (!firstSeen[u] || k < firstSeen[u]) firstSeen[u] = k
      }
    }
  }

  const n = (v: unknown) => (typeof v === 'number' ? v : 0)

  add(data.deposits, (m, e) => { m.depositsUsdc += n(e.amountUsdc) })
  add(data.charges, (m, e) => {
    m.chargesUsdc += n(e.amountUsdc)
    m.feesDiem += n(e.feesDiem); m.feesUsdc += n(e.feesUsdcValue)
  })
  add(data.batchCharges, (m, e) => {
    m.chargesUsdc += n(e.totalUsdc)
    m.feesDiem += n(e.feesDiem); m.feesUsdc += n(e.feesUsdcValue)
  })
  add(data.externalRoutes, (m, e) => { m.externalUsdc += n(e.toFloatUsdc) + n(e.toTreasuryUsdc) })
  add(data.migrations, (m, e) => { m.migrationsUsdc += n(e.amountUsdc) })
  add(data.rebates, (m, e) => { m.rebatesUsdc += n(e.usdcIn) })
  add(data.providerWithdrawals, (m, e) => {
    m.withdrawalsDiem += n(e.amountDiem); m.withdrawalsUsdc += n(e.amountUsdcValue)
  })
  add(data.treasuryFunds, (m, e) => {
    m.treasuryDiem += n(e.amountDiem); m.treasuryUsdc += n(e.amountUsdcValue)
  })

  for (const [k, users] of Object.entries(usersByMonth)) months[k].activeUsers = users.size
  for (const k of Object.values(firstSeen)) months[k].newUsers++
  for (const m of Object.values(months)) {
    m.netUsdc = m.depositsUsdc - m.chargesUsdc - m.externalUsdc - m.migrationsUsdc - m.rebatesUsdc
  }

  return Object.values(months).sort((a, b) => a.key.localeCompare(b.key))
}

function fmt(v: number, d = 0) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtCompact(v: number) {
  return v.toLocaleString('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
}

export default function StatistiquesPage() {
  const [months, setMonths] = useState<MonthStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const t = useTheme()
  const SERIES = t.series
  const dot = (color: string) => ({ r: 4, fill: color, stroke: t.surface, strokeWidth: 2 })
  const activeDot = { r: 5, stroke: t.surface, strokeWidth: 2 }
  const axisTick = { fill: t.muted, fontSize: 12 }

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setMonths(buildStats(data))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Synthèse : dernier mois complet comparé au précédent
  const complete = months.filter(m => !m.partial)
  const ref = complete.at(-1) ?? months.at(-1)
  const prev = ref ? months[months.indexOf(ref) - 1] : undefined

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h2 className="font-semibold">Statistiques</h2>
      </nav>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {loading && <p className="text-gray-400 animate-pulse">Chargement…</p>}
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg p-3">{error}</p>}

        {ref && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Synthèse — <span className="normal-case">{ref.label}</span>
              {prev && <span className="normal-case text-gray-500"> vs {prev.label}</span>}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="Utilisateurs actifs" value={fmt(ref.activeUsers)} cur={ref.activeUsers} prev={prev?.activeUsers} upIsGood />
              <StatTile label="Nouveaux utilisateurs" value={fmt(ref.newUsers)} cur={ref.newUsers} prev={prev?.newUsers} upIsGood />
              <StatTile label="Dépôts" value={`${fmt(ref.depositsUsdc)} USDC`} cur={ref.depositsUsdc} prev={prev?.depositsUsdc} upIsGood />
              <StatTile label="Charges (services)" value={`${fmt(ref.chargesUsdc)} USDC`} cur={ref.chargesUsdc} prev={prev?.chargesUsdc} upIsGood />
              <StatTile label="Frais protocole" value={`${fmt(ref.feesUsdc)} USDC`} sub={`${fmt(ref.feesDiem, 4)} DIEM`} cur={ref.feesUsdc} prev={prev?.feesUsdc} upIsGood />
              <StatTile label="Retraits providers" value={`${fmt(ref.withdrawalsUsdc)} USDC`} sub={`${fmt(ref.withdrawalsDiem, 4)} DIEM`} cur={ref.withdrawalsUsdc} prev={prev?.withdrawalsUsdc} />
            </div>
          </section>
        )}

        {months.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="Utilisateurs" subtitle="Actifs dans le mois (barres) et nouveaux (courbe)">
              <ComposedChart data={months} margin={{ top: 16, right: 56, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: t.grid }} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTooltip unit="" />} cursor={{ fill: t.cursor }} />
                <Legend content={<ChartLegend order={['Utilisateurs actifs', 'Nouveaux utilisateurs']} />} />
                <Bar dataKey="activeUsers" name="Utilisateurs actifs" fill={SERIES[0]} maxBarSize={24} radius={[4, 4, 0, 0]} />
                <Line dataKey="newUsers" name="Nouveaux utilisateurs" stroke={SERIES[1]} strokeWidth={2}
                  dot={dot(SERIES[1])} activeDot={activeDot}>
                  <LabelList content={<EndLabel count={months.length} text="Nouveaux" fill={t.label} />} />
                </Line>
              </ComposedChart>
            </ChartCard>

            <ChartCard title="Flux mensuels (USDC)" subtitle="Flux USDC (barres) et flux DIEM en valorisation USDC (courbes)">
              <ComposedChart data={months} margin={{ top: 16, right: 56, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: t.grid }} tickLine={false} />
                <YAxis tickFormatter={fmtCompact} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTooltip unit=" USDC" />} cursor={{ fill: t.cursor }} />
                <Legend content={<ChartLegend order={['Dépôts', 'Charges', 'Frais protocole (valorisation)', 'Retraits providers (valorisation)']} />} />
                <Bar dataKey="depositsUsdc" name="Dépôts" fill={SERIES[0]} maxBarSize={24} radius={[4, 4, 0, 0]} />
                <Bar dataKey="chargesUsdc" name="Charges" fill={SERIES[1]} maxBarSize={24} radius={[4, 4, 0, 0]} />
                <Line dataKey="feesUsdc" name="Frais protocole (valorisation)" stroke={SERIES[2]} strokeWidth={2}
                  dot={dot(SERIES[2])} activeDot={activeDot}>
                  <LabelList content={<EndLabel count={months.length} text="Frais" fill={t.label} />} />
                </Line>
                <Line dataKey="withdrawalsUsdc" name="Retraits providers (valorisation)" stroke={SERIES[3]} strokeWidth={2}
                  dot={dot(SERIES[3])} activeDot={activeDot}>
                  <LabelList content={<EndLabel count={months.length} text="Retraits" fill={t.label} />} />
                </Line>
              </ComposedChart>
            </ChartCard>
          </div>
        )}

        {months.length > 0 && (
          <section className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Mois</th>
                  <th className="px-4 py-3 text-right">Utilisateurs actifs</th>
                  <th className="px-4 py-3 text-right">Nouveaux</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Dépôts</th>
                  <th className="px-4 py-3 text-right">Charges</th>
                  <th className="px-4 py-3 text-right">Routes ext.</th>
                  <th className="px-4 py-3 text-right">Migrations</th>
                  <th className="px-4 py-3 text-right">Net USDC</th>
                  <th className="px-4 py-3 text-right">Frais protocole</th>
                  <th className="px-4 py-3 text-right">Retraits providers</th>
                  <th className="px-4 py-3 text-right">Treasury</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50 font-mono tabular-nums">
                {[...months].reverse().map(m => (
                  <tr key={m.key} className="hover:bg-gray-900/50">
                    <td className="px-4 py-2.5 font-sans capitalize">{m.label}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(m.activeUsers)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(m.newUsers)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{fmt(m.txCount)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(m.depositsUsdc, 2)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(m.chargesUsdc, 2)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(m.externalUsdc, 2)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(m.migrationsUsdc, 2)}</td>
                    <td className={`px-4 py-2.5 text-right ${m.netUsdc >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {m.netUsdc >= 0 ? '+' : ''}{fmt(m.netUsdc, 2)}
                    </td>
                    <DiemCell usdc={m.feesUsdc} diem={m.feesDiem} />
                    <DiemCell usdc={m.withdrawalsUsdc} diem={m.withdrawalsDiem} />
                    <DiemCell usdc={m.treasuryUsdc} diem={m.treasuryDiem} />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-800">
              Montants en USDC. Flux DIEM : valorisation USDC au cours de chaque transaction, montant DIEM en dessous.
            </p>
          </section>
        )}

        {!loading && !error && months.length === 0 && (
          <p className="text-gray-500 text-center py-12">Aucune donnée — lancez une synchronisation depuis le dashboard</p>
        )}
      </main>
    </div>
  )
}

function DiemCell({ usdc, diem }: { usdc: number; diem: number }) {
  return (
    <td className="px-4 py-2.5 text-right">
      <div>{fmt(usdc, 2)}</div>
      <div className="text-xs text-gray-500">{fmt(diem, 4)} DIEM</div>
    </td>
  )
}

function StatTile({ label, value, sub, cur, prev, upIsGood }: {
  label: string; value: string; sub?: string; cur: number; prev?: number; upIsGood?: boolean
}) {
  const delta = prev ? (cur - prev) / prev : null
  const tone = delta == null || delta === 0 || upIsGood == null
    ? 'text-gray-400'
    : (delta > 0) === upIsGood ? 'text-green-400' : 'text-red-400'
  return (
    <div className="rounded-xl border border-gray-800 p-4 space-y-1">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-gray-500 font-mono">{sub}</p>}
      {delta != null && (
        <p className={`text-xs ${tone}`}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {delta > 0 ? '+' : ''}{fmt(delta * 100)} % vs mois préc.
        </p>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactElement }) {
  return (
    <section className="rounded-xl border border-gray-800 p-5 space-y-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </section>
  )
}

// Libellé direct en bout de courbe uniquement (pas un nombre sur chaque point)
function EndLabel(props: { x?: number | string; y?: number | string; index?: number; count: number; text: string; fill: string }) {
  const { x, y, index, count, text, fill } = props
  if (index !== count - 1 || x == null || y == null) return null
  return <text x={Number(x) + 10} y={Number(y)} dy={4} fill={fill} fontSize={11}>{text}</text>
}

type LegendEntry = { value?: string; color?: string; type?: string }

// Légende dans l'ordre des séries (barres puis courbes), pas dans l'ordre alphabétique de recharts
function ChartLegend({ payload, order }: { payload?: LegendEntry[]; order: string[] }) {
  const sorted = [...(payload ?? [])].sort((a, b) => order.indexOf(a.value ?? '') - order.indexOf(b.value ?? ''))
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center pt-2 text-xs text-gray-500">
      {sorted.map(p => (
        <span key={p.value} className="flex items-center gap-1.5">
          {p.type === 'line'
            ? <span className="inline-block w-4 h-0.5 rounded" style={{ background: p.color }} />
            : <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />}
          {p.value}
        </span>
      ))}
    </div>
  )
}

type TooltipEntry = { name?: string; value?: number; color?: string; dataKey?: string }

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: TooltipEntry[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs shadow-lg space-y-1">
      <p className="font-medium text-gray-200 capitalize">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="flex items-center gap-2 text-gray-300">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-mono tabular-nums text-gray-100">{fmt(p.value ?? 0, unit ? 2 : 0)}{unit}</span>
        </p>
      ))}
    </div>
  )
}
