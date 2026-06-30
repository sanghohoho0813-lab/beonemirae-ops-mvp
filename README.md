# ㈜비원미래 의료폐기물 수거·운반 통합 운영관리 MVP

> **거래처 49곳, 차량 5대, 월평균 수거량 105톤 규모의 현장 데이터를 기반으로 설계된 내부 운영관리 시제품**

대표자가 사무실에 가지 않아도 휴대폰으로 **오늘 수거일정, 수거 완료 여부, 자재공급, 월 수거량, 미수금 현황**을 한눈에 확인할 수 있는 내부 운영관리 웹앱입니다.

이 버전은 **프론트엔드 + localStorage** 기반의 **시연용 MVP**로, 로그인·지도·결제·DB 연동 없이 즉시 실행됩니다. 입력 데이터는 사용하는 기기에 저장되며(기기 간 자동 동기화 없음), 추후 Supabase 로 손쉽게 이전할 수 있도록 데이터 구조와 접근 계층을 분리했습니다.

모바일 대표자 시연을 위해 **글자 크기 3단계 조절**, **핵심 5개 + 더보기 하단 메뉴**, **PWA 홈화면 설치**, **데이터 JSON 백업/복원** 기능을 제공합니다.

---

## 기술 스택

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS** (신뢰감 있는 네이비 / 청록 / 화이트 계열, 모바일 우선 카드형 UI)
- **React Router** (클라이언트 라우팅)
- **framer-motion** (페이지 전환·카드 stagger·터치 피드백·바텀시트 모션)
- **localStorage** 기반 임시 데이터 저장 (새로고침해도 유지)
- **PWA** (홈화면 설치형, `manifest.webmanifest`, standalone)
- **Vercel** 배포 가능 구조 (`vercel.json` 포함, SPA 리라이트 설정)

