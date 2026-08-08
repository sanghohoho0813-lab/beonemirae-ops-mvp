# Vercel 운영 이관

개발·시연 중에는 우리 Vercel 계정에 배포해 두고,
고객사가 **정식 운영을 결정하면** 고객사 팀으로 넘깁니다.

> 이 문서에는 **환경변수 값을 적지 않습니다.** 어디에 무엇을 넣는지만 적습니다.

---

## 1. 넘기기 전 확인

- [ ] `03_LIVE_TEST_CHECKLIST.md` 전체 통과
- [ ] Supabase Organization 소유자가 **고객사 계정**인지 (STEP 1)
- [ ] 고객사에 청구 수단이 등록되어 있는지 (Vercel · Supabase)
- [ ] 운영 도메인이 정해졌는지
- [ ] 이관 후 우리 쪽 유지보수 범위가 합의되었는지

## 2. 고객사 Vercel Team 만들기

1. 고객사 담당자가 https://vercel.com 가입 (**고객사 명의**)
2. Team 생성 — Hobby 는 상업적 사용이 제한되므로 **Pro** 권장
3. Team → Members → **우리 개발자 계정 초대** (`Member` 또는 `Developer`)

## 3. 프로젝트 이전

Vercel 대시보드 → 프로젝트 → Settings → General → **Transfer Project**

1. 받을 Team 선택
2. 고객사 Team 관리자가 승인
3. 이전 후 확인:
   - [ ] Git 저장소 연결이 유지되는지
   - [ ] 배포 이력이 넘어왔는지
   - [ ] **환경변수가 넘어왔는지** (안 넘어오면 4번에서 다시 넣습니다)

> 이전 중에는 배포가 잠시 멈출 수 있습니다. 업무 시간 외에 하세요.

## 4. 환경변수

Settings → Environment Variables

| 변수 | 값 출처 | 환경 |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | 같은 화면 → **anon / public** | Production, Preview |

- **`service_role` 키는 넣지 않습니다.** 이 앱은 `anon` 키만으로 동작합니다.
  넣으면 번들에 포함되어 RLS 가 통째로 무력화됩니다.
- 변수는 빌드 시점에 들어갑니다 (`VITE_` 접두사). **바꾼 뒤 재배포해야 반영됩니다.**
- Preview 환경을 실제 운영 Supabase 에 연결할지는 고객사와 합의하세요.
  연습 입력이 운영 데이터에 섞일 수 있습니다. 별도 프로젝트를 권장합니다.

## 5. 도메인

Settings → Domains

1. 운영 도메인 추가 (예: `ops.<고객사>.co.kr`)
2. 안내대로 DNS 레코드 등록 (고객사 DNS 관리자)
3. SSL 자동 발급 확인
4. `www` → apex 리다이렉트 정리

## 6. 운영 배포

- Production Branch 확인 (보통 `main`)
- 배포 후 확인:
  - [ ] 운영 도메인으로 로그인 화면이 뜨는지
  - [ ] 「서버 연결이 설정되지 않았습니다」가 **안 뜨는지** (뜨면 환경변수 문제)
  - [ ] 실제 계정 로그인
  - [ ] 휴대폰에서 접속

## 7. Supabase 쪽 마무리

- Authentication → URL Configuration
  - **Site URL** 을 운영 도메인으로
  - **Redirect URLs** 에 운영 도메인 추가 (비밀번호 재설정 메일이 여기로 돌아옵니다)
- Free plan 이면 **Pro 전환 검토**
  - Free 는 7일 미사용 시 일시 정지 + 백업 보관 기간이 짧습니다
  - 실사용 시작 후에는 Pro 를 권장합니다

## 8. 권한 정리

| 대상 | Vercel | Supabase | GitHub |
|---|---|---|---|
| 고객사 관리자 | Owner | Owner | (선택) |
| 우리 개발자 | Member | Developer | Write |
| 우리 대표 | (선택) | (선택) | (선택) |

이관 후 **우리 개인 계정에만 있는 권한이 남지 않도록** 정리합니다.
담당자가 바뀌어도 고객사가 스스로 접근할 수 있어야 합니다.

## 9. 인수인계 문서

고객사에 전달:

- [ ] 운영 도메인 주소
- [ ] 계정 목록과 역할 (비밀번호는 별도 경로)
- [ ] `02_ROLE_MATRIX.md` — 누가 무엇을 할 수 있는지
- [ ] 장애 시 연락처와 대응 시간
- [ ] 백업 정책 (Supabase 자동 백업 주기)
- [ ] 계정 추가·삭제 방법 (Supabase 대시보드)

## 10. 이관 후 점검

| 시점 | 확인 |
|---|---|
| 당일 | 로그인 · 수거 입력 1건 · 감사로그 |
| 1주 | 실사용 건수, 오류 문의 |
| 1개월 | 성과 지표 축적 상태, Pro 전환 필요성 |

---

## 되돌리기

문제가 생기면 Transfer 를 반대 방향으로 다시 하면 됩니다.
데이터는 Supabase 에 있으므로 **Vercel 이전으로 유실되지 않습니다.**
도메인 DNS 만 원복하면 됩니다.
