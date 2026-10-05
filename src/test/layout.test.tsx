import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../app/router'
import { SiteSelect } from '../components/SiteSelect'
import {
  ROTATED_REFRESH_TOKEN,
  envelope,
  errorEnvelope,
  jsonResponse,
  mockFetch,
  renderWithProviders,
  seedSession,
} from './helpers'

const SITES = [
  { id: 3, name: '학생식당' },
  { id: 7, name: '교직원식당' },
]

const EMPTY_DASHBOARD = {
  todayPredictedPeople: null,
  tomorrowPredictedPeople: null,
  currentCongestion: null,
  wasteSummary: { totalSubmissions: 0, averageWasteRate: null, repeatedWasteMenuCount: null },
  procurementPreview: [],
}

function bootstrap(fetchMock: ReturnType<typeof mockFetch>, sites = SITES) {
  seedSession()
  fetchMock.on(
    '/api/v1/auth/refresh',
    jsonResponse(envelope({ accessToken: 'a', refreshToken: ROTATED_REFRESH_TOKEN })),
  )
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope(sites)))
  fetchMock.on('/api/v1/admin/dashboard', jsonResponse(envelope(EMPTY_DASHBOARD)))
}

/**
 * 제품 소스만 모은다.
 *
 * 테스트 자신은 금지된 문자열을 단언 대상으로 들고 있으므로 제외한다.
 * 주석도 뗀다. 규칙을 설명하는 문장이 규칙 위반으로 잡히면 안 된다.
 */
function productionSources(dir = 'src'): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry).split('\\').join('/')
    if (statSync(path).isDirectory()) {
      if (path.endsWith('/test')) continue
      found.push(...productionSources(path))
      continue
    }
    if (!/\.(ts|tsx|css)$/.test(entry)) continue
    const text = readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trimStart()
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
      })
      .join('\n')
    found.push({ path, text })
  }
  return found
}

describe('급식소 선택', () => {
  it('서버가 준 급식소 목록을 보여 준다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    const select = await screen.findByLabelText('급식소')
    expect(select).toHaveDisplayValue('학생식당')
    expect(screen.getByRole('option', { name: '교직원식당' })).toBeInTheDocument()
  })

  it('선택한 급식소로 조회한다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })
    await userEvent.selectOptions(await screen.findByLabelText('급식소'), '7')

    await waitFor(() =>
      expect(
        fetchMock.calls.some((call) => call.url.includes('/api/v1/admin/dashboard?siteId=7')),
      ).toBe(true),
    )
    expect(localStorage.getItem('babplanner.admin.selectedSiteId')).toBe('7')
  })

  it('저장된 급식소가 사라졌으면 첫 급식소로 되돌린다', async () => {
    const fetchMock = mockFetch()
    // 없어진 식당을 계속 조회하면 화면이 통째로 422가 된다.
    localStorage.setItem('babplanner.admin.selectedSiteId', '999')
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    const select = await screen.findByLabelText('급식소')
    await waitFor(() => expect(select).toHaveDisplayValue('학생식당'))
    expect(localStorage.getItem('babplanner.admin.selectedSiteId')).toBe('3')
  })

  it('급식소가 하나도 없으면 그 사실을 알린다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock, [])

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    expect(await screen.findByText('등록된 급식소가 없습니다')).toBeInTheDocument()
    // 고를 수 있는 척하지 않는다.
    expect(screen.queryByLabelText('급식소')).not.toBeInTheDocument()
  })

  it('목록을 불러오지 못하면 오류로 알린다', async () => {
    const fetchMock = mockFetch()
    seedSession()
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(envelope({ accessToken: 'a', refreshToken: ROTATED_REFRESH_TOKEN })),
    )
    fetchMock.on('/api/v1/admin/sites', jsonResponse(errorEnvelope('INTERNAL_ERROR', 'x'), 500))
    fetchMock.on('/api/v1/admin/dashboard', jsonResponse(envelope(EMPTY_DASHBOARD)))

    renderWithProviders(<SiteSelect />, { withSites: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('급식소 목록을 불러오지 못했습니다.')
  })
})

