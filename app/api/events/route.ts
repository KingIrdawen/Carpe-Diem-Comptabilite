import { NextResponse } from 'next/server'
import { publicClient, formatUsdc, formatDiem } from '@/lib/viemClient'
import {
  CARPE_ESCROW_ADDRESS,
  CARPE_ESCROW_ABI,
} from '@/lib/contracts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Bloc de déploiement du contrat CarpeEscrow sur Base (8 mai 2026)
const DEPLOY_BLOCK = 45_717_327n

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const fromBlock = BigInt(searchParams.get('fromBlock') ?? DEPLOY_BLOCK.toString())
  const toBlock = searchParams.get('toBlock') ? BigInt(searchParams.get('toBlock')!) : 'latest' as const

  try {
    const [
      deposits,
      charges,
      batchCharges,
      externalRoutes,
      providerWithdrawals,
      migrations,
      rebates,
      treasuryFunds,
    ] = await Promise.all([
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'Deposit', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'Charge', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'BatchCharge', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'ExternalRouteSettled', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'ProviderWithdrawal', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'CreditsMigrated', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'RebateDistributed', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: CARPE_ESCROW_ADDRESS, abi: CARPE_ESCROW_ABI, eventName: 'TreasuryFunded', fromBlock, toBlock }),
    ])

    const blockNumbers = [
      ...deposits, ...charges, ...batchCharges, ...externalRoutes,
      ...providerWithdrawals, ...migrations, ...rebates, ...treasuryFunds,
    ].map(e => e.blockNumber).filter(Boolean) as bigint[]

    const uniqueBlocks = [...new Set(blockNumbers)]
    const blockData = await Promise.all(
      uniqueBlocks.map(n => publicClient.getBlock({ blockNumber: n }))
    )
    const blockTimestamps = Object.fromEntries(
      blockData.map(b => [b.number.toString(), Number(b.timestamp)])
    )

    function ts(blockNumber: bigint | null): number {
      if (!blockNumber) return 0
      return blockTimestamps[blockNumber.toString()] ?? 0
    }

    return NextResponse.json({
      deposits: deposits.map(e => ({
        type: 'deposit',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        user: e.args.user,
        amountUsdc: formatUsdc(e.args.amount ?? 0n),
      })),
      charges: charges.map(e => ({
        type: 'charge',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        user: e.args.user,
        provider: e.args.provider,
        amountUsdc: formatUsdc(e.args.amount ?? 0n),
        providerShareDiem: formatDiem(e.args.providerShare ?? 0n),
        feesDiem: formatDiem(e.args.fees ?? 0n),
        diemReceived: formatDiem(e.args.diemReceived ?? 0n),
        surchargeDiem: formatDiem(e.args.surcharge ?? 0n),
      })),
      batchCharges: batchCharges.map(e => ({
        type: 'batchCharge',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        entryCount: Number(e.args.entryCount ?? 0n),
        totalUsdc: formatUsdc(e.args.totalUsdc ?? 0n),
        diemReceived: formatDiem(e.args.diemReceived ?? 0n),
        surchargeDiem: formatDiem(e.args.surcharge ?? 0n),
        feesDiem: formatDiem(e.args.fees ?? 0n),
      })),
      externalRoutes: externalRoutes.map(e => ({
        type: 'externalRoute',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        user: e.args.user,
        toFloatUsdc: formatUsdc(e.args.toFloat ?? 0n),
        toTreasuryUsdc: formatUsdc(e.args.toTreasury ?? 0n),
      })),
      providerWithdrawals: providerWithdrawals.map(e => ({
        type: 'providerWithdrawal',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        provider: e.args.provider,
        amountDiem: formatDiem(e.args.amount ?? 0n),
      })),
      migrations: migrations.map(e => ({
        type: 'migration',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        user: e.args.user,
        account: e.args.account,
        amountUsdc: formatUsdc(e.args.amount ?? 0n),
      })),
      rebates: rebates.map(e => ({
        type: 'rebate',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        usdcIn: formatUsdc(e.args.usdcIn ?? 0n),
        diemOut: formatDiem(e.args.diemOut ?? 0n),
        providerCount: Number(e.args.providerCount ?? 0n),
      })),
      treasuryFunds: treasuryFunds.map(e => ({
        type: 'treasuryFund',
        txHash: e.transactionHash,
        blockNumber: e.blockNumber?.toString(),
        timestamp: ts(e.blockNumber ?? null),
        to: e.args.to,
        amountDiem: formatDiem(e.args.amount ?? 0n),
        reason: e.args.reason,
      })),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erreur blockchain' }, { status: 500 })
  }
}
