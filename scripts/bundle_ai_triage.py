#!/usr/bin/env python3
"""ai-triage 서버 함수를 **파일 하나**로 합칩니다 — Supabase 대시보드 편집기에 붙여 넣는 용도.

  python3 scripts/bundle_ai_triage.py   →  docs/deploy/ai-triage-dashboard.ts

원본(supabase/functions/ai-triage/*.ts)을 고치면 다시 돌립니다. 내용은 원본 그대로이고,
같은 폴더 파일끼리의 import 줄만 뺍니다. Claude(anthropic.ts, npm SDK)는 빼고 Gemini · OpenAI 호환만 둡니다.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'supabase/functions/ai-triage'
OUT = ROOT / 'docs/deploy/ai-triage-dashboard.ts'
ORDER = ['provider.ts', 'triage.ts', 'gemini.ts', 'handler.ts', 'index.ts']
LOCAL_IMPORT = re.compile(r"^import [^\n]* from '\./[a-z]+\.ts'\n", re.M)

head = '''// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — Supabase 대시보드 편집기에 붙여 넣는 한 파일짜리 판 (자동 생성 · 손으로 고치지 않음)
//
//   만든 곳: scripts/bundle_ai_triage.py ← supabase/functions/ai-triage/*.ts (내용 그대로)
//   붙여 넣는 곳: Supabase 대시보드 › Edge Functions › ai-triage (이름이 꼭 ai-triage)
//   키: Edge Functions › Secrets 의 AI_API_KEY (AQ.… · AIza… 이면 Gemini)
//   ⚠ 이 판에는 Claude 연결(anthropic.ts)이 없습니다 — Gemini · OpenAI 호환 키만 됩니다.
// ═══════════════════════════════════════════════════════════════════════════

'''
parts = []
for name in ORDER:
    s = (SRC / name).read_text()
    s = LOCAL_IMPORT.sub('', s)
    if name == 'index.ts':
        a = "          ? claudeJson({ apiKey: key, baseURL: API_URL || undefined, model: MODEL, system, user, timeoutMs: MODEL_TIMEOUT_MS })\n"
        assert a in s, 'index.ts 의 Claude 줄이 바뀌었습니다 — 이 스크립트를 고쳐 주세요'
        s = s.replace(a, "          ? Promise.reject(new ProviderError('http', 'Claude 키는 대시보드 붙여넣기 판에서 쓰지 않습니다 — Gemini 키(AQ.… · AIza…)를 넣거나 CLI 로 배포해 주세요'))\n")
    assert './' not in ''.join(l for l in s.splitlines(True) if l.startswith('import ')), name
    parts.append(f'// ─── {name} ' + '─' * (70 - len(name)) + '\n' + s.strip('\n') + '\n')
body = '\n'.join(parts)
#  바깥 모듈 import 는 맨 위로 (읽기 쉽게)
ext = re.findall(r"^import [^\n]* from '(?:jsr|npm):[^']+'\n", body, re.M)
for line in ext:
    body = body.replace(line, '', 1)
OUT.write_text(head + ''.join(dict.fromkeys(ext)) + '\n' + body)
print(OUT.relative_to(ROOT), sum(1 for _ in OUT.open()), '줄')
