import { useEffect, useState } from 'react'
import { DatabaseZap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { EXPECTED_SCHEMA_VERSION, schemaVersion } from '../lib/repo'

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

  useEffect(() => {
    if (mode !== 'live' || role !== 'admin') return
    let alive = true
    void schemaVersion().then((v) => {
      if (alive) setVersion(v)
    })
    return () => {
      alive = false
    }
  }, [mode, role])

  //  아직 물어보는 중이거나, 버전이 맞으면 아무것도 그리지 않습니다.
  if (version === undefined) return null
  if (version != null && version >= EXPECTED_SCHEMA_VERSION) return null

  return (
    <div
      data-schema-bar
      className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-amber-500 px-4 py-3 text-white sm:px-6"
    >
      <DatabaseZap size={19} className="shrink-0" strokeWidth={2.6} />
      <p className="t-body min-w-0 flex-1 break-keep font-bold">
        DB 업데이트가 필요합니다 — 서버 {version == null ? '구버전' : `버전 ${version}`} · 앱은 버전{' '}
        {EXPECTED_SCHEMA_VERSION} 기준입니다. Supabase SQL Editor 에서 아직 실행하지 않은 RUN 파일을 실행해 주세요.
        <span className="ml-1 font-medium text-amber-50">
          그 전까지는 새 기능이 저장되지 않거나 빈 값으로 보일 수 있습니다.
        </span>
      </p>
    </div>
  )
}
