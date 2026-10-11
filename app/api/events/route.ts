import { NextResponse } from 'next/server'
import { getEventsFromDb, getSyncStatus, getSyncedRanges, initDb, countEventsMissingDiemPrice } from '@/lib/db'
import { formatUsdc, formatDiem } from '@/lib/viemClient'

export const dynamic = 'force-dynamic'

function safeUsdc(args: Record<string, unknown>, key: string) {
  try { return formatUsdc(BigInt(String(args[key] ?? '0'))) } catch { return 0 }
}
function safeDiem(args: Record<string, unknown>, key: string) {
  try { return formatDiem(BigInt(String(args[key] ?? '0'))) } catch { return 0 }
}
// Cours DIEM/USDC enregistré au moment de la transaction (null si pas encore valorisé)
function diemPrice(row: Record<string, unknown>): number | null {
  return row.diem_price_usdc == null ? null : Number(row.diem_price_usdc)
}
// Valeur change USDC d'un montant DIEM au cours de la transaction
function usdcValue(diem: number, price: number | null): number | null {
  return price == null ? null : diem * price
}

export async function GET() {
  try {
    await initDb()
    const rows = await getEventsFromDb()
    const syncStatus = await getSyncStatus()
    const syncedRanges = await getSyncedRanges().catch(() => [])
    const missingDiemPrices = await countEventsMissingDiemPrice()

    const deposits = rows.filter(r => r.type === 'Deposit' || r.type === 'X402Pull').map(r => ({
      type: r.type === 'X402Pull' ? 'x402pull' : 'deposit',
      txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), user: r.args.user,
      amountUsdc: safeUsdc(r.args, 'amount'),
    }))

    const charges = rows.filter(r => r.type === 'Charge').map(r => {
      const price = diemPrice(r)
      const providerShareDiem = safeDiem(r.args, 'providerShare')
      const feesDiem = safeDiem(r.args, 'fees')
      const diemReceived = safeDiem(r.args, 'diemReceived')
      const surchargeDiem = safeDiem(r.args, 'surcharge')
      return {
        type: 'charge', txHash: r.tx_hash, blockNumber: String(r.block_number),
        timestamp: Number(r.timestamp), user: r.args.user, provider: r.args.provider,
        amountUsdc: safeUsdc(r.args, 'amount'),
        diemPriceUsdc: price,
        providerShareDiem, providerShareUsdcValue: usdcValue(providerShareDiem, price),
        feesDiem, feesUsdcValue: usdcValue(feesDiem, price),
        diemReceived, diemReceivedUsdcValue: usdcValue(diemReceived, price),
        surchargeDiem, surchargeUsdcValue: usdcValue(surchargeDiem, price),
      }
    })

    const batchCharges = rows.filter(r => r.type === 'BatchCharge').map(r => {
      const price = diemPrice(r)
      const diemReceived = safeDiem(r.args, 'diemReceived')
      const surchargeDiem = safeDiem(r.args, 'surcharge')
      const feesDiem = safeDiem(r.args, 'fees')
      return {
        type: 'batchCharge', txHash: r.tx_hash, blockNumber: String(r.block_number),
        timestamp: Number(r.timestamp), entryCount: Number(r.args.entryCount ?? 0),
        totalUsdc: safeUsdc(r.args, 'totalUsdc'),
        diemPriceUsdc: price,
        diemReceived, diemReceivedUsdcValue: usdcValue(diemReceived, price),
        surchargeDiem, surchargeUsdcValue: usdcValue(surchargeDiem, price),
        feesDiem, feesUsdcValue: usdcValue(feesDiem, price),
      }
    })

    const externalRoutes = rows.filter(r => r.type === 'ExternalRouteSettled').map(r => ({
      type: 'externalRoute', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), user: r.args.user,
      toFloatUsdc: safeUsdc(r.args, 'toFloat'),
      toTreasuryUsdc: safeUsdc(r.args, 'toTreasury'),
    }))

    const providerWithdrawals = rows.filter(r => r.type === 'ProviderWithdrawal').map(r => {
      const price = diemPrice(r)
      const amountDiem = safeDiem(r.args, 'amount')
      return {
        type: 'providerWithdrawal', txHash: r.tx_hash, blockNumber: String(r.block_number),
        timestamp: Number(r.timestamp), provider: r.args.provider,
        diemPriceUsdc: price, amountDiem, amountUsdcValue: usdcValue(amountDiem, price),
      }
    })

    const migrations = rows.filter(r => r.type === 'CreditsMigrated').map(r => ({
      type: 'migration', txHash: r.tx_hash, blockNumber: String(r.block_number),
      timestamp: Number(r.timestamp), user: r.args.user, account: r.args.account,
      amountUsdc: safeUsdc(r.args, 'amount'),
    }))

    const idleRebates = rows.filter(r => r.type === 'IdleRebateCredited').map(r => {
      const price = diemPrice(r)
      const diemAmount = safeDiem(r.args, 'diemAmount')
      return {
        type: 'idleRebate', txHash: r.tx_hash, blockNumber: String(r.block_number),
        timestamp: Number(r.timestamp), provider: r.args.provider,
        diemPriceUsdc: price, diemAmount, diemAmountUsdcValue: usdcValue(diemAmount, price),
      }
    })

    const rebates = rows.filter(r => r.type === 'RebateDistributed').map(r => {
      const price = diemPrice(r)
      const diemOut = safeDiem(r.args, 'diemOut')
      return {
        type: 'rebate', txHash: r.tx_hash, blockNumber: String(r.block_number),
        timestamp: Number(r.timestamp),
        usdcIn: safeUsdc(r.args, 'usdcIn'),
        diemPriceUsdc: price, diemOut, diemOutUsdcValue: usdcValue(diemOut, price),
        providerCount: Number(r.args.providerCount ?? 0),
      }
    })

    const treasuryFunds = rows.filter(r => r.type === 'TreasuryFunded').map(r => {
      const price = diemPrice(r)
      const amountDiem = safeDiem(r.args, 'amount')
      return {
        type: 'treasuryFund', txHash: r.tx_hash, blockNumber: String(r.block_number),
        timestamp: Number(r.timestamp), to: r.args.to,
        diemPriceUsdc: price, amountDiem, amountUsdcValue: usdcValue(amountDiem, price),
        source: r.args.source,
      }
    })

    return NextResponse.json({
      deposits, charges, batchCharges, externalRoutes,
      providerWithdrawals, migrations, rebates, idleRebates, treasuryFunds,
      missingDiemPrices,
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
