import type { AppData } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 데이터 백업/복원 유틸
// Supabase 연동 전까지 시연 데이터를 JSON 파일로 보존할 수 있게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** 현재 데이터를 JSON 파일로 내보냅니다. */
export function exportData(data: AppData): void {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const payload = JSON.stringify({ version: 1, exportedAt: now.toISOString(), data }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `beonemirae-ops-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 업로드된 JSON 파일을 검증 후 AppData 로 파싱합니다. */
export function parseImportFile(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        // { version, data } 래핑 형태와 순수 AppData 형태 모두 허용
        const data: AppData = parsed?.data ?? parsed
        if (
          data &&
          Array.isArray(data.clients) &&
          Array.isArray(data.vehicles) &&
          Array.isArray(data.schedules) &&
          Array.isArray(data.materials) &&
          Array.isArray(data.payments)
        ) {
          resolve(data)
        } else {
          reject(new Error('올바른 백업 파일 형식이 아닙니다.'))
        }
      } catch {
        reject(new Error('JSON 파싱에 실패했습니다.'))
      }
    }
    reader.readAsText(file)
  })
}
