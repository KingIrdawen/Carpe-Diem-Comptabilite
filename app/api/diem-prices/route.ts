import { NextResponse } from 'next/server'
import { initDb } from '@/lib/db'
import { fillMissingDiemPrices } from '@/lib/diemPrice'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  try {
    await initDb()
    const result = await fillMissingDiemPrices()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
