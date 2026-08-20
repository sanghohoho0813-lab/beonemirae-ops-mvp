import { useEffect, useState } from 'react'
import { schemaVersion } from './repo'

// ─────────────────────────────────────────────────────────────────────────────
// 서버 판(schema) 번호를 한 번만 물어보고 나눠 씁니다
//
//  ⚠ 왜 필요한가 — 「눌리는데 안 되는 단추」를 막기 위해서입니다.
//
//   기능 하나가 **화면과 서버 양쪽**을 고쳐야 완성되는 경우가 있습니다.
//   앱은 배포하면 바로 바뀌지만, DB 는 대표님이 SQL 을 실행하셔야 바뀝니다.
//   그 사이에 화면만 앞서 나가면 기사님은 눌러도 거절당하는 단추를 봅니다.
//
//   그래서 **서버가 실제로 그 판인지** 물어보고, 아니면 그 단추를 아예
//   안 그립니다. 판이 올라가면 저절로 나타납니다.
//
//  ⚠ 못 물어봤을 때(null)는 **없는 것으로 봅니다.** 있는 것으로 치면
//    통신이 잠깐 끊긴 순간에 안 되는 단추가 뜹니다.
// ─────────────────────────────────────────────────────────────────────────────

let cached: Promise<number | null> | null = null

/** 서버 판 번호 (한 번만 물어봅니다) */
export function serverSchemaVersion(): Promise<number | null> {
  if (!cached) cached = schemaVersion()
  return cached
}

/** 로그아웃·환경 전환에서 다시 묻게 합니다 */
export function resetSchemaCache(): void {
  cached = null
}

/**
 * 서버 판이 `min` 이상인가.
 *  · 아직 안 물어봤으면 `null` — 「모름」입니다. 화면은 이때 단추를 안 그립니다.
 */
export function useSchemaAtLeast(min: number): boolean | null {
  const [v, setV] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void serverSchemaVersion().then((n) => alive && setV(n))
    return () => {
      alive = false
    }
  }, [])
  if (v === undefined) return null
  if (v == null) return false
  return v >= min
}
