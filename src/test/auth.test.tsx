import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../app/router'
import { request, refreshSession } from '../api/http'
import { getAccessToken, setAccessToken, setRefreshToken } from '../auth/session'
import {
  ADMIN,
  NORMAL_USER,
  ROTATED_REFRESH_TOKEN,
  TEST_ACCESS_TOKEN,
  TEST_REFRESH_TOKEN,
  emptyResponse,
  envelope,
  errorEnvelope,
  jsonResponse,
  mockFetch,
  renderWithProviders,
  seedSession,
} from './helpers'

/** 사이트 목록은 로그인 뒤 레이아웃이 항상 부른다. */
function stubSites(fetchMock: ReturnType<typeof mockFetch>) {
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope([{ id: 1, name: '학생식당' }])))
  fetchMock.on('/api/v1/admin/dashboard', jsonResponse(envelope({
    currentCongestion: null,
    wasteSummary: { totalSubmissions: 0, averageWasteRate: null, repeatedWasteMenuCount: null },
  })))
}

describe('관리자 로그인', () => {
  it('관리자 계정으로 로그인하면 관리 화면이 열린다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    fetchMock.on(
      '/api/v1/auth/login',
      jsonResponse(
        envelope({
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
          user: ADMIN,
        }),
      ),
    )

    renderWithProviders(<AppRoutes />, { route: '/login', withSites: false, withAuth: true })

    await userEvent.type(await screen.findByLabelText('휴대폰 번호'), '01000000000')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '대시보드', level: 1 })).toBeInTheDocument()
  })

  it('휴대폰 번호와 비밀번호로 요청한다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    fetchMock.on(
      '/api/v1/auth/login',
      jsonResponse(
        envelope({ accessToken: 'a', refreshToken: 'r', user: ADMIN }),
      ),
    )

    renderWithProviders(<AppRoutes />, { route: '/login', withSites: false, withAuth: true })
    await userEvent.type(await screen.findByLabelText('휴대폰 번호'), '01055556666')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => {
      const login = fetchMock.calls.find((call) => call.url.includes('/auth/login'))
      expect(login?.body).toEqual({ phone: '01055556666', password: 'secret' })
    })
    // 이메일 로그인 화면이 아니다.
    expect(screen.queryByLabelText(/이메일/)).not.toBeInTheDocument()
  })

  it('관리자가 아닌 계정은 들어올 수 없다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    fetchMock.on(
      '/api/v1/auth/login',
      jsonResponse(
        envelope({
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
          user: NORMAL_USER,
        }),
      ),
    )

    renderWithProviders(<AppRoutes />, { route: '/login', withSites: false, withAuth: true })
    await userEvent.type(await screen.findByLabelText('휴대폰 번호'), '01011112222')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 권한이 없는 계정입니다.')
    // 토큰을 들고 있을 이유가 없다.
    expect(getAccessToken()).toBeNull()
    expect(sessionStorage.getItem('babplanner.admin.refreshToken')).toBeNull()
  })
})

describe('토큰 보관', () => {
  it('access token은 메모리에만 둔다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    fetchMock.on(
      '/api/v1/auth/login',
      jsonResponse(
        envelope({
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
          user: ADMIN,
        }),
      ),
    )

    renderWithProviders(<AppRoutes />, { route: '/login', withSites: false, withAuth: true })
    await userEvent.type(await screen.findByLabelText('휴대폰 번호'), '01000000000')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => expect(getAccessToken()).toBe(TEST_ACCESS_TOKEN))
    expect(JSON.stringify(sessionStorage)).not.toContain(TEST_ACCESS_TOKEN)
    expect(JSON.stringify(localStorage)).not.toContain(TEST_ACCESS_TOKEN)
  })

  it('refresh token은 sessionStorage에 둔다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    fetchMock.on(
      '/api/v1/auth/login',
      jsonResponse(
        envelope({
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
          user: ADMIN,
        }),
      ),
    )

    renderWithProviders(<AppRoutes />, { route: '/login', withSites: false, withAuth: true })
    await userEvent.type(await screen.findByLabelText('휴대폰 번호'), '01000000000')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() =>
      expect(sessionStorage.getItem('babplanner.admin.refreshToken')).toBe(TEST_REFRESH_TOKEN),
    )
  })

  it('어떤 토큰도 localStorage에 두지 않는다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    fetchMock.on(
      '/api/v1/auth/login',
      jsonResponse(
        envelope({
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
          user: ADMIN,
        }),
      ),
    )

    renderWithProviders(<AppRoutes />, { route: '/login', withSites: false, withAuth: true })
    await userEvent.type(await screen.findByLabelText('휴대폰 번호'), '01000000000')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => expect(getAccessToken()).toBe(TEST_ACCESS_TOKEN))
    // localStorage는 탭을 닫아도 남는다. JWT를 거기 두지 않는다.
    const stored = JSON.stringify(localStorage)
    expect(stored).not.toContain(TEST_ACCESS_TOKEN)
    expect(stored).not.toContain(TEST_REFRESH_TOKEN)
  })
})

