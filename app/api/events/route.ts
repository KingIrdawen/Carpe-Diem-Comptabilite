import { NextResponse } from 'next/server'
import { fetchAllContractEvents } from '@/lib/fetchEvents'
import { formatUsdc, formatDiem } from '@/lib/viemClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    const events = await fetchAllContractEvents()

    const deposits = events.filter(e => e.type === 'Deposit').map(e => ({
      type: 'deposit',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      user: e.args.user as string,
      amountUsdc: formatUsdc(BigInt(e.args.amount as string)),
    }))

    const charges = events.filter(e => e.type === 'Charge').map(e => ({
      type: 'charge',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      user: e.args.user as string,
      provider: e.args.provider as string,
      amountUsdc: formatUsdc(BigInt(e.args.amount as string)),
      providerShareDiem: formatDiem(BigInt(e.args.providerShare as string)),
      feesDiem: formatDiem(BigInt(e.args.fees as string)),
      diemReceived: formatDiem(BigInt(e.args.diemReceived as string)),
      surchargeDiem: formatDiem(BigInt(e.args.surcharge as string)),
    }))

    const batchCharges = events.filter(e => e.type === 'BatchCharge').map(e => ({
      type: 'batchCharge',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      entryCount: Number(e.args.entryCount as bigint),
      totalUsdc: formatUsdc(BigInt(e.args.totalUsdc as string)),
      diemReceived: formatDiem(BigInt(e.args.diemReceived as string)),
      surchargeDiem: formatDiem(BigInt(e.args.surcharge as string)),
      feesDiem: formatDiem(BigInt(e.args.fees as string)),
    }))

    const externalRoutes = events.filter(e => e.type === 'ExternalRouteSettled').map(e => ({
      type: 'externalRoute',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      user: e.args.user as string,
      toFloatUsdc: formatUsdc(BigInt(e.args.toFloat as string)),
      toTreasuryUsdc: formatUsdc(BigInt(e.args.toTreasury as string)),
    }))

    const providerWithdrawals = events.filter(e => e.type === 'ProviderWithdrawal').map(e => ({
      type: 'providerWithdrawal',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      provider: e.args.provider as string,
      amountDiem: formatDiem(BigInt(e.args.amount as string)),
    }))

    const migrations = events.filter(e => e.type === 'CreditsMigrated').map(e => ({
      type: 'migration',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      user: e.args.user as string,
      account: e.args.account as string,
      amountUsdc: formatUsdc(BigInt(e.args.amount as string)),
    }))

    const rebates = events.filter(e => e.type === 'RebateDistributed').map(e => ({
      type: 'rebate',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      usdcIn: formatUsdc(BigInt(e.args.usdcIn as string)),
      diemOut: formatDiem(BigInt(e.args.diemOut as string)),
      providerCount: Number(e.args.providerCount as bigint),
    }))

    const treasuryFunds = events.filter(e => e.type === 'TreasuryFunded').map(e => ({
      type: 'treasuryFund',
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      to: e.args.to as string,
      amountDiem: formatDiem(BigInt(e.args.amount as string)),
      reason: e.args.reason as string,
    }))

    return NextResponse.json({
      deposits, charges, batchCharges, externalRoutes,
      providerWithdrawals, migrations, rebates, treasuryFunds,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('API events error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
