import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  MessageSquare,
  ShoppingCart,
  Trash2,
  UsersRound,
  Utensils,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { SiteSelect } from '../components/SiteSelect'

/**
 * 사이드바 항목.
 *
 * 예약과 픽업은 없다. 초안 화면설계서에 남아 있던 것이고 서버에 그런 API가
 * 없다. 없는 기능을 메뉴에 두면 관리자는 그것이 준비 중이라고 생각한다.
 */
const NAV_ITEMS = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/menus', label: '메뉴 관리', icon: Utensils },
  { to: '/analytics/congestion', label: '혼잡도 분석', icon: UsersRound },
  { to: '/analytics/waste', label: '잔반 분석', icon: Trash2 },
  { to: '/demand', label: '예상 식수', icon: ClipboardList },
  { to: '/procurement', label: '발주량 추천', icon: ShoppingCart },
  { to: '/notices', label: '공지 관리', icon: Megaphone },
  { to: '/surveys', label: '만족도 조사', icon: MessageSquare },
  { to: '/inquiries', label: '문의/건의', icon: MessageSquare },
] as const

export function AdminLayout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-logo" aria-hidden="true">
            밥
          </span>
          <span className="sidebar-title">밥플래너 관리자</span>
        </div>

        <nav className="sidebar-nav" aria-label="관리 메뉴">
          <ul>
            {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={'end' in rest ? rest.end : false}
                  className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <button type="button" className="sidebar-logout" onClick={() => void logout()}>
          <LogOut size={18} aria-hidden="true" />
          <span>로그아웃</span>
        </button>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button"
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <MenuIcon size={20} aria-hidden="true" />
          </button>

          <SiteSelect />

          <span className="topbar-user">{user ? `${user.name} 님` : ''}</span>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
