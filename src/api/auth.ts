import { request } from './http'
import type { AuthData } from './types'

/** 관리자 전용 로그인 API는 없다. 사용자와 같은 경로를 쓰고 역할로 가른다. */
export function login(phone: string, password: string): Promise<AuthData> {
  return request<AuthData>('/api/v1/auth/login', {
    method: 'POST',
    body: { phone, password },
    anonymous: true,
  })
}

/**
 * 로그아웃.
 *
 * 서버가 실패해도 이쪽 세션은 지운다. 서버에 남은 refresh 세션은 만료되지만,
 * 브라우저에 토큰을 남겨 두는 쪽이 더 나쁘다.
 */
export async function logout(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return
  try {
    await request<void>('/api/v1/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    })
  } catch {
    // 최선을 다한 뒤 넘어간다.
  }
}
