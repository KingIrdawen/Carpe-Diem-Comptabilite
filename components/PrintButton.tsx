'use client'

import { useEffect } from 'react'

// Zone imprimable d'une feuille A4 avec des marges de 8 mm, en pixels CSS (96 dpi)
const MARGIN_MM = 8
const PAGE_PX = { short: 733, long: 1062 }
// Largeur de mise en page avant réduction : la page s'imprime comme sur un écran d'ordinateur
const LAYOUT_PX = { portrait: 1100, landscape: 1400 }
// En dessous de ce zoom, le texte devient illisible : on garde la largeur et on accepte plusieurs pages
const MIN_ZOOM = 0.35

function preparePrint(landscape: boolean) {
  const html = document.documentElement
  const body = document.body
  const layout = landscape ? LAYOUT_PX.landscape : LAYOUT_PX.portrait
  const pageW = landscape ? PAGE_PX.long : PAGE_PX.short
  const pageH = landscape ? PAGE_PX.short : PAGE_PX.long

  let pageStyle = document.getElementById('print-page-style')
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    pageStyle.id = 'print-page-style'
    document.head.appendChild(pageStyle)
  }
  pageStyle.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${MARGIN_MM}mm; }`

  // Mise en page à largeur fixe avec les styles d'impression, puis mesure de la hauteur obtenue
  html.classList.add('printing')
  body.style.zoom = ''
  body.style.width = `${layout}px`
  body.style.minHeight = '0'
  const height = body.scrollHeight

  const fitPage = Math.min(pageW / layout, pageH / height) * 0.98
  body.style.zoom = String(fitPage >= MIN_ZOOM ? fitPage : pageW / layout)
}

function cleanupPrint() {
  document.documentElement.classList.remove('printing')
  document.body.style.zoom = ''
  document.body.style.width = ''
  document.body.style.minHeight = ''
}

export default function PrintButton({ landscape = false, className = '' }: { landscape?: boolean; className?: string }) {
  // Couvre aussi Cmd+P / Ctrl+P, pas seulement le bouton
  useEffect(() => {
    const before = () => preparePrint(landscape)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', cleanupPrint)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', cleanupPrint)
    }
  }, [landscape])

  return (
    <button
      onClick={() => window.print()}
      className={`text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1 transition-colors ${className}`}
    >
      Imprimer
    </button>
  )
}
