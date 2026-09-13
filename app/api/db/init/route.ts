import { NextResponse } from 'next/server'
import { initDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await initDb()
    return NextResponse.json({ ok: true, message: 'Base de données initialisée' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
