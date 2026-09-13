import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getEventsFromDb, initDb } from '@/lib/db'
import { formatUsdc, formatDiem } from '@/lib/viemClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEPLOY_BLOCK = 45_717_327
const DEPLOY_TS = Math.floor(new Date('2026-05-08T00:00:00Z').getTime() / 1000)

type DbRow = { type: string; tx_hash: string; block_number: string | number; timestamp: string | number; args: Record<string, unknown> }

function resolveTs(row: DbRow): number {
  const ts = Number(row.timestamp)
  if (ts) return ts
  const bn = parseInt(String(row.block_number) || '0')
  if (!bn) return 0
  return DEPLOY_TS + (bn - DEPLOY_BLOCK) * 2
}

function toDate(ts: number) {
  return ts ? new Date(ts * 1000).toLocaleString('fr-FR') : ''
}

function shortAddr(addr: unknown) {
  const s = String(addr ?? '')
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s
}

function safeUsdc(args: Record<string, unknown>, key: string): number {
  try { return formatUsdc(BigInt(String(args[key] ?? '0'))) } catch { return 0 }
}
function safeDiem(args: Record<string, unknown>, key: string): number {
  try { return formatDiem(BigInt(String(args[key] ?? '0'))) } catch { return 0 }
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  row.alignment = { vertical: 'middle' }
}

function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true, size: 11 }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } }
}

