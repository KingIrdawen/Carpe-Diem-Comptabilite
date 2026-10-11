'use client'

import { useEffect, useState } from 'react'
import NavBar from '@/components/NavBar'

interface MonthData {
  month: string
  year: number
  monthNum: number
  depositsUsdc: number
  chargesUsdc: number
  externalUsdc: number
  migrationsUsdc: number
  feesProtocol: number
  providerWithdrawals: number
  rebatesUsdc: number
  treasuryDiem: number
  // Valorisation USDC des flux DIEM (cours au moment de chaque transaction)
  feesProtocolUsdc: number
  providerWithdrawalsUsdc: number
  treasuryUsdc: number
  netUsdc: number
}

type Totals = Omit<MonthData, 'month' | 'year' | 'monthNum'>

const EMPTY_TOTALS: Totals = {
  depositsUsdc: 0, chargesUsdc: 0, externalUsdc: 0, migrationsUsdc: 0,
  feesProtocol: 0, providerWithdrawals: 0, rebatesUsdc: 0, treasuryDiem: 0,
  feesProtocolUsdc: 0, providerWithdrawalsUsdc: 0, treasuryUsdc: 0, netUsdc: 0,
}

export default function ComptabilitePage() {
  const [months, setMonths] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => {
        const byMonth: Record<string, MonthData> = {}

        // Si le timestamp est absent, on l'estime depuis le numéro de bloc
        // (déploiement : bloc 45 717 327 = 8 mai 2026, ~2 sec/bloc)
        const DEPLOY_BLOCK = 45_717_327
        const DEPLOY_TS = Math.floor(new Date('2026-05-08T00:00:00Z').getTime() / 1000)
        function resolveTs(ts: number, blockNumber: string): number {
          if (ts) return ts
          const bn = parseInt(blockNumber || '0')
          if (!bn) return 0
          return DEPLOY_TS + (bn - DEPLOY_BLOCK) * 2
        }

        function key(ts: number) {
          if (!ts) return null
          const d = new Date(ts * 1000)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }

        function ensure(k: string) {
          if (!byMonth[k]) {
            const [y, m] = k.split('-')
            byMonth[k] = {
              month: new Date(Number(y), Number(m) - 1).toLocaleString('fr-FR', { month: 'long' }),
              year: Number(y),
              monthNum: Number(m),
              ...EMPTY_TOTALS,
            }
          }
          return byMonth[k]
        }

        data.deposits.forEach((e: { timestamp: number; blockNumber: string; amountUsdc: number }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).depositsUsdc += e.amountUsdc
        })
        data.charges.forEach((e: { timestamp: number; blockNumber: string; amountUsdc: number; feesDiem: number; feesUsdcValue: number | null }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).chargesUsdc += e.amountUsdc
          ensure(k).feesProtocol += e.feesDiem
          ensure(k).feesProtocolUsdc += e.feesUsdcValue ?? 0
        })
        data.batchCharges.forEach((e: { timestamp: number; blockNumber: string; totalUsdc: number; feesDiem: number; feesUsdcValue: number | null }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).chargesUsdc += e.totalUsdc
          ensure(k).feesProtocol += e.feesDiem
          ensure(k).feesProtocolUsdc += e.feesUsdcValue ?? 0
        })
        data.externalRoutes.forEach((e: { timestamp: number; blockNumber: string; toFloatUsdc: number; toTreasuryUsdc: number }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).externalUsdc += e.toFloatUsdc + e.toTreasuryUsdc
        })
        data.migrations.forEach((e: { timestamp: number; blockNumber: string; amountUsdc: number }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).migrationsUsdc += e.amountUsdc
        })
        data.providerWithdrawals.forEach((e: { timestamp: number; blockNumber: string; amountDiem: number; amountUsdcValue: number | null }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).providerWithdrawals += e.amountDiem
          ensure(k).providerWithdrawalsUsdc += e.amountUsdcValue ?? 0
        })
        data.rebates.forEach((e: { timestamp: number; blockNumber: string; usdcIn: number }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).rebatesUsdc += e.usdcIn
        })
        data.treasuryFunds.forEach((e: { timestamp: number; blockNumber: string; amountDiem: number; amountUsdcValue: number | null }) => {
          const k = key(resolveTs(e.timestamp, e.blockNumber)); if (!k) return
          ensure(k).treasuryDiem += e.amountDiem
          ensure(k).treasuryUsdc += e.amountUsdcValue ?? 0
        })

        Object.values(byMonth).forEach(m => {
          m.netUsdc = m.depositsUsdc - m.chargesUsdc - m.externalUsdc - m.migrationsUsdc - m.rebatesUsdc
        })

        const sorted = Object.entries(byMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v)

        setMonths(sorted)
      })
      .finally(() => setLoading(false))
  }, [])

  function fmt(n: number, decimals = 2) {
    return n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  const yearly = months.reduce((acc, m) => {
    const next = { ...acc }
    for (const k of Object.keys(EMPTY_TOTALS) as (keyof Totals)[]) next[k] += m[k]
    return next
  }, EMPTY_TOTALS)

  return (
    <div className="min-h-screen">
      <NavBar />

      <main className="p-6 max-w-7xl mx-auto space-y-4">
        {loading && <p className="text-gray-400 animate-pulse">Chargement…</p>}

        {months.map(m => (
          <div key={`${m.year}-${m.monthNum}`} className="bg-blue-500/5 border border-blue-500/20 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-500/20 flex items-center justify-between">
              <h3 className="font-semibold capitalize">{m.month} {m.year}</h3>
              <span className={`text-sm font-mono font-medium ${m.netUsdc >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                Net USDC : {m.netUsdc >= 0 ? '+' : ''}{fmt(m.netUsdc)}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 printing:grid-cols-4 gap-0 divide-x divide-blue-500/20">
              <Cell label="Dépôts" value={`+${fmt(m.depositsUsdc)} USDC`} color="green" />
              <Cell label="Charges" value={`-${fmt(m.chargesUsdc)} USDC`} color="blue" />
              <Cell label="Routes ext." value={`-${fmt(m.externalUsdc)} USDC`} color="purple" />
              <Cell label="Migrations" value={`-${fmt(m.migrationsUsdc)} USDC`} color="orange" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 printing:grid-cols-4 gap-0 divide-x divide-blue-500/20 border-t border-blue-500/20">
              <Cell label="Frais proto." value={`${fmt(m.feesProtocol, 4)} DIEM`} usdcValue={`≈ ${fmt(m.feesProtocolUsdc)} USDC`} color={m.feesProtocol > 0 ? 'green' : 'gray'} />
              <Cell label="Retr. prov." value={`${fmt(m.providerWithdrawals, 4)} DIEM`} usdcValue={`≈ ${fmt(m.providerWithdrawalsUsdc)} USDC`} color={m.providerWithdrawals > 0 ? 'red' : 'gray'} />
              <Cell label="Rebates" value={`-${fmt(m.rebatesUsdc)} USDC`} color={m.rebatesUsdc > 0 ? 'red' : 'gray'} />
              <Cell label="Treasury" value={`${fmt(m.treasuryDiem, 4)} DIEM`} usdcValue={`≈ ${fmt(m.treasuryUsdc)} USDC`} color={m.treasuryDiem > 0 ? 'green' : 'gray'} />
            </div>
          </div>
        ))}

        {!loading && months.length === 0 && (
          <p className="text-gray-500 text-center py-12">Aucune donnée trouvée sur la blockchain</p>
        )}

        {months.length > 0 && (
          <div className="border-2 border-blue-500/40 bg-blue-500/5 rounded-xl overflow-hidden mt-6">
            <div className="px-5 py-3 border-b border-blue-500/30 flex items-center justify-between">
              <h3 className="font-bold text-blue-300">Récapitulatif annuel — {months[months.length - 1]?.year}</h3>
              <span className={`text-sm font-mono font-bold ${yearly.netUsdc >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                Net USDC : {yearly.netUsdc >= 0 ? '+' : ''}{fmt(yearly.netUsdc)}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 printing:grid-cols-4 gap-0 divide-x divide-blue-500/20">
              <Cell label="Total dépôts" value={`+${fmt(yearly.depositsUsdc)} USDC`} color="green" />
              <Cell label="Total charges" value={`-${fmt(yearly.chargesUsdc)} USDC`} color="blue" />
              <Cell label="Routes ext." value={`-${fmt(yearly.externalUsdc)} USDC`} color="purple" />
              <Cell label="Migrations" value={`-${fmt(yearly.migrationsUsdc)} USDC`} color="orange" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 printing:grid-cols-4 gap-0 divide-x divide-blue-500/20 border-t border-blue-500/30">
              <Cell label="Frais proto." value={`${fmt(yearly.feesProtocol, 4)} DIEM`} usdcValue={`≈ ${fmt(yearly.feesProtocolUsdc)} USDC`} color="gray" />
              <Cell label="Retr. prov." value={`${fmt(yearly.providerWithdrawals, 4)} DIEM`} usdcValue={`≈ ${fmt(yearly.providerWithdrawalsUsdc)} USDC`} color="gray" />
              <Cell label="Rebates" value={`-${fmt(yearly.rebatesUsdc)} USDC`} color="gray" />
              <Cell label="Treasury" value={`${fmt(yearly.treasuryDiem, 4)} DIEM`} usdcValue={`≈ ${fmt(yearly.treasuryUsdc)} USDC`} color="gray" />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Cell({ label, value, usdcValue, color }: { label: string; value: string; usdcValue?: string; color: string }) {
  const text: Record<string, string> = {
    green: 'text-green-400', blue: 'text-blue-400', purple: 'text-purple-400',
    orange: 'text-orange-400', red: 'text-red-400', gray: 'text-gray-300',
  }
  return (
    <div className="px-4 py-3 space-y-0.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-mono font-medium ${text[color] ?? ''}`}>{value}</p>
      {usdcValue && <p className="text-xs font-mono text-gray-400" title="Valorisation USDC au cours de chaque transaction">{usdcValue}</p>}
    </div>
  )
}
