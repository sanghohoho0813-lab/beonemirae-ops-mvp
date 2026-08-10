import { useRef } from 'react'
import { Printer, X } from 'lucide-react'
import type { Invoice } from '../lib/billing'
import { won } from '../lib/format'
import { usePrintIsolate } from '../lib/usePrintIsolate'

// ─────────────────────────────────────────────────────────────────────────────
// 거래명세서
//
//  엑셀 「2026 거래명세서」와 같은 구성입니다. 다른 점은 하나뿐 —
//  일자·수량을 다시 적지 않습니다. 완료된 수거와 공급 기록에서 그대로 옵니다.
//
//  PDF 는 브라우저 인쇄로 만듭니다. 라이브러리를 새로 넣지 않아도
//  「인쇄 → PDF 로 저장」이면 거래처에 보낼 파일이 나옵니다.
//  (@media print 에서 화면 UI 를 숨기고 명세서만 A4 로 남깁니다)
//
//  실제로 뽑아 보니 A4 5장이 나왔고 앞 3장이 거래처 상세 화면이었습니다.
//  명세서는 화면 위에 덮여 있을 뿐 문서 안에서는 여전히 그 화면 '다음' 에
//  있어서, 인쇄하면 순서대로 다 찍혔던 것입니다. usePrintIsolate 로
//  인쇄할 때만 뒤 화면을 뺍니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 공급자 정보 — 거래명세서 상단에 그대로 나갑니다.
 *
 * 고객사마다 다른 값이라 여기 한 곳에만 둡니다
 * (docs/onboarding/04_CLIENT_SPECIFIC.md 2-1 참고).
 *
 * 담당자 연락처는 대표번호를 씁니다. 직원 개인 휴대폰 번호를 저장소에 넣지
 * 않기 위해서입니다. 개인 번호로 받아야 하면 배포 전에 여기만 바꾸세요.
 */
const SUPPLIER = {
  name: '주식회사 비원미래',
  ceo: '송명근',
  bizNo: '256-88-02759',
  address: '경기도 남양주시 오남읍 양지로 47-35, 바동 1층',
  category: '서비스',
  item: '의료폐기물 수집운반',
  manager: '홍현주',
  phone: '1533-8876',
  email: 'beonemirae@naver.com',
  bank: '기업은행',
  account: '523-075252-04-012',
  holder: '㈜ 비원미래',
}

