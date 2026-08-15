import type { AppData } from '../types'
import { monthRevenue, shiftMonth } from './revenue'
import { paidTotalOf } from './selectors'
import { thisMonth, today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 운영 데이터 내보내기
//
//  지금 백업은 Supabase 자동 백업 하나뿐입니다. 그건 사고가 났을 때 되살리는
//  장치이지, **대표님이 숫자를 확인하는 수단이 아닙니다.** 서버 안을 들여다볼
//  수 없으니 「이 시스템의 숫자가 맞나」를 다른 방법으로 검산할 길이 없었습니다.
//
//  표를 그대로 CSV 로 내려받습니다. 엑셀이 바로 열고, 사람이 눈으로 봅니다.
//
//  ── 왜 CSV 인가 ────────────────────────────────────────────────────────
//
//   .xlsx 로 만들려면 압축 파일을 직접 짜야 합니다. 그렇게 만든 파일은
//   열리기 전까지 맞는지 알 수 없고, 깨지면 백업이 아니라 쓰레기입니다.
//   CSV 는 글자 그대로라 무엇이 들어 있는지 눈으로 확인됩니다.
//
//   한글이 깨지지 않게 BOM 을 붙입니다 — 이게 없으면 엑셀에서 「ë°ì´í°」
//   처럼 보입니다. 쉼표·따옴표·줄바꿈이 든 값은 따옴표로 감쌉니다.
//
//  ── 이 파일이 하는 것과 못 하는 것 ─────────────────────────────────────
//
//   한다   보관 · 눈으로 검산 · 세무사·은행에 자료로 제출 · 엑셀에서 재집계
//   못 한다 **이 파일로 시스템을 되돌리지 못합니다.** 복구는 Supabase 백업으로
//          합니다. 화면에 그대로 적습니다 — 백업인 줄 알고 안심하면 안 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 있으면 감쌉니다 */
function cell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? String(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))]
  //  \r\n — 엑셀이 가장 얌전하게 읽습니다
  return `﻿${lines.join('\r\n')}\r\n`
}

export interface ExportTable {
  key: string
  label: string
  /** 무엇이 들어 있는지 한 줄 */
  desc: string
  headers: string[]
  rows: unknown[][]
}

const nameMap = (data: AppData) =>
  new Map([...data.clients, ...(data.retiredClients ?? [])].map((c) => [c.id, c.name]))

