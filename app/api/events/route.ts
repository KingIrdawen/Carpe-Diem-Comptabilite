import { NextResponse } from 'next/server'
import { getEventsFromDb, getSyncStatus, getSyncedRanges, initDb } from '@/lib/db'
import { formatUsdc, formatDiem } from '@/lib/viemClient'

export const dynamic = 'force-dynamic'

function safeUsdc(args: Record<string, unknown>, key: string) {
  try { return formatUsdc(BigInt(String(args[key] ?? '0'))) } catch { return 0 }
}
function safeDiem(args: Record<string, unknown>, key: string) {
  try { return formatDiem(BigInt(String(args[key] ?? '0'))) } catch { return 0 }
}

export async function GET() {
  try {
    await initDb()
    const rows = await getEventsFromDb()
    const syncStatus = await getSyncStatus()
    const syncedRanges = await getSyncedRanges().catch(() => [])

    const deposits = rows.filter(r => r.type === 'Deposit' || r.type === 'X402Pull').map(r => ({
      type: r.type === 'X402Pull' ? 'x402pull' : 'deposit',
      txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), user: r.args.user,
      amountUsdc: safeUsdc(r.args, 'amount'),
    }))

    const charges = rows.filter(r => r.type === 'Charge').map(r => ({
      type: 'charge', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), user: r.args.user, provider: r.args.provider,
      amountUsdc: safeUsdc(r.args, 'amount'),
      providerShareDiem: safeDiem(r.args, 'providerShare'),
      feesDiem: safeDiem(r.args, 'fees'),
      diemReceived: safeDiem(r.args, 'diemReceived'),
      surchargeDiem: safeDiem(r.args, 'surcharge'),
    }))

    const batchCharges = rows.filter(r => r.type === 'BatchCharge').map(r => ({
      type: 'batchCharge', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), entryCount: Number(r.args.entryCount ?? 0),
      totalUsdc: safeUsdc(r.args, 'totalUsdc'),
      diemReceived: safeDiem(r.args, 'diemReceived'),
      surchargeDiem: safeDiem(r.args, 'surcharge'),
      feesDiem: safeDiem(r.args, 'fees'),
    }))

    const externalRoutes = rows.filter(r => r.type === 'ExternalRouteSettled').map(r => ({
      type: 'externalRoute', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), user: r.args.user,
      toFloatUsdc: safeUsdc(r.args, 'toFloat'),
      toTreasuryUsdc: safeUsdc(r.args, 'toTreasury'),
    }))

    const providerWithdrawals = rows.filter(r => r.type === 'ProviderWithdrawal').map(r => ({
      type: 'providerWithdrawal', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), provider: r.args.provider,
      amountDiem: safeDiem(r.args, 'amount'),
    }))

    const migrations = rows.filter(r => r.type === 'CreditsMigrated').map(r => ({
      type: 'migration', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), user: r.args.user, account: r.args.account,
      amountUsdc: safeUsdc(r.args, 'amount'),
    }))

    const idleRebates = rows.filter(r => r.type === 'IdleRebateCredited').map(r => ({
      type: 'idleRebate', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), provider: r.args.provider,
      diemAmount: safeDiem(r.args, 'diemAmount'),
    }))

    const rebates = rows.filter(r => r.type === 'RebateDistributed').map(r => ({
      type: 'rebate', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp),
      usdcIn: safeUsdc(r.args, 'usdcIn'),
      diemOut: safeDiem(r.args, 'diemOut'),
      providerCount: Number(r.args.providerCount ?? 0),
    }))

    const treasuryFunds = rows.filter(r => r.type === 'TreasuryFunded').map(r => ({
      type: 'treasuryFund', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), to: r.args.to,
      amountDiem: safeDiem(r.args, 'amount'),
      source: r.args.source,
    }))

    return NextResponse.json({
      deposits, charges, batchCharges, externalRoutes,
      providerWithdrawals, migrations, rebates, idleRebates, treasuryFunds,
      syncStatus: {
        lastSyncedBlock: String(syncStatus.last_synced_block),
        lastSyncedAt: syncStatus.last_synced_at,
      },
      syncedRanges: syncedRanges.map(r => ({ start: r.start_date, end: r.end_date })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