function filterMonth(rows: DbRow[], year: number, month: number): DbRow[] {
  return rows.filter(r => {
    const ts = resolveTs(r)
    if (!ts) return false
    const d = new Date(ts * 1000)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  try {
    await initDb()
    const allRows = (await getEventsFromDb()) as DbRow[]

    const deposits    = filterMonth(allRows.filter(r => r.type === 'Deposit' || r.type === 'X402Pull'), year, month)
    const charges     = filterMonth(allRows.filter(r => r.type === 'Charge'), year, month)
    const batches     = filterMonth(allRows.filter(r => r.type === 'BatchCharge'), year, month)
    const extRoutes   = filterMonth(allRows.filter(r => r.type === 'ExternalRouteSettled'), year, month)
    const withdrawals = filterMonth(allRows.filter(r => r.type === 'ProviderWithdrawal'), year, month)
    const migrations  = filterMonth(allRows.filter(r => r.type === 'CreditsMigrated'), year, month)
    const rebates     = filterMonth(allRows.filter(r => r.type === 'RebateDistributed'), year, month)
    const treasury    = filterMonth(allRows.filter(r => r.type === 'TreasuryFunded'), year, month)

    const monthName = new Date(year, month - 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' })

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Carpe Diem Comptabilité'
    wb.created = new Date()

    // ── Dépôts ──────────────────────────────────────────────────────────────
    const totalDep = deposits.reduce((s, r) => s + safeUsdc(r.args, 'amount'), 0)
    const shDep = wb.addWorksheet('Dépôts')
    shDep.addRow([`TOTAL DÉPÔTS — ${monthName}`, `${totalDep.toFixed(2)} USDC`])
    styleTotal(shDep.getRow(1))
    shDep.addRow([])
    shDep.addRow(['Date', 'Utilisateur', 'Montant USDC', 'Type', 'Tx Hash'])
    styleHeader(shDep.getRow(3))
    deposits.forEach(r => shDep.addRow([
      toDate(resolveTs(r)), r.args.user,
      safeUsdc(r.args, 'amount'),
      r.type === 'X402Pull' ? 'X402 Pull' : 'Dépôt manuel',
      r.tx_hash,
    ]))
    shDep.columns = [{ width: 22 }, { width: 44 }, { width: 16 }, { width: 14 }, { width: 70 }]

    // ── Charges ──────────────────────────────────────────────────────────────
    const totalChgUsdc = charges.reduce((s, r) => s + safeUsdc(r.args, 'amount'), 0)
                       + batches.reduce((s, r) => s + safeUsdc(r.args, 'totalUsdc'), 0)
    const totalChgDiem = charges.reduce((s, r) => s + safeDiem(r.args, 'fees'), 0)
                       + batches.reduce((s, r) => s + safeDiem(r.args, 'fees'), 0)
    const shCharge = wb.addWorksheet('Charges')
    shCharge.addRow([`TOTAL CHARGES — ${monthName}`, `${totalChgUsdc.toFixed(2)} USDC débités`, `${totalChgDiem.toFixed(4)} DIEM frais`])
    styleTotal(shCharge.getRow(1))
    shCharge.addRow([])
    shCharge.addRow(['Date', 'Utilisateur', 'Provider', 'USDC débité', 'DIEM reçu', 'Part provider (DIEM)', 'Frais (DIEM)', 'Surcharge (DIEM)', 'Tx Hash'])
    styleHeader(shCharge.getRow(3))
    charges.forEach(r => shCharge.addRow([
      toDate(resolveTs(r)), r.args.user, r.args.provider,
      safeUsdc(r.args, 'amount'), safeDiem(r.args, 'diemReceived'),
      safeDiem(r.args, 'providerShare'), safeDiem(r.args, 'fees'),
      safeDiem(r.args, 'surcharge'), r.tx_hash,
    ]))
    batches.forEach(r => shCharge.addRow([
      toDate(resolveTs(r)), `(batch ${r.args.entryCount} entrées)`, '—',
      safeUsdc(r.args, 'totalUsdc'), safeDiem(r.args, 'diemReceived'), '—',
      safeDiem(r.args, 'fees'), safeDiem(r.args, 'surcharge'), r.tx_hash,
    ]))
    shCharge.columns = [{ width: 22 }, { width: 44 }, { width: 44 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 14 }, { width: 18 }, { width: 70 }]

    // ── Routes externes ──────────────────────────────────────────────────────
    const totalExt = extRoutes.reduce((s, r) => s + safeUsdc(r.args, 'toFloat') + safeUsdc(r.args, 'toTreasury'), 0)
    const shExt = wb.addWorksheet('Routes externes')
    shExt.addRow([`TOTAL ROUTES EXTERNES — ${monthName}`, `${totalExt.toFixed(2)} USDC`])
    styleTotal(shExt.getRow(1))
    shExt.addRow([])
    shExt.addRow(['Date', 'Utilisateur', 'Vers Float (USDC)', 'Vers Treasury (USDC)', 'Total (USDC)', 'Tx Hash'])
    styleHeader(shExt.getRow(3))
    extRoutes.forEach(r => {
      const f = safeUsdc(r.args, 'toFloat'), t = safeUsdc(r.args, 'toTreasury')
      shExt.addRow([toDate(resolveTs(r)), r.args.user, f, t, f + t, r.tx_hash])
    })
    shExt.columns = [{ width: 22 }, { width: 44 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 70 }]

    // ── Retraits providers ───────────────────────────────────────────────────
    const totalWdr = withdrawals.reduce((s, r) => s + safeDiem(r.args, 'amount'), 0)
    const shProv = wb.addWorksheet('Retraits providers')
    shProv.addRow([`TOTAL RETRAITS PROVIDERS — ${monthName}`, `${totalWdr.toFixed(4)} DIEM`])
    styleTotal(shProv.getRow(1))
    shProv.addRow([])
    shProv.addRow(['Date', 'Provider', 'Montant DIEM', 'Tx Hash'])
    styleHeader(shProv.getRow(3))
    withdrawals.forEach(r => shProv.addRow([toDate(resolveTs(r)), r.args.provider, safeDiem(r.args, 'amount'), r.tx_hash]))
    shProv.columns = [{ width: 22 }, { width: 44 }, { width: 16 }, { width: 70 }]

    // ── Migrations ───────────────────────────────────────────────────────────
    const totalMig = migrations.reduce((s, r) => s + safeUsdc(r.args, 'amount'), 0)
    const shMig = wb.addWorksheet('Migrations')
    shMig.addRow([`TOTAL MIGRATIONS — ${monthName}`, `${totalMig.toFixed(2)} USDC`])
    styleTotal(shMig.getRow(1))
    shMig.addRow([])
    shMig.addRow(['Date', 'Utilisateur', 'Compte destinataire', 'Montant USDC', 'Tx Hash'])
    styleHeader(shMig.getRow(3))
    migrations.forEach(r => shMig.addRow([toDate(resolveTs(r)), r.args.user, r.args.account, safeUsdc(r.args, 'amount'), r.tx_hash]))
    shMig.columns = [{ width: 22 }, { width: 44 }, { width: 44 }, { width: 14 }, { width: 70 }]

    // ── Rebates ──────────────────────────────────────────────────────────────
    const totalReb = rebates.reduce((s, r) => s + safeUsdc(r.args, 'usdcIn'), 0)
    const shRebate = wb.addWorksheet('Rebates')
    shRebate.addRow([`TOTAL REBATES — ${monthName}`, `${totalReb.toFixed(2)} USDC`])
    styleTotal(shRebate.getRow(1))
    shRebate.addRow([])
    shRebate.addRow(['Date', 'USDC In', 'DIEM Out', 'Nb providers', 'Tx Hash'])
    styleHeader(shRebate.getRow(3))
    rebates.forEach(r => shRebate.addRow([toDate(resolveTs(r)), safeUsdc(r.args, 'usdcIn'), safeDiem(r.args, 'diemOut'), Number(r.args.providerCount), r.tx_hash]))
    shRebate.columns = [{ width: 22 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 70 }]

    // ── Treasury ─────────────────────────────────────────────────────────────
    const totalTre = treasury.reduce((s, r) => s + safeDiem(r.args, 'amount'), 0)
    const shTreasury = wb.addWorksheet('Treasury')
    shTreasury.addRow([`TOTAL TREASURY — ${monthName}`, `${totalTre.toFixed(4)} DIEM`])
    styleTotal(shTreasury.getRow(1))
    shTreasury.addRow([])
    shTreasury.addRow(['Date', 'Destinataire', 'Montant DIEM', 'Source', 'Tx Hash'])
    styleHeader(shTreasury.getRow(3))
    treasury.forEach(r => shTreasury.addRow([toDate(resolveTs(r)), shortAddr(r.args.to), safeDiem(r.args, 'amount'), r.args.source, r.tx_hash]))
    shTreasury.columns = [{ width: 22 }, { width: 14 }, { width: 16 }, { width: 30 }, { width: 70 }]

    // ── Résumé ───────────────────────────────────────────────────────────────
    const shSum = wb.addWorksheet('Résumé')
    shSum.addRow([`Résumé comptable — ${monthName}`])
    shSum.getRow(1).font = { bold: true, size: 14 }
    shSum.addRow([])
    shSum.addRow(['FLUX USDC', 'Montant'])
    styleHeader(shSum.getRow(3))
    shSum.addRow(['Dépôts utilisateurs', totalDep])
    shSum.addRow(['Charges (services)', -totalChgUsdc])
    shSum.addRow(['Routes externes', -totalExt])
    shSum.addRow(['Migrations crédits', -totalMig])
    shSum.addRow(['Rebates (USDC in)', -totalReb])
    const netUsdc = totalDep - totalChgUsdc - totalExt - totalMig - totalReb
    shSum.addRow(['Solde net USDC', netUsdc])
    styleTotal(shSum.getRow(9))
    shSum.addRow([])
    shSum.addRow(['FLUX DIEM', 'Montant'])
    styleHeader(shSum.getRow(11))
    shSum.addRow(['Frais protocole', totalChgDiem])
    shSum.addRow(['Retraits providers', -totalWdr])
    shSum.addRow(['Vers Treasury', totalTre])
    shSum.columns = [{ width: 30 }, { width: 20 }]

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="carpe-diem-compta-${year}-${String(month).padStart(2, '00')}.xlsx"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Export error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
