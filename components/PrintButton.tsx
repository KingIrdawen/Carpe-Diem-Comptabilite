'use client'

export default function PrintButton({ className = '' }: { className?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className={`print:hidden text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1 transition-colors ${className}`}
    >
      Imprimer
    </button>
  )
}
