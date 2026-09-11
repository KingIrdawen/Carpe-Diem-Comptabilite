'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type EventType = 'deposit' | 'charge' | 'batchCharge' | 'externalRoute' | 'providerWithdrawal' | 'migration' | 'rebate' | 'treasuryFund'

interface Transaction {
  type: EventType
  txHash: string
  blockNumber: string
  timestamp: number
  [key: string]: unknown
}

const TYPE_LABELS: Record<EventType, string> = {
  deposit: 'Dépôt',
  charge: 'Charge',
  batchCharge: 'Batch Charge',
  externalRoute: 'Route externe',
  providerWithdrawal: 'Retrait provider',
  migration: 'Migration',
  rebate: 'Rebate',
  treasuryFund: 'Treasury',
}

const TYPE_COLORS: Record<EventType, string> = {
  deposit: 'bg-green-500/20 text-green-300',
  charge: 'bg-blue-500/20 text-blue-300',
  batchCharge: 'bg-blue-500/20 text-blue-300',
  externalRoute: 'bg-purple-500/20 text-purple-300',
  providerWithdrawal: 'bg-red-500/20 text-red-300',
  migration: 'bg-orange-500/20 text-orange-300',
  rebate: 'bg-cyan-500/20 text-cyan-300',
  treasuryFund: 'bg-yellow-500/20 text-yellow-300',
}

function formatTs(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function getAmount(tx: Transaction): string {
  if (tx.type === 'deposit') return `+${(tx.amountUsdc as number).toFixed(2)} USDC`
  if (tx.type === 'charge') return `-${(tx.amountUsdc as number).toFixed(2)} USDC`
  if (tx.type === 'batchCharge') return `-${(tx.totalUsdc as number).toFixed(2)} USDC`
  if (tx.type === 'externalRoute') return `-${((tx.toFloatUsdc as number) + (tx.toTreasuryUsdc as number)).toFixed(2)} USDC`
  if (tx.type === 'providerWithdrawal') return `-${(tx.amountDiem as number).toFixed(4)} DIEM`
  if (tx.type === 'migration') return `-${(tx.amountUsdc as number).toFixed(2)} USDC`
  if (tx.type === 'rebate') return `-${(tx.usdcIn as number).toFixed(2)} USDC`
  if (tx.type === 'treasuryFund') return `${(tx.amountDiem as number).toFixed(4)} DIEM`
  return '—'
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<EventType | 'all'>('all')

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => {
        const all: Transaction[] = [
          ...data.deposits,
          ...data.charges,
          ...data.batchCharges,
          ...data.externalRoutes,
          ...data.providerWithdrawals,
          ...data.migrations,
          ...data.rebates,
          ...data.treasuryFunds,
        ].sort((a, b) => b.timestamp - a.timestamp)
        setTransactions(all)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.type === filter)

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h2 className="font-semibold">Transactions</h2>
      </nav>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap gap-2">
          {(['all', ...Object.keys(TYPE_LABELS)] as Array<EventType | 'all'>).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === t ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {t === 'all' ? 'Tous' : TYPE_LABELS[t as EventType]}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-400 animate-pulse">Chargement…</p>}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Montant</th>
                <th className="px-4 py-3 text-left">Adresse</th>
                <th className="px-4 py-3 text-left">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map((tx, i) => (
                <tr key={`${tx.txHash}-${i}`} className="hover:bg-gray-900/50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{formatTs(tx.timestamp)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[tx.type]}`}>
                      {TYPE_LABELS[tx.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{getAmount(tx)}</td>
                  <td className="px-4 py-3 font-mono text-gray-400 text-xs">
                    {tx.user ? shortAddr(tx.user as string) : tx.provider ? shortAddr(tx.provider as string) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://basescan.org/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {shortHash(tx.txHash)}
                    </a>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Aucune transaction trouvée</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