---

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 개발 서버 실행 (기본 http://localhost:5173)
npm run dev

# 3. 프로덕션 빌드
npm run build

# 4. 빌드 결과 미리보기
npm run preview
```

> 최초 실행 시 초기 샘플 데이터가 자동으로 생성되어 localStorage 에 저장됩니다.
> 추가/수정/삭제/완료 처리한 내용은 새로고침해도 유지됩니다.
> 데이터를 초기 상태로 되돌리거나 JSON 으로 백업/복원하려면 **더보기** 메뉴를 사용하세요.

---

## 주요 기능

### 핵심 메뉴 7종

| 메뉴 | 설명 |
| --- | --- |
| **대시보드** | 오늘 수거 예정/완료/긴급·지연 건수, 이번 달 의료폐기물·일회용기저귀·총 수거량, 미수금 합계, 자재 추가요청 건수, 차량별 오늘 일정 요약 — "대표님이 휴대폰으로 한눈에 보는 화면" |
| **오늘 일정** | 날짜별 수거 일정 리스트(카드형), 의료폐기물/일회용기저귀 뱃지, 예정·완료·지연·긴급 상태(긴급 강조), 수거 완료 처리 및 수거량 입력 |
| **거래처 관리** | 거래처 목록, 유형별 필터·검색, 수거 항목 표시, 추가/수정/삭제, 상세 보기 |
| **수거 입력** | 현장 담당자용 단순 입력 화면 — 거래처·폐기물 구분·실제 수거량·완료 시간·메모 저장 |
| **자재 관리** | 거래처별 자재공급 내역, 박스·비닐·합성수지 바늘통 수량 입력, 추가요청 표시 및 통계 |
| **미수금 관리** | 거래처별 청구금액·입금상태·결제방식, 미수금 합계, 입금완료 처리, 상태/청구월 필터 |
| **통계** | 월별 수거량, 의료폐기물/일회용기저귀 비중, 거래처 유형별 개수, 차량별 수거 실적, 자재 추가공급 건수 |

### 모바일 시연 편의 기능 (토스 스타일 UI/UX)

- **고급스러운 토스풍 디자인** — 아주 밝은 블루그레이 배경, 테두리 대신 여백·은은한 그림자로 구분하는 `rounded-3xl` 카드, 시원한 핵심 숫자, pill 형태 상태 뱃지.
- **부드러운 모션 (framer-motion)** — 페이지 전환 fade+y, 카드 stagger 등장, 버튼/카드 터치 시 `active:scale` 피드백, 하단 메뉴 active 인디케이터(`layoutId`) 슬라이드. 150~250ms 의 짧고 고급스러운 전환.
- **메뉴 이동 시 스크롤 상단 초기화** — `ScrollToTop` 컴포넌트로 경로 변경(하단 메뉴·링크·뒤로가기) 시 항상 새 화면을 맨 위에서 시작.
- **글자 크기 3단계** — 기본 / 크게(+20%) / 매우 크게(+40%). 모바일 기본값은 **크게**. 선택값은 기기에 저장되어 새로고침해도 유지됩니다. (**더보기 → 글자 크기**에서 변경)
- **하단 메뉴** — 모바일은 핵심 4개(대시보드·오늘 일정·거래처·수거 입력) + **더보기**(바텀시트)로 구성. 선택 메뉴는 청록 배경 pill 로 강조, 터치 영역 ≥56px, `safe-area-inset-bottom` 반영. 더보기는 아래에서 부드럽게 올라오는 **바텀시트**(자재/미수금/통계/백업·복원/글자 크기/초기화).
- **대시보드 요약 카드** — "오늘 먼저 확인할 것"(긴급·지연·입금 확인 필요)을 네이비 하이라이트 카드로 최상단 노출.
- **수거 입력 토스트** — 저장 시 하단 토스트 + "오늘 일정 보기" 바로가기.
- **PWA 설치** — 모바일 브라우저의 "홈 화면에 추가"로 앱처럼 standalone 실행됩니다.
- **데이터 백업/복원** — 더보기에서 전체 데이터 JSON 내보내기 / 가져오기 / 샘플 초기화.

#### 홈 화면에 추가 (PWA 설치)

- **iPhone (Safari)** — 공유 버튼 → **홈 화면에 추가** → 추가. 홈 화면 아이콘으로 실행하면 주소창 없이 앱처럼 열립니다.
- **Android (Chrome)** — 우측 상단 ⋮ → **앱 설치** 또는 **홈 화면에 추가**.
- 설치 후 standalone 모드(`display: standalone`)로 실행되며 상단 테마색은 네이비(`#0f1a2e`)로 표시됩니다.

### 샘플 데이터 규모

- 거래처 **49곳** — 병원 10 · 요양병원 14 · 의원·장례식장·요양원 20 · 치과 2 · 한의원·한방병원 3
- 차량 **5대** — 의료폐기물 1톤 2대 / 의료폐기물 3.5톤 1대 / 일회용기저귀 1톤 2대
- 월평균 수거량 — 의료폐기물 40톤 + 일회용기저귀 65톤 = **총 105톤**
- 자재 추가공급 월평균 **4~5회**

---

## 프로젝트 구조

```
public/
├── manifest.webmanifest  # PWA 매니페스트 (앱 이름·테마색·아이콘)
├── icon.svg              # PWA 아이콘 (네이비/청록 "비")
└── icon-maskable.svg     # PWA maskable 아이콘
src/
├── types/
│   └── index.ts          # 도메인 타입 (거래처·차량·수거일정·자재공급·결제) = 향후 DB 스키마
├── data/
│   └── seed.ts           # 초기 샘플 데이터 빌더
├── lib/
│   ├── storage.ts        # localStorage 영속화 계층 (load/save/reset/uid)
│   ├── backup.ts         # 데이터 JSON 백업/복원 (export/import)
│   ├── format.ts         # 날짜·원화·중량 표시 포맷
│   └── selectors.ts      # 집계(파생 데이터) 셀렉터
├── context/
│   ├── DataContext.tsx   # 전역 데이터 + CRUD (변경 시 자동 영속화)
│   └── SettingsContext.tsx  # UI 설정 (글자 크기 모드)
├── components/
│   ├── Layout.tsx        # 헤더 + 사이드/하단 네비(4개+더보기 바텀시트) + 페이지 전환
│   ├── motion.tsx        # 공용 모션 프리미티브 (PageMotion/Stagger/Tappable)
│   ├── ScrollToTop.tsx   # 경로 변경 시 스크롤 최상단 이동
│   ├── BottomSheet.tsx   # 아래에서 올라오는 바텀시트
│   ├── MoreMenu.tsx      # 더보기 콘텐츠 (바텀시트·/more 공용)
│   ├── Badge.tsx         # 상태·폐기물·결제 뱃지 (pill)
│   ├── StatCard.tsx      # 지표 카드 (md/lg 크기)
│   ├── FontSizeControl.tsx  # 글자 크기 선택 컨트롤
│   ├── InfoBanner.tsx    # 시연용 localStorage 안내 배너
│   ├── PageHeader.tsx    # 페이지 헤더
│   └── Modal.tsx         # 모바일 바텀시트형 모달 (모션)
└── pages/
    ├── Dashboard.tsx
    ├── TodaySchedule.tsx
    ├── Clients.tsx
    ├── CollectionInput.tsx
    ├── Materials.tsx
    ├── Receivables.tsx
    ├── Statistics.tsx
    └── More.tsx          # 더보기 (부가 메뉴·설정·백업·초기화)
```

### 데이터 모델

모든 도메인 타입은 [`src/types/index.ts`](src/types/index.ts) 에 정의되어 있으며, 각 인터페이스가 곧 Supabase 테이블 스키마가 되도록 설계했습니다.

- **Client (거래처)** — 거래처명, 유형, 주소, 담당자, 연락처, 수거주기, 의료폐기물/일회용기저귀 수거 여부, 자재 보관창고 크기, 특이사항
- **Vehicle (차량)** — 차량명, 폐기물 구분, 톤수, 명목 적재량, 실제 예상 적재량, 담당자
- **Schedule (수거일정)** — 날짜, 거래처, 폐기물 구분, 담당 차량, 예정 시간, 상태(예정·완료·지연·긴급), 예상/실제 수거량, 메모
- **MaterialSupply (자재공급)** — 날짜, 거래처, 박스·비닐·합성수지 바늘통 수량, 추가요청 여부, 메모
- **Payment (결제관리)** — 거래처, 청구월, 청구금액, 입금상태, 결제방식, 메모

---

## Vercel 배포 (자동배포)

이 프로젝트는 Vercel 자동배포에 맞춰 구성되어 있습니다. GitHub 저장소를 Vercel 프로젝트에 연결하면, **Production Branch 에 push 될 때마다 Vercel 이 자동으로 빌드·배포**합니다. (Pull Request 를 열면 Preview 배포도 자동 생성됩니다.)

### Vercel 프로젝트 설정값

| 항목 | 값 |
| --- | --- |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

> 위 값은 [`vercel.json`](vercel.json) 에도 명시되어 있어, 대부분 자동 인식됩니다.
> SPA 라우팅이 새로고침 시 깨지지 않도록 `rewrites` 로 모든 경로를 `/` (index.html) 로 보냅니다.
> `manifest.webmanifest`, `icon.svg` 등 정적 파일은 rewrite 보다 우선 제공되므로 PWA 도 정상 동작합니다.

### Production Branch 확인 / 자동배포 흐름

1. Vercel 프로젝트 → **Settings → Git → Production Branch** 에서 어떤 브랜치가 운영 배포 대상인지 확인합니다.
2. **Production Branch 가 `main` 인 경우** — 작업 브랜치를 `main` 에 merge 해야 실제(Production) 배포가 일어납니다. (작업 브랜치 push 자체는 Preview 배포만 생성)
3. **Production Branch 가 현재 작업 브랜치인 경우** — 해당 브랜치에 push 만 해도 바로 Production 배포됩니다.

---

## 향후 Supabase 연동 계획

데이터 접근이 [`src/lib/storage.ts`](src/lib/storage.ts) 와 [`src/context/DataContext.tsx`](src/context/DataContext.tsx) 두 곳에 집중되어 있어, 이전이 단순합니다.

1. **테이블 생성** — `src/types/index.ts` 의 인터페이스를 그대로 테이블로 매핑
   (`clients`, `vehicles`, `schedules`, `materials`, `payments`). 현재 string `id` 는 `uuid` 로 사용.
2. **데이터 계층 교체** — `loadData()` / `saveData()` 를 Supabase 쿼리(`supabase.from(...).select()/insert()/update()`)로 치환.
   `DataContext` 의 CRUD 핸들러를 비동기로 전환.
3. **인증 추가** — Supabase Auth 로 대표자·현장 담당자 로그인 및 권한(Role) 분리.
4. **실시간 동기화** — `supabase.channel()` 구독으로 현장 담당자 입력이 대표자 화면에 실시간 반영.
5. **확장** — 지도 API(차량 동선·경로 최적화), 결제 연동(자동 청구·입금 대사), 파일 첨부(인계서·사진) 단계적 추가.

---

## 향후 기능 확장 계획

- **로그인 / 인증** — 대표자·관리자·현장 기사 계정 (Supabase Auth)
- **권한 관리(Role)** — 역할별 화면·기능 접근 제어
- **실시간 DB** — Supabase 로 PC·모바일 간 데이터 실시간 공유·동기화
- **기사 모바일 입력** — 현장 기사 전용 수거 입력·인계 앱 흐름
- **병원 고객용 포털** — 거래처(병원)가 자사 수거·청구 내역을 직접 조회
- **수거대장 PDF 출력** — 법정 수거대장·정산 내역 PDF 자동 생성·다운로드

---

## 개선 이력

- **1차** — Vite+React+TS+Tailwind 기반 7개 핵심 화면, 49거래처·5차량·105톤 샘플, localStorage 영속화.
- **2차** — 글자 크기 3단계, 핵심 5개+더보기 하단 메뉴, PWA, 데이터 JSON 백업/복원, 시연 안내.
- **3차 (토스 스타일 UI/UX)**
  - 토스풍 디자인 톤 정리(밝은 배경·둥근 카드·여백·시원한 숫자·pill 뱃지)
  - 모바일 가독성 개선 및 글자 크기 모드와의 레이아웃 호환 재점검
  - 하단 메뉴 고급화(active pill 인디케이터) + **더보기 바텀시트**
  - **페이지 이동 시 스크롤 상단 초기화**(`ScrollToTop`)
  - framer-motion 모션(페이지 전환·카드 stagger·터치 피드백)
  - 대시보드 "오늘 먼저 확인할 것" 요약 카드, 수거 입력 저장 토스트
  - PWA 강화 및 README 보강, Vercel 자동배포 흐름 정리

---

> 회사명 표기는 **㈜비원미래** 또는 **beonemirae** 만 사용합니다.
