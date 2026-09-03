import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { login as loginApi, logout as logoutApi } from '../api/auth'
import { onSessionExpired, refreshSession } from '../api/http'
import type { AdminUser } from '../api/types'
import {
  clearSession,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './session'

const ADMIN_USER_KEY = 'babplanner.admin.user'

/** 관리자가 아닌 계정으로 로그인했을 때. */
export class NotAnAdminError extends Error {
  constructor() {
    super('관리자 권한이 없는 계정입니다.')
    this.name = 'NotAnAdminError'
  }
}

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: AuthStatus
  user: AdminUser | null
  login: (phone: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * 새로고침 뒤 화면에 이름을 다시 띄우기 위해 보관한다.
 *
 * 이 값은 권한의 근거가 아니다. 실제 판단은 서버가 하고, 여기 저장된 것은
 * 토큰이 아니라 표시용 정보다. 고쳐 넣어도 API가 403을 줄 뿐이다.
 */
function readStoredUser(): AdminUser | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_USER_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

function storeUser(user: AdminUser | null): void {
  try {
    if (user === null) {
      sessionStorage.removeItem(ADMIN_USER_KEY)
      return
    }
    sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user))
  } catch {
    // 저장하지 못해도 이번 화면은 메모리 상태로 동작한다.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>('restoring')
  const [user, setUser] = useState<AdminUser | null>(null)
  const restored = useRef(false)

  const forget = useCallback(() => {
    clearSession()
    storeUser(null)
    setUser(null)
    setStatus('anonymous')
    // 캐시에 남은 응답은 이전 세션의 것이다. 로그아웃에서만 전부 비운다.
    queryClient.clear()
  }, [queryClient])

  useEffect(() => onSessionExpired(forget), [forget])

  // 새로고침하면 accessToken은 사라진다. refreshToken이 있으면 세션을 되살린다.
  useEffect(() => {
    if (restored.current) return
    restored.current = true

    const stored = readStoredUser()
    if (!getRefreshToken() || !stored) {
      forget()
      return
    }

    // 취소 플래그를 두지 않는다.
    //
    // restored ref가 이미 요청을 한 번으로 묶는다. 여기에 cleanup 취소를
    // 더하면 StrictMode에서 상태가 영영 restoring에 머문다. 개발 모드는
    // effect를 mount → cleanup → mount 로 두 번 돌리는데, 두 번째 실행은
    // ref에 막혀 아무것도 하지 않고, 첫 번째가 띄운 요청의 결과는 cleanup이
    // 세운 플래그 때문에 버려진다. 그러면 새로고침한 화면이 "세션을 확인하는
    // 중"에서 멈춘다.
    refreshSession().then((ok) => {
      if (!ok) {
        forget()
        return
      }
      setUser(stored)
      setStatus('authenticated')
    })
  }, [forget])

  const login = useCallback(
    async (phone: string, password: string) => {
      const data = await loginApi(phone, password)
      if (data.user.role !== 'ADMIN') {
        // 여기서 막는 것은 화면 편의다. 진짜 방어는 서버의 403이다. 다만
        // 토큰을 들고 있을 이유가 없으므로 바로 버린다.
        clearSession()
        throw new NotAnAdminError()
      }
      setAccessToken(data.accessToken)
      setRefreshToken(data.refreshToken)
      storeUser(data.user)
      setUser(data.user)
      setStatus('authenticated')
    },
    [],
  )

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    // 서버 정리는 최선을 다하는 정도다. 실패해도 이쪽은 지운다.
    await logoutApi(refreshToken)
    forget()
  }, [forget])

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider 안에서만 쓸 수 있습니다.')
  return context
}
