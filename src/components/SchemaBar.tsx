import { useEffect, useState } from 'react'
import { DatabaseZap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { EXPECTED_SCHEMA_VERSION, missingParts, schemaVersion } from '../lib/repo'

// ─────────────────────────────────────────────────────────────────────────────
// DB 업데이트 안내
//
//  마이그레이션을 실행하지 않은 채 새 화면을 열면 **오류 없이 틀린 화면**이
//  나옵니다. 없는 표를 읽으면 권한 문제와 구분이 안 돼 빈 값으로 넘기기
//  때문입니다 — 운영비를 넣었는데도 「미입력」으로 보이고, 통장 대사는
//  중복 방지가 없는 채로 돌아갑니다. 화면 어디에도 그 사실이 나오지
//  않았습니다.
//
//  로그인할 때 서버 DB 버전을 한 번 물어보고, 앱이 기대하는 버전보다
//  낮으면 어느 파일을 실행해야 하는지 위에 띄웁니다.
//
//  대표님(관리자)에게만 보여 줍니다 — SQL 을 실행하는 사람이 대표님이고,
//  사무실·현장에는 손 쓸 수 없는 경고일 뿐입니다.
// ─────────────────────────────────────────────────────────────────────────────

export function SchemaBar() {
  const { mode, role } = useAuth()
  const [version, setVersion] = useState<number | null | undefined>(undefined)

  const admin = role === 'admin'

  useEffect(() => {
    if (mode !== 'live' || !admin) return
    let alive = true
    void schemaVersion().then((v) => {
      if (alive) setVersion(v)
    })
    return () => {
      alive = false
    }
  }, [mode, admin])

  //  마지막 로드에서 **없어서 건너뛴** 표. 판 번호가 맞아도 표 하나가
  //  빠져 있을 수 있습니다(RUN 파일 하나를 건너뛴 경우) — 그때도 알려 줍니다.
  //
  //   `data` 를 함께 읽는 이유는 값을 쓰려는 게 아니라 **다시 그리기 위해서**
  //   입니다. 자료를 다 읽은 뒤에야 빠진 표가 정해지는데, 그 배열이 바뀌는
  //   것만으로는 화면이 다시 그려지지 않습니다.
  const { data } = useData()
  void data
  const missing = missingParts

  //  빠진 표가 있으면 **사무실에도** 알립니다.
  //
  //   판 번호가 낮다는 안내는 SQL 을 실행할 수 있는 대표님에게만 뜹니다 —
  //   사무실은 손 쓸 수 없는 경고를 볼 이유가 없습니다. 그러나 표가 실제로
  //   빠져 있으면 이야기가 다릅니다. 그 화면은 **조용히 0원**을 보여 주고,
  //   보는 사람은 그게 진짜 0원인지 자료를 못 읽은 것인지 알 수 없습니다.
  //   돈이 걸린 자리에서 침묵이 제일 위험합니다.
  if (mode !== 'live') return null
  if (!admin && missing.length === 0) return null
  if (admin && version === undefined) return null
  if (admin && version != null && version >= EXPECTED_SCHEMA_VERSION && missing.length === 0) return null

  return (
    <div
      data-schema-bar
      className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-amber-500 px-4 py-3 text-white sm:px-6"
    >
      <DatabaseZap size={19} className="shrink-0" strokeWidth={2.6} />
      <p className="t-body min-w-0 flex-1 break-keep font-bold">
        {admin ? (
          <>
            DB 업데이트가 필요합니다 — 서버 {version == null ? '구버전' : `버전 ${version}`} · 앱은 버전{' '}
            {EXPECTED_SCHEMA_VERSION} 기준입니다. Supabase SQL Editor 에서 아직 실행하지 않은 RUN 파일을 실행해
            주세요.
          </>
        ) : (
          <>서버에서 못 읽은 자료가 있습니다 — 이 화면의 일부가 비어 보일 수 있습니다. 관리자에게 알려 주세요.</>
        )}
        {/*  **무엇이** 없는지 그대로 적습니다. 이름을 안 대면 대표님이
            SQL 을 다 돌리고도 무엇이 남았는지 알 수 없습니다. */}
        {missing.length > 0 && (
          <span data-schema-missing className="ml-1 font-medium text-amber-50">
            지금 빠져 있는 것 — {missing.join(' · ')}.
          </span>
        )}
        <span className="ml-1 font-medium text-amber-50">
          그 전까지는 새 기능이 저장되지 않거나 빈 값으로 보일 수 있습니다.
        </span>
      </p>
    </div>
  )
}
