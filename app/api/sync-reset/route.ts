import { NextResponse } from 'next/server'
import { clearSyncedRanges, initDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await initDb()
    await clearSyncedRanges()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