/** 내려받을 수 있는 표들 — 화면이 이 목록을 그대로 그립니다 */
export function exportTables(data: AppData): ExportTable[] {
  const name = nameMap(data)
  const clientName = (id: string) => name.get(id) ?? '(지운 거래처)'
  const vehicle = new Map((data.vehicles ?? []).map((v) => [v.id, v.name]))

  const out: ExportTable[] = []

  // ── 거래처 ────────────────────────────────────────────────────────────────
  out.push({
    key: 'clients',
    label: '거래처',
    desc: '계약·단가·사업자정보를 포함한 거래처 전체 (거래 종료한 곳 포함)',
    headers: [
      '거래처', '유형', '거래상태', '주소', '담당자', '연락처',
      '수거주기(의료)', '수거주기(기저귀)', '수거 가능시간', '처리장',
      '의료폐기물', '일회용기저귀', '보관창고',
      '계약 시작일', '계약 종료일', '결제일', '결제조건',
      '사업자등록번호', '대표자', '업태', '종목', '계산서 이메일', '부가세',
      '수거 0건에도 월정액 청구', '특이사항',
    ],
    rows: [...data.clients, ...(data.retiredClients ?? [])].map((c) => [
      c.name, c.type, data.clients.some((x) => x.id === c.id) ? '거래 중' : '거래 종료',
      c.address, c.manager, c.phone,
      c.collectionCycle, c.diaperCycle ?? '', c.collectTime ?? '', c.disposalSite ?? '',
      c.collectsMedicalWaste ? 'O' : '', c.collectsDiaper ? 'O' : '', c.storageSize,
      c.contractStart ?? '', c.contractEnd ?? '', c.paymentDueDay ?? '', c.paymentTerms ?? '',
      c.bizNo ?? '', c.bizCeo ?? '', c.bizType ?? '', c.bizItem ?? '', c.taxEmail ?? '', c.vatMode ?? '',
      c.flatFeeWhenEmpty ? 'O' : '', c.note ?? '',
    ]),
  })

  // ── 수거 ──────────────────────────────────────────────────────────────────
  out.push({
    key: 'schedules',
    label: '수거',
    desc: '예정·완료를 포함한 모든 수거 기록',
    headers: ['날짜', '거래처', '구분', '상태', '예정 kg', '실제 kg', '차량', '기사', '완료 시각', '추가 수거', '메모'],
    rows: data.schedules
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || clientName(a.clientId).localeCompare(clientName(b.clientId), 'ko'))
      .map((s) => [
        s.date, clientName(s.clientId), s.wasteType, s.status,
        s.expectedAmount, s.actualAmount ?? '',
        vehicle.get(s.vehicleId ?? '') ?? '', s.driverName ?? '',
        s.completedAt ?? '', s.origin ?? '', s.memo ?? '',
      ]),
  })

  // ── 자재 공급 ─────────────────────────────────────────────────────────────
  out.push({
    key: 'materials',
    label: '자재 공급',
    desc: '거래처에 건넨 박스·비닐·용기 (재고 차감의 근거)',
    headers: ['날짜', '거래처', '박스', '비닐', '바늘통', '추가요청', '메모'],
    rows: data.materials
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => [
        m.date, clientName(m.clientId),
        m.boxCount, m.vinylCount, m.needleBoxCount,
        m.isAdditionalRequest ? 'O' : '', m.memo ?? '',
      ]),
  })

  // ── 청구 ──────────────────────────────────────────────────────────────────
  out.push({
    key: 'payments',
    label: '청구',
    desc: '확정한 청구 (취소한 것도 그대로 — 지우지 않습니다)',
    headers: ['청구월', '거래처', '금액', '상태', '받은 금액', '남은 금액', '종류', '확정 시각', '취소 시각', '메모'],
    rows: data.payments
      .slice()
      .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))
      .map((p) => {
        const paid = paidTotalOf(data, p)
        return [
          p.billingMonth, clientName(p.clientId), p.amount, p.status,
          paid, p.status === '취소' ? '' : p.amount - paid,
          p.snapshot?.kind ?? '', p.snapshot?.confirmedAt ?? '', p.canceledAt ?? '', p.memo ?? '',
        ]
      }),
  })

  // ── 입금 ──────────────────────────────────────────────────────────────────
  const payById = new Map(data.payments.map((p) => [p.id, p]))
  out.push({
    key: 'receipts',
    label: '입금',
    desc: '실제로 받은 돈 (부분입금 포함). 통장에서 온 건은 그 줄의 지문이 함께',
    headers: ['입금일', '거래처', '청구월', '금액', '수단', '통장 출처', '기록자', '메모'],
    rows: (data.receipts ?? [])
      .slice()
      .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
      .map((r) => {
        const p = payById.get(r.paymentId)
        return [
          r.receivedOn, p ? clientName(p.clientId) : '', p?.billingMonth ?? '',
          r.amount, r.method, r.sourceRef ?? '', r.actorName ?? '', r.memo ?? '',
        ]
      }),
  })

  // ── 월 매출 (집계 결과) ───────────────────────────────────────────────────
  //  가장 중요한 표입니다. 대표가 보는 매출이 **어느 값에서 나왔는지**까지
  //  들어 있어, 엑셀에서 그대로 검산할 수 있습니다.
  const months: string[] = []
  for (let i = 23; i >= 0; i -= 1) months.push(shiftMonth(thisMonth(), -i))
  const revRows: unknown[][] = []
  for (const m of months) {
    for (const r of monthRevenue(data, m).rows) {
      revRows.push([m, r.clientName, r.amount, r.source, r.reason ?? '',
        r.replaced ? `${r.replaced.source} ${r.replaced.amount}` : ''])
    }
  }
  out.push({
    key: 'revenue',
    label: '월 매출 (집계)',
    desc: '최근 24개월 · 거래처 × 월 하나씩. 어느 출처를 썼는지 함께 — 이 표를 더하면 회사 매출입니다',
    headers: ['월', '거래처', '매출', '출처', '직접입력 사유', '덮은 값'],
    rows: revRows,
  })

  // ── Excel 월 실적 (원본) ──────────────────────────────────────────────────
  if ((data.monthlyActuals ?? []).length > 0) {
    out.push({
      key: 'actuals',
      label: 'Excel 월 실적',
      desc: '엑셀 정산 시트에서 가져온 월 합계 (가져온 그대로 — 가공하지 않음)',
      headers: ['월', '거래처', '의료폐기물 kg', '기저귀 kg', '매출', '원가', '이익', '날짜별 기록 있음', '원본 파일'],
      rows: (data.monthlyActuals ?? [])
        .slice()
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((m) => [
          m.month, clientName(m.clientId), m.medicalKg, m.diaperKg,
          m.revenue, m.cost, m.profit, m.hasDated ? 'O' : '', m.sourceFile,
        ]),
    })
  }

  // ── 매출 조정 ─────────────────────────────────────────────────────────────
  if ((data.revenueOverrides ?? []).length > 0) {
    out.push({
      key: 'overrides',
      label: '매출 직접입력',
      desc: '사람이 사유를 적어 넣은 매출 (집계에서 가장 높은 우선순위)',
      headers: ['월', '거래처', '금액', '사유', '작성자', '넣은 시각', '고친 시각'],
      rows: (data.revenueOverrides ?? []).map((o) => [
        o.month, clientName(o.clientId), o.amount, o.reason, o.actorName, o.createdAt, o.updatedAt,
      ]),
    })
  }

  // ── 단가 판 ───────────────────────────────────────────────────────────────
  if ((data.clientPrices ?? []).length > 0) {
    out.push({
      key: 'prices',
      label: '단가 이력',
      desc: '언제부터 얼마였는지 (과거 청구의 근거)',
      headers: ['거래처', '적용 시작일', '단가', '메모', '작성자', '넣은 시각'],
      rows: (data.clientPrices ?? [])
        .slice()
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
        .map((v) => [
          clientName(v.clientId), v.effectiveFrom, JSON.stringify(v.pricing),
          v.memo ?? '', v.actorName ?? '', v.createdAt,
        ]),
    })
  }

  // ── 운영비 ────────────────────────────────────────────────────────────────
  if ((data.operatingCosts ?? []).length > 0) {
    out.push({
      key: 'costs',
      label: '월 운영비',
      desc: '대표가 넣은 실제 지출 (영업이익의 근거)',
      headers: ['월', '항목', '금액', '메모'],
      rows: (data.operatingCosts ?? [])
        .slice()
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((c) => [c.month, c.category, c.amount, c.memo ?? '']),
    })
  }

  return out
}

/** 파일 하나 내려받기 */
export function downloadCsv(table: ExportTable, stamp = today()): void {
  const blob = new Blob([toCsv(table.headers, table.rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `비원미래-${table.label}-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