describe('사이드바', () => {
  it('Figma 사이드바 항목만 둔다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    const nav = await screen.findByRole('navigation', { name: '관리 메뉴' })
    for (const label of ['대시보드', '메뉴 관리', '공지사항 관리', '문의/건의 관리', '잔반 인증 관리']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
  })

  it('백엔드에 관리자 API가 없는 메뉴는 두지 않는다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    // Figma 사이드바에는 있지만 서버에 해당 관리자 API가 없다. 메뉴에 두면
    // 관리자는 그것이 준비 중이라고 생각한다.
    const nav = await screen.findByRole('navigation', { name: '관리 메뉴' })
    for (const absent of ['회원 관리', '리워드 관리']) {
      expect(within(nav).queryByText(absent)).not.toBeInTheDocument()
    }
  })

  it('분석 화면은 메뉴에 두지 않지만 주소로는 열린다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)
    fetchMock.on('/api/v1/admin/waste/summary', jsonResponse(envelope(null)))
    fetchMock.on('/api/v1/admin/waste/by-menu', jsonResponse(envelope([])))

    // Figma는 이 내용을 대시보드 안에 둔다. 라우트를 지우지는 않는다.
    renderWithProviders(<AppRoutes />, {
      route: '/analytics/waste',
      withSites: false,
      withAuth: true,
    })

    const nav = await screen.findByRole('navigation', { name: '관리 메뉴' })
    expect(within(nav).queryByText('잔반 분석')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '잔반 분석' })).toBeInTheDocument()
  })

  it('예약과 픽업 메뉴는 없다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })
    await screen.findByRole('navigation', { name: '관리 메뉴' })

    // 서버에 그런 API가 없다. 메뉴에 두면 준비 중이라고 읽힌다.
    for (const absent of ['예약', '픽업', '재고']) {
      expect(screen.queryByText(new RegExp(absent))).not.toBeInTheDocument()
    }
  })

  it('접기 토글을 두지 않고 로그아웃을 사이드바에 둔다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })
    await screen.findByRole('navigation', { name: '관리 메뉴' })

    // Figma 관리자 웹에 접힌 사이드바 상태가 없다.
    expect(screen.queryByRole('button', { name: /메뉴 (접기|펼치기)/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })
})

describe('헤더', () => {
  it('소속과 로그인한 사람의 이름을 오른쪽에 둔다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    // 소속은 서버가 주지 않는다. 데모 단계 상수다.
    expect(await screen.findByText('호서대학교 영양사')).toBeInTheDocument()
    // 이름은 로그인 응답에서 온다.
    expect(screen.getByText('관리자')).toBeInTheDocument()
  })

  it('급식소 선택기를 헤더에 유지한다', async () => {
    const fetchMock = mockFetch()
    bootstrap(fetchMock)

    // Figma 헤더에는 없지만 여러 조회가 siteId를 필수로 받는다.
    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    expect(await screen.findByLabelText('급식소')).toBeInTheDocument()
  })
})

describe('소스 가드', () => {
  const sources = productionSources()

  it('내부 경로를 부르지 않는다', () => {
    // 브라우저에는 서비스 토큰이 없다. 있어도 설치본을 뜯으면 나온다.
    for (const { path, text } of sources) {
      expect(text, path).not.toContain('/internal/v1')
      expect(text, path).not.toContain('X-Service-Token')
    }
  })

  it('비밀 값 이름이 소스에 없다', () => {
    for (const { path, text } of sources) {
      for (const secret of [
        'AI_SERVICE_TOKEN',
        'BAPPLANNER_INTERNAL_SERVICE_TOKEN',
        'JWT_SIGNING_KEY',
        'DB_PASSWORD',
        'PHONE_VERIFICATION_HMAC_KEY',
      ]) {
        expect(text, `${path}: ${secret}`).not.toContain(secret)
      }
    }
  })

  it('API 주소를 코드에 박지 않는다', () => {
    // 주소는 환경변수와 개발 서버 프록시가 정한다.
    for (const { path, text } of sources) {
      expect(text, path).not.toContain('localhost:8080')
      expect(text, path).not.toContain('127.0.0.1:8080')
    }
  })

  it('예시 숫자를 화면에 박아 두지 않는다', () => {
    // 과거 초안에 있던 값이다. 데이터가 없을 때 이런 숫자가 뜨면 관리자는
    // 그걸 믿고 발주한다.
    for (const { path, text } of sources) {
      for (const sample of ['528', '370', '369L', '45인분']) {
        expect(text, `${path}: ${sample}`).not.toContain(sample)
      }
    }
  })

  it('예약과 픽업 기능이 소스에 없다', () => {
    for (const { path, text } of sources) {
      for (const feature of ['reservation', 'pickup', 'remainingServings']) {
        expect(text, `${path}: ${feature}`).not.toContain(feature)
      }
    }
  })

  it('환경 예시 파일에 비밀 값이 없다', () => {
    const example = readFileSync('.env.example', 'utf8')

    expect(example).toContain('VITE_API_BASE_URL')
    expect(example).toContain('VITE_DEV_API_TARGET')
    expect(example).not.toContain('TOKEN=')
    expect(example).not.toContain('PASSWORD=')
  })
})
