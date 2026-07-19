const sections = [
  {
    id: 'hero',
    title: '의료폐기물 운송을 운영 기준까지 관리합니다',
    image: '/company-redesign/01-hero.png',
  },
  {
    id: 'operations',
    title: '수거만 맡기는 것이 아니라, 운영 부담까지 줄입니다',
    image: '/company-redesign/02-operations.png',
  },
  {
    id: 'services',
    title: '기관 유형과 폐기물 종류에 따라 수거 기준을 나눕니다',
    image: '/company-redesign/03-services.png',
  },
  {
    id: 'coverage',
    title: '서울·경기권 수거망을 한눈에 관리합니다',
    image: '/company-redesign/04-coverage.png',
  },
  {
    id: 'workflow',
    title: '보관기한부터 수거대장까지 현장에서 확인합니다',
    image: '/company-redesign/05-workflow.png',
  },
  {
    id: 'development',
    title: '운영관리 시스템을 현장 기준에 맞춰 고도화하고 있습니다',
    image: '/company-redesign/06-development.png',
  },
  {
    id: 'contact',
    title: '기관의 배출 조건을 알려주시면 수거 기준을 정리해드립니다',
    image: '/company-redesign/07-contact.png',
  },
  {
    id: 'footer',
    title: '의료폐기물·기저귀 수거 기준, 지금 정리하세요',
    image: '/company-redesign/08-footer.png',
  },
]

export function CompanyHomePage() {
  return (
    <main className="min-h-screen bg-[#f7fafc] text-[#101826]">
      <h1 className="sr-only">주식회사 비원미래 회사소개</h1>
      <div className="mx-auto w-full max-w-[1920px] bg-white">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-label={`${index + 1}번 섹션: ${section.title}`}
            className="w-full"
          >
            <img
              src={section.image}
              alt={section.title}
              className="block h-auto w-full"
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding={index === 0 ? 'sync' : 'async'}
            />
          </section>
        ))}
      </div>
    </main>
  )
}
