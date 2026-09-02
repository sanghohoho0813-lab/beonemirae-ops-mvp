import { Building2, Headset, MapPin, Phone, ScrollText, User } from 'lucide-react'
import { CLIENT_TEL, COMPANY, COMPANY_HOURS } from '../lib/brand'
import { BRAND_IMG } from '../lib/brandAssets'
import type { Client } from '../types'
import { BrandImg } from './BrandImg'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 화면 맨 아래 칸 (0086)
//
//  시안 아래쪽에는 「담당 컨설턴트 · 주요 안내 · 공지사항 · 만족도 평가」
//  네 칸이 있습니다. 그중 저희가 **실제로 가진 것만** 답니다.
//
//    담당 컨설턴트   → 상담센터로 답니다. 거래처별 담당자를 저장하는 칸이
//                     아직 없습니다. 없는 사람 이름을 지어 넣지 않습니다.
//    주요 안내       → 이 병원의 **등록 정보**로 답니다. 주소·담당자·연락처는
//                     실제 값이고, 틀렸으면 병원이 바로 알아봅니다.
//                     (수거가 엉뚱한 데로 가는 사고가 여기서 걸립니다)
//    계약            → contractStart/End·paymentTerms 가 **있을 때만** 답니다.
//    공지사항        → 공지 표가 없습니다. **안 답니다.**
//    만족도 평가     → 설문 자료가 없습니다. **안 답니다.**
//                     별 다섯 개를 그려 놓고 눌러도 아무 데도 안 가는 것은
//                     대표님이 금지한 「작동하지 않는 버튼」입니다.
// ─────────────────────────────────────────────────────────────────────────────

function Cell({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 bg-white px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-100 text-navy-600">
        <Icon size={18} strokeWidth={2.3} />
      </span>
      <div className="min-w-0">
        <p className="t-muted break-keep">{label}</p>
        <div className="t-body mt-0.5 break-keep font-bold leading-snug text-navy-900">{children}</div>
      </div>
    </div>
  )
}

export function PortalFooter({ client }: { client: Client }) {
  //  ⚠ 계약 정보는 **있을 때만** 한 칸을 씁니다. 비어 있는데 칸만 있으면
  //    「—」가 줄줄이 늘어서서 시스템이 비어 보입니다.
  const contract = [
    client.contractStart ? `시작 ${client.contractStart}` : null,
    client.contractEnd ? `종료 ${client.contractEnd}` : null,
    client.paymentTerms || null,
  ].filter(Boolean)

  return (
    <footer data-portal-footer className="space-y-3">
      {/*  0095 — 회사 소개 한 장 (준비 자산 brand_story_space).
           연락처 표 위에서 「누구와 거래하고 있는지」가 눈에 남게 합니다. */}
      <div className="card flex items-center gap-4 overflow-hidden p-0">
        <BrandImg src={BRAND_IMG.brandStory} className="h-24 w-32 shrink-0 sm:h-28 sm:w-48" />
        <div className="min-w-0 py-3 pr-4">
          <p className="t-body break-keep font-extrabold text-navy-900">{COMPANY}</p>
          <p className="t-muted mt-0.5 break-keep leading-snug">
            의료폐기물 수거·운반 전문 — 수거부터 인계까지 기록으로 남겨 관리합니다.
          </p>
        </div>
      </div>
      <div className="card grid grid-cols-1 gap-px overflow-hidden bg-navy-100 sm:grid-cols-2 xl:grid-cols-3">
        <Cell icon={Headset} label="비원미래 고객상담">
          {/*  ⚠ 누를 수 있는 것은 **44px 이상**이어야 합니다. 처음에는 그냥
               밑줄 친 글자였는데 높이가 21px 이었습니다 — 요양병원
               담당자분들 연세를 생각하면 전화 걸다가 옆을 누릅니다.
               (check_scale 이 여섯 폭에서 잡아냈습니다) */}
          <a
            href={`tel:${CLIENT_TEL}`}
            className="-mx-2 -my-1 inline-flex min-h-[2.75rem] items-center rounded-lg px-2 py-1 font-extrabold text-teal-700 underline underline-offset-4 transition hover:bg-teal-50"
          >
            {CLIENT_TEL}
          </a>
          <span className="t-muted mt-0.5 block font-semibold">{COMPANY_HOURS}</span>
        </Cell>

        <Cell icon={MapPin} label="등록된 수거 주소">
          {/*  ⚠ 주소는 절대 추측하지 않습니다. 비었으면 비었다고 적고,
               고쳐 달라고 말합니다 — 수거가 엉뚱한 데로 가는 것보다 낫습니다. */}
          {client.address || (
            <span className="text-rose-600">등록되어 있지 않습니다 · 상담센터로 알려 주세요</span>
          )}
        </Cell>

        <Cell icon={User} label="우리 병원 담당자">
          {client.manager || <span className="text-navy-400">등록되어 있지 않습니다</span>}
          {client.phone && <span className="t-muted mt-0.5 block font-semibold">{client.phone}</span>}
        </Cell>

        <Cell icon={Building2} label="수거 품목">
          {[client.collectsMedicalWaste ? '의료폐기물' : null, client.collectsDiaper ? '일회용기저귀' : null]
            .filter(Boolean)
            .join(' · ') || <span className="text-navy-400">등록되어 있지 않습니다</span>}
        </Cell>

        {contract.length > 0 && (
          <Cell icon={ScrollText} label="계약">
            {contract.join(' · ')}
          </Cell>
        )}
      </div>

      {/*  ⚠ 「이 화면에 없는 것」을 여기서 말해 둡니다. 화면에 없는 것을
           찾다가 전화하는 일이 실제로 있습니다. */}
      <p className="t-muted break-keep px-1 leading-snug">
        {COMPANY} · 이 화면에는 <b>우리 병원 자료만</b> 표시됩니다. 화면의 값이 실제와 다르면 상담센터
        {' '}({CLIENT_TEL})로 알려 주시면 바로잡겠습니다.
      </p>
    </footer>
  )
}
