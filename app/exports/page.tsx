'use client'

import { useState } from 'react'
import Link from 'next/link'

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export default function ExportsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/export?year=${year}&month=${month + 1}`)
      if (!res.ok) throw new Error('Erreur export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carpe-diem-compta-${year}-${String(month + 1).padStart(2, '0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Erreur lors de la génération du fichier')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h2 className="font-semibold">Exports Excel</h2>
      </nav>

      <main className="p-6 max-w-xl mx-auto space-y-6">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="font-medium mb-1">Export mensuel</h3>
            <p className="text-sm text-gray-400">
              Génère un fichier Excel avec tous les flux du mois sélectionné, organisés par catégorie comptable.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-gray-400">Mois</label>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div className="w-28 space-y-1">
              <label className="text-xs text-gray-400">Année</label>
              <input
                type="number"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                min={2024}
                max={2030}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Génération en cours…' : `Exporter ${MONTHS[month]} ${year}`}
          </button>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-3">
          <h3 className="font-medium">Contenu du fichier Excel</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>📥 <strong className="text-gray-200">Feuille 1</strong> — Dépôts utilisateurs (USDC)</li>
            <li>⚡ <strong className="text-gray-200">Feuille 2</strong> — Charges & Batch charges (USDC → DIEM)</li>
            <li>🌐 <strong className="text-gray-200">Feuille 3</strong> — Routes externes</li>
            <li>💸 <strong className="text-gray-200">Feuille 4</strong> — Retraits providers (DIEM)</li>
            <li>🔄 <strong className="text-gray-200">Feuille 5</strong> — Migrations de crédits</li>
            <li>🎁 <strong className="text-gray-200">Feuille 6</strong> — Rebates</li>
            <li>🏦 <strong className="text-gray-200">Feuille 7</strong> — Treasury</li>
            <li>📊 <strong className="text-gray-200">Résumé</strong> — Totaux & soldes du mois</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
