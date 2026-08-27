import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { SiteProvider } from '../components/SiteProvider'
import type { AdminUser } from '../api/types'

/** 테스트 전용 가짜 토큰. 실제 서비스 토큰이 아니다. */
export const TEST_ACCESS_TOKEN = 'test-access-token'
export const TEST_REFRESH_TOKEN = 'test-refresh-token'
export const ROTATED_REFRESH_TOKEN = 'test-refresh-token-2'

export const ADMIN: AdminUser = {
  id: 1,
  name: '관리자',
  phone: '01000000000',
  studentId: '20200001',
  role: 'ADMIN',
}

export const NORMAL_USER: AdminUser = { ...ADMIN, id: 2, name: '학생', role: 'USER' }

export function envelope(data: unknown) {
  return { success: true, data, error: null }
}

export function errorEnvelope(code: string, message: string) {
  return { success: false, data: null, error: { code, message } }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function emptyResponse(status = 204): Response {
  return new Response(null, { status })
}

/** 요청 하나. 테스트가 무엇이 나갔는지 확인할 때 쓴다. */
export interface Recorded {
  url: string
  method: string
  headers: Headers
  body: unknown
}

export interface FetchMock {
  calls: Recorded[]
  /** 경로에 걸린 응답을 정한다. 함수를 주면 호출 순서대로 다르게 답할 수 있다. */
  on: (
    pattern: string,
    responder: Response | ((call: Recorded, index: number) => Response | Promise<Response>),
  ) => void
  countOf: (pattern: string) => number
}

/**
 * fetch를 가로챈다.
 *
 * 실제 네트워크를 쓰지 않는다. 이 환경은 소켓 생성 자체가 간헐적으로
 * 실패해서, 테스트가 관계없는 이유로 무너지게 두지 않는다.
 */
export function mockFetch(): FetchMock {
  const calls: Recorded[] = []
  const handlers: {
    pattern: string
    responder: Response | ((call: Recorded, index: number) => Response | Promise<Response>)
  }[] = []
  const perPattern = new Map<string, number>()

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const call: Recorded = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }
    calls.push(call)

    // 나중에 등록한 것이 이긴다. 기본 응답을 깔고 특정 경우만 덮어쓸 수 있다.
    for (let index = handlers.length - 1; index >= 0; index -= 1) {
      const handler = handlers[index]!
      if (!url.includes(handler.pattern)) continue
      const seen = perPattern.get(handler.pattern) ?? 0
      perPattern.set(handler.pattern, seen + 1)
      return typeof handler.responder === 'function'
        ? handler.responder(call, seen)
        : handler.responder.clone()
    }

    throw new Error(`준비되지 않은 요청입니다: ${call.method} ${url}`)
  })

  return {
    calls,
    on: (pattern, responder) => handlers.push({ pattern, responder }),
    countOf: (pattern) => calls.filter((call) => call.url.includes(pattern)).length,
  }
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * 화면을 띄운다.
 *
 * 화면 하나만 보는 테스트는 AuthProvider를 끼우지 않는다. 세션이 없으면
 * AuthProvider가 캐시를 통째로 비우기 때문에, 인증과 무관한 화면을 확인하려
 * 할 때 조회 결과가 사라진다.
 */
export function renderWithProviders(
  ui: ReactNode,
  {
    route = '/',
    withSites = true,
    withAuth = false,
  }: { route?: string; withSites?: boolean; withAuth?: boolean } = {},
) {
  const queryClient = createTestQueryClient()
  const inner = withSites ? <SiteProvider>{ui}</SiteProvider> : ui
  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {withAuth ? <AuthProvider>{inner}</AuthProvider> : inner}
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { queryClient, ...render(tree) }
}

/** 세션이 살아 있는 상태를 만든다. */
export function seedSession(): void {
  sessionStorage.setItem('babplanner.admin.refreshToken', TEST_REFRESH_TOKEN)
  sessionStorage.setItem('babplanner.admin.user', JSON.stringify(ADMIN))
}
