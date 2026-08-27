import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/**
 * 로그인하지 않았으면 관리 화면을 그리지 않는다.
 *
 * 서버가 어차피 401/403을 주지만, 그 전에 화면이 먼저 뜨면 빈 표가 잠깐
 * 보이고 관리자는 데이터가 없다고 읽는다.
 */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'restoring') {
    return (
      <p className="status status-loading" role="status">
        세션을 확인하는 중…
      </p>
    )
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
