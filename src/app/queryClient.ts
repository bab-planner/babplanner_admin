import { QueryClient } from '@tanstack/react-query'
import { SessionExpiredError } from '../api/http'

/**
 * 조회 기본값.
 *
 * 세션이 끊겨서 실패한 요청은 다시 보내지 않는다. 이미 갱신을 시도해 본
 * 뒤이고, 반복해 봐야 같은 결과에 로그인 이동만 늦어진다.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof SessionExpiredError) return false
          return failureCount < 1
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  })
}
