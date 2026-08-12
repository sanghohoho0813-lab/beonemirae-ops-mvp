import { Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 시연 모드 안내 배너
//
//  이 문구는 원래 이렇게 적혀 있었습니다.
//
//    "현재 버전은 시연용 MVP입니다. 입력 데이터는 사용하는 기기에 저장되며,
//     실제 운영용 버전에서는 Supabase DB 연동으로 … 확장 예정입니다."
//
//  실제 운영으로 넘어온 지금은 **사실이 아닙니다.** 입력은 기기가 아니라
//  서버에 저장되고, PC·폰 사이 공유도 이미 되고 있습니다. 그런데 이 배너는
//  로그인한 화면에도 그대로 떠 있었습니다. 현장 담당자가 읽으면 자기가 넣은
//  수거 기록이 연습용이라고 이해합니다 — 실제로는 그 값으로 청구가 나갑니다.
//
//  그래서 시연 모드에서만 띄웁니다. 서버에 연결된 상태에서는 그리지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function InfoBanner() {
  const { mode } = useAuth()
  if (mode === 'live') return null

  return (
    <div className="rounded-2xl bg-navy-50 p-4">
      <div className="flex items-start gap-2.5">
        <Info size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-navy-400" />
        <p className="text-[1.08rem] leading-relaxed text-navy-500">
          지금은 <b className="text-navy-700">시연 모드</b>입니다. 입력한 내용은 이 브라우저에만 저장되고 서버로
          올라가지 않습니다. 실제 운영 계정으로 로그인하면 <b className="text-navy-700">서버에 저장되어</b> PC·폰
          어디서나 같은 기록을 보게 됩니다.
        </p>
      </div>
    </div>
  )
}