describe('세션 복원', () => {
  it('새로고침하면 refresh token으로 세션을 되살린다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    seedSession()
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(
        envelope({ accessToken: 'restored-access', refreshToken: ROTATED_REFRESH_TOKEN }),
      ),
    )

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    expect(await screen.findByRole('heading', { name: '대시보드', level: 1 })).toBeInTheDocument()
    expect(getAccessToken()).toBe('restored-access')
  })

  it('StrictMode에서도 복원이 끝난다', async () => {
    // 개발 서버는 StrictMode로 돈다. effect가 두 번 돌 때 첫 요청의 결과를
    // 버리면 화면이 "세션을 확인하는 중"에서 멈춘다.
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    seedSession()
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(
        envelope({ accessToken: 'restored-access', refreshToken: ROTATED_REFRESH_TOKEN }),
      ),
    )

    renderWithProviders(<AppRoutes />, {
      route: '/',
      withSites: false,
      withAuth: true,
      strict: true,
    })

    expect(await screen.findByRole('heading', { name: '대시보드', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('세션을 확인하는 중…')).not.toBeInTheDocument()
    // 토큰이 회전하므로 갱신은 한 번만 나가야 한다.
    expect(fetchMock.countOf('/api/v1/auth/refresh')).toBe(1)
  })

  it('갱신이 준 새 refresh token으로 갈아 끼운다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    seedSession()
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(envelope({ accessToken: 'a2', refreshToken: ROTATED_REFRESH_TOKEN })),
    )

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    // 갈아 끼우지 않으면 다음 갱신이 실패한다.
    await waitFor(() =>
      expect(sessionStorage.getItem('babplanner.admin.refreshToken')).toBe(
        ROTATED_REFRESH_TOKEN,
      ),
    )
  })

  it('갱신이 거절되면 로그인 화면으로 보낸다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    seedSession()
    fetchMock.on('/api/v1/auth/refresh', jsonResponse(errorEnvelope('INVALID_REFRESH_TOKEN', 'x'), 401))

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(sessionStorage.getItem('babplanner.admin.refreshToken')).toBeNull()
  })
})

describe('401 갱신', () => {
  it('401이면 갱신하고 원 요청을 한 번 다시 보낸다', async () => {
    const fetchMock = mockFetch()
    setAccessToken('stale')
    setRefreshToken(TEST_REFRESH_TOKEN)

    fetchMock.on('/api/v1/admin/notices', (_call, index) =>
      index === 0
        ? jsonResponse(errorEnvelope('UNAUTHORIZED', 'x'), 401)
        : jsonResponse(envelope([])),
    )
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(envelope({ accessToken: 'fresh', refreshToken: ROTATED_REFRESH_TOKEN })),
    )

    await expect(request('/api/v1/admin/notices')).resolves.toEqual([])

    expect(fetchMock.countOf('/api/v1/admin/notices')).toBe(2)
    expect(fetchMock.countOf('/api/v1/auth/refresh')).toBe(1)
  })

  it('다시 보내는 것은 정확히 한 번뿐이다', async () => {
    const fetchMock = mockFetch()
    setAccessToken('stale')
    setRefreshToken(TEST_REFRESH_TOKEN)

    fetchMock.on('/api/v1/admin/notices', jsonResponse(errorEnvelope('UNAUTHORIZED', 'x'), 401))
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(envelope({ accessToken: 'fresh', refreshToken: ROTATED_REFRESH_TOKEN })),
    )

    await expect(request('/api/v1/admin/notices')).rejects.toThrow()

    // 계속 다시 보내면 실패가 반복될 때 요청이 쌓인다.
    expect(fetchMock.countOf('/api/v1/admin/notices')).toBe(2)
  })

  it('동시에 401이 나도 갱신은 한 번만 나간다', async () => {
    const fetchMock = mockFetch()
    setAccessToken('stale')
    setRefreshToken(TEST_REFRESH_TOKEN)

    const seenPerPath = new Map<string, number>()
    for (const path of ['/api/v1/admin/notices', '/api/v1/admin/surveys', '/api/v1/admin/sites']) {
      fetchMock.on(path, (call) => {
        const seen = seenPerPath.get(call.url) ?? 0
        seenPerPath.set(call.url, seen + 1)
        return seen === 0
          ? jsonResponse(errorEnvelope('UNAUTHORIZED', 'x'), 401)
          : jsonResponse(envelope([]))
      })
    }
    fetchMock.on('/api/v1/auth/refresh', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return jsonResponse(
        envelope({ accessToken: 'fresh', refreshToken: ROTATED_REFRESH_TOKEN }),
      )
    })

    await Promise.all([
      request('/api/v1/admin/notices'),
      request('/api/v1/admin/surveys'),
      request('/api/v1/admin/sites'),
    ])

    // 각자 갱신하면 회전된 토큰 때문에 먼저 도착한 것 말고는 전부 무효가
    // 되고 멀쩡한 세션이 끊긴다.
    expect(fetchMock.countOf('/api/v1/auth/refresh')).toBe(1)
  })
})

