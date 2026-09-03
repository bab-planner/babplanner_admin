import { NavLink, Outlet } from 'react-router-dom'
import { ChartColumnBig, Megaphone, MessageSquareMore, Utensils } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { SiteSelect } from '../components/SiteSelect'

/**
 * 사이드바 항목. Figma 관리자 웹(147:4524) 사이드바를 따른다.
 *
 * Figma에 있는 "회원 관리"와 "리워드 관리"는 두지 않았다. 백엔드에 해당
 * 관리자 API가 없다. 없는 기능을 메뉴에 두면 관리자는 그것이 준비 중이라고
 * 생각한다. 예약과 픽업은 Figma에도 서버에도 없다.
 *
 * 혼잡도·잔반·예상 식수·발주·만족도는 Figma처럼 대시보드 안 분석 섹션으로
 * 들어간다. 라우트와 조회 코드는 그대로 두어 주소로는 열 수 있다.
 */
const NAV_ITEMS = [
  { to: '/', label: '대시보드', icon: ChartColumnBig, end: true },
  { to: '/menus', label: '메뉴 관리', icon: Utensils },
  { to: '/notices', label: '공지사항 관리', icon: Megaphone },
  { to: '/inquiries', label: '문의/건의 관리', icon: MessageSquareMore },
] as const

/**
 * 헤더에 붙는 소속.
 *
 * 서버가 주는 값이 아니다. 로그인 응답에는 이름·전화·학번·권한만 있고 소속이
 * 없다. 데모 단계에서 Figma 헤더 구성을 맞추기 위한 상수이며, 실제 소속을
 * 다루게 되면 서버에서 받아야 한다.
 */
const AFFILIATION = '호서대학교 영양사'

export function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">호서 : 밥플래너</div>

        <nav className="sidebar-nav" aria-label="관리 메뉴">
          <ul>
            {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={'end' in rest ? rest.end : false}
                  className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
                >
                  <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <button type="button" className="sidebar-logout" onClick={() => void logout()}>
          로그아웃
        </button>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <SiteSelect />

          <div className="topbar-user">
            <span className="topbar-affiliation">{AFFILIATION}</span>
            {user ? <span className="topbar-name">{user.name}</span> : null}
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