const ymd = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}
const md = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function InvoiceView({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const inv = invoice
  const [y, m] = inv.month.split('-')
  const sheetRef = useRef<HTMLDivElement>(null)
  usePrintIsolate(sheetRef, true)

  return (
    <div ref={sheetRef} className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 print:static print:bg-white">
      {/* 조작 바 — 인쇄에는 나오지 않습니다 */}
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-navy-900 px-4 py-3 text-white print:hidden sm:px-6">
        <p className="t-body min-w-0 flex-1 break-keep font-bold">
          {inv.clientName} · {y}년 {Number(m)}월 거래명세서
        </p>
        <button
          onClick={() => window.print()}
          className="shrink-0 rounded-full bg-white px-4 py-2 text-[1.02rem] font-extrabold text-navy-900 transition hover:bg-navy-100"
        >
          <Printer size={16} strokeWidth={2.5} className="mr-1 inline -translate-y-px" />
          인쇄 · PDF 저장
        </button>
        <button onClick={onClose} aria-label="닫기" className="shrink-0 rounded-full p-2 hover:bg-white/15">
          <X size={19} />
        </button>
      </div>

      <div className="mx-auto my-4 max-w-[52rem] bg-white p-6 shadow-2xl print:my-0 print:max-w-none print:p-0 print:shadow-none sm:p-10">
        <h1 className="text-center text-[1.6rem] font-black tracking-tight text-navy-900">
          {y}년 {Number(m)}월 거래명세서
        </h1>

        {/* 공급받는 자 / 공급자 */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[1.25rem] font-extrabold text-navy-900">{inv.clientName}</p>
            {inv.manager && <p className="mt-1 text-[1.02rem] text-navy-600">담당자 : {inv.manager}</p>}
            <p className="mt-3 text-[1.02rem] text-navy-600">발행일자 : {ymd(inv.issuedAt)}</p>
            <p className="text-[1.02rem] text-navy-600">
              거래일자 : {ymd(inv.from)} ~ {Number(inv.to.split('-')[2])}일
            </p>
            <p className="mt-2 text-[1.02rem] text-navy-500">아래와 같이 계산합니다.</p>
          </div>
          <div className="rounded-xl border border-navy-200 p-3 text-[0.98rem] leading-relaxed">
            <p className="mb-1 text-[1.08rem] font-extrabold text-navy-900">{SUPPLIER.name}</p>
            <Row k="대표자" v={SUPPLIER.ceo} />
            <Row k="등록번호" v={SUPPLIER.bizNo} />
            <Row k="소재지" v={SUPPLIER.address} />
            <Row k="업태" v={`${SUPPLIER.category} · ${SUPPLIER.item}`} />
            <Row k="담당자" v={`${SUPPLIER.manager} ${SUPPLIER.phone}`} />
            <Row k="이메일" v={SUPPLIER.email} />
          </div>
        </div>

        {/* 합계금액 */}
        <div className="mt-6 flex items-center gap-4 rounded-xl bg-navy-900 px-5 py-4 text-white">
          <span className="text-[1.08rem] font-bold">합계금액</span>
          <span className="ml-auto text-[1.7rem] font-black tabular-nums">{won(inv.total)}</span>
        </div>

        {/* 명세 */}
        <table className="mt-5 w-full border-collapse text-[0.98rem]">
          <thead>
            <tr className="bg-navy-50 text-navy-600">
              <Th className="w-[4.5rem]">월/일</Th>
              <Th className="text-left">품목</Th>
              <Th className="w-[4rem]">단위</Th>
              <Th className="w-[5rem] text-right">수량</Th>
              <Th className="w-[5.5rem] text-right">단가</Th>
              <Th className="w-[7rem] text-right">공급가액</Th>
              <Th className="text-left">비고</Th>
            </tr>
          </thead>
          <tbody>
            {inv.medicalLines.map((l, i) => (
              <tr key={`m${i}`} className="border-b border-navy-100">
                <Td className="text-center">{md(l.date)}</Td>
                <Td className="text-left font-bold text-navy-800">{l.label}</Td>
                <Td className="text-center text-navy-500">{l.unit}</Td>
                <Td className="text-right tabular-nums">{l.qty.toLocaleString()}</Td>
                <Td className="text-right tabular-nums text-navy-500">{l.price.toLocaleString()}</Td>
                <Td className="text-right font-bold tabular-nums">{l.amount.toLocaleString()}</Td>
                <Td className="text-left text-navy-400">{l.note}</Td>
              </tr>
            ))}
            {inv.medicalLines.length > 0 && (
              <tr className="border-b-2 border-navy-300 bg-navy-50/60 font-extrabold text-navy-900">
                <Td colSpan={3} className="text-left">
                  의료폐기물 수집운반비용 합계
                </Td>
                <Td className="text-right tabular-nums">{inv.medicalKg.toLocaleString()}</Td>
                <Td />
                <Td className="text-right tabular-nums">{inv.medicalSubtotal.toLocaleString()}</Td>
                <Td />
              </tr>
            )}

            {inv.diaperLines.map((l, i) => (
              <tr key={`d${i}`} className="border-b border-navy-100">
                <Td className="text-center">{md(l.date)}</Td>
                <Td className="text-left font-bold text-navy-800">의료기관일회용기저귀</Td>
                <Td className="text-center text-navy-500">{l.unit}</Td>
                <Td className="text-right tabular-nums">{l.qty.toLocaleString()}</Td>
                <Td className="text-right tabular-nums text-navy-500">{l.price.toLocaleString()}</Td>
                <Td className="text-right font-bold tabular-nums">{l.amount.toLocaleString()}</Td>
                <Td className="text-left text-navy-400">{l.note}</Td>
              </tr>
            ))}
            {inv.diaperLines.length > 0 && (
              <tr className="border-b-2 border-navy-300 bg-navy-50/60 font-extrabold text-navy-900">
                <Td colSpan={3} className="text-left">
                  의료기관 일회용기저귀 수집운반비용 합계
                </Td>
                <Td className="text-right tabular-nums">{inv.diaperKg.toLocaleString()}</Td>
                <Td />
                <Td className="text-right tabular-nums">{inv.diaperSubtotal.toLocaleString()}</Td>
                <Td />
              </tr>
            )}

            <tr className="bg-navy-900 font-extrabold text-white">
              <Td colSpan={5} className="text-left">
                합계
              </Td>
              <Td className="text-right tabular-nums">{inv.total.toLocaleString()}</Td>
              <Td />
            </tr>
          </tbody>
        </table>

        {/* 무상 공급 — 매출이 아니므로 참고로만 */}
        {inv.freeSupplies.length > 0 && (
          <p className="mt-3 break-keep text-[0.95rem] leading-relaxed text-navy-500">
            <b className="text-navy-700">무상 공급 (매출 미포함)</b> ·{' '}
            {inv.freeSupplies.map((f) => `${f.label} ${f.qty.toLocaleString()}${f.unit}`).join(' · ')}
          </p>
        )}

        {/* 거래조건 */}
        <div className="mt-6 rounded-xl border border-navy-200 p-4 text-[0.98rem] leading-relaxed text-navy-700">
          <p className="mb-1.5 font-extrabold text-navy-900">거래조건</p>
          <p>1. 결제기한 : {inv.dueDate ? ymd(inv.dueDate) : '거래처와 협의'}</p>
          <p>2. 대금 지불방법 : {inv.paymentTerms || '현금 (사업자 등록증 상 상호로 입금 부탁드립니다)'}</p>
          <p>3. 계산서 (면세) : 익월 10일 발행</p>
          <p>
            4. 결제정보 · {SUPPLIER.bank} {SUPPLIER.account} · 예금주 {SUPPLIER.holder}
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex gap-2 text-navy-600">
      <span className="w-[4.2rem] shrink-0 text-navy-400">{k}</span>
      <span className="min-w-0 break-keep">{v}</span>
    </p>
  )
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`border border-navy-200 px-2 py-2 font-bold ${className}`}>{children}</th>
}

function Td({
  children,
  className = '',
  colSpan,
}: {
  children?: React.ReactNode
  className?: string
  colSpan?: number
}) {
  return (
    <td colSpan={colSpan} className={`border border-navy-200 px-2 py-1.5 ${className}`}>
      {children}
    </td>
  )
}