describe('403 처리', () => {
  it('403은 갱신하지 않는다', async () => {
    const fetchMock = mockFetch()
    setAccessToken(TEST_ACCESS_TOKEN)
    setRefreshToken(TEST_REFRESH_TOKEN)

    fetchMock.on('/api/v1/admin/menus', jsonResponse(errorEnvelope('FORBIDDEN', '접근 권한이 없습니다.'), 403))
    fetchMock.on('/api/v1/auth/refresh', jsonResponse(envelope({ accessToken: 'x', refreshToken: 'y' })))

    await expect(request('/api/v1/admin/menus')).rejects.toMatchObject({ status: 403 })

    // 인증은 멀쩡하고 권한이 없는 것이다. 갱신해도 결과가 같다.
    expect(fetchMock.countOf('/api/v1/auth/refresh')).toBe(0)
    expect(sessionStorage.getItem('babplanner.admin.refreshToken')).toBe(TEST_REFRESH_TOKEN)
  })
})

describe('로그아웃', () => {
  it('세션과 캐시를 모두 비우고 로그인으로 돌아간다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    seedSession()
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(envelope({ accessToken: 'a', refreshToken: ROTATED_REFRESH_TOKEN })),
    )
    fetchMock.on('/api/v1/auth/logout', emptyResponse())

    const { queryClient } = renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })
    await screen.findByRole('heading', { name: '대시보드', level: 1 })

    await userEvent.click(screen.getByRole('button', { name: /로그아웃/ }))

    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
    expect(sessionStorage.getItem('babplanner.admin.refreshToken')).toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('서버 로그아웃이 실패해도 이쪽 세션은 지운다', async () => {
    const fetchMock = mockFetch()
    stubSites(fetchMock)
    seedSession()
    fetchMock.on(
      '/api/v1/auth/refresh',
      jsonResponse(envelope({ accessToken: 'a', refreshToken: ROTATED_REFRESH_TOKEN })),
    )
    fetchMock.on('/api/v1/auth/logout', jsonResponse(errorEnvelope('INTERNAL_ERROR', 'x'), 500))

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })
    await screen.findByRole('heading', { name: '대시보드', level: 1 })
    await userEvent.click(screen.getByRole('button', { name: /로그아웃/ }))

    // 서버에 남은 세션은 만료되지만, 브라우저에 토큰을 남기는 쪽이 더 나쁘다.
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
  })
})

describe('경로 보호', () => {
  it('로그인하지 않으면 관리 화면을 그리지 않는다', async () => {
    mockFetch()

    renderWithProviders(<AppRoutes />, { route: '/menus', withSites: false, withAuth: true })

    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '관리 메뉴' })).not.toBeInTheDocument()
  })

  it('갱신할 것이 없으면 곧바로 로그인으로 보낸다', async () => {
    const fetchMock = mockFetch()

    renderWithProviders(<AppRoutes />, { route: '/', withSites: false, withAuth: true })

    await screen.findByRole('button', { name: '로그인' })
    expect(fetchMock.countOf('/api/v1/auth/refresh')).toBe(0)
  })
})

describe('갱신 함수', () => {
  it('refresh token이 없으면 시도하지 않는다', async () => {
    const fetchMock = mockFetch()
    setAccessToken(null)
    setRefreshToken(null)

    await expect(refreshSession()).resolves.toBe(false)
    expect(fetchMock.calls).toHaveLength(0)
  })

  it('네트워크가 끊겨도 예외로 터지지 않는다', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    setRefreshToken(TEST_REFRESH_TOKEN)

    await expect(refreshSession()).resolves.toBe(false)
  })
})
