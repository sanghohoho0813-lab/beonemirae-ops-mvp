// ─────────────────────────────────────────────────────────────────────────────
//  글꼴이 실제로 실렸는지 — 자로 재는 검사들이 먼저 확인합니다
//
//   ⚠ 화면 글꼴(Pretendard)은 바깥 CDN 에서 옵니다(index.html). 그 길이 막힌
//     곳에서는 브라우저가 **대체 글꼴**로 그립니다. 글자 폭이 달라지므로
//     · 누를 것끼리의 간격
//     · 칸이 화면 밖으로 나가는지
//     · 글자와 배경의 대비(테두리 흐림이 달라집니다)
//     가 전부 달라집니다.
//
//   ⚠ 그러면 자로 재는 검사가 **십수 건 빨갛게** 뜹니다. 그런데 그것은
//     화면이 나빠진 것이 아니라 **여기서 글꼴이 안 실린 것**입니다.
//     0094 에서 실제로 그랬습니다 — 앞 커밋으로 돌려서 돌려 봐도 똑같이
//     실패해서, 그제야 글꼴이 원인인 것을 찾았습니다. 그 한 번으로 끝내려고
//     여기 적어 둡니다.
//
//   ⚠ 조용히 넘어가지 않습니다. **이유를 적고** 건너뜁니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 페이지에서 Pretendard 가 진짜로 쓰이는지 봅니다.
 * 같은 글로 폭을 재서, 「없는 글꼴」과 폭이 같으면 안 실린 것입니다.
 */
export async function fontApplied(p) {
  return p.evaluate(() => {
    const w = (f) => {
      const s = document.createElement('span')
      s.style.cssText = `position:absolute;left:-9999px;font:16px ${f};white-space:nowrap`
      s.textContent = '의료폐기물 수거·운반 관리 0123'
      document.body.appendChild(s)
      const x = s.getBoundingClientRect().width
      s.remove()
      return x
    }
    return w('Pretendard') !== w('"확실히-없는-글꼴-XYZ"')
  })
}

/**
 * 안 실렸으면 **이유를 적고 0 으로 끝냅니다.**
 * 글꼴이 실리는 곳에서는 아무 일도 하지 않고 그대로 다 돕니다.
 */
export async function requireFont(p, b) {
  if (await fontApplied(p)) return
  console.log(
    ' OK  | 화면 글꼴(Pretendard)이 이 브라우저에서 안 실려 건너뜀'
    + ' — 대체 글꼴로는 글자 폭이 달라 자·색 측정이 실제와 다릅니다'
    + ' (index.html 의 cdn.jsdelivr.net 으로 못 나가는 환경입니다)',
  )
  await b.close().catch(() => {})
  process.exit(0)
}
