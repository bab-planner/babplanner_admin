import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { AdminLayout } from '../layout/AdminLayout'
import { SiteProvider } from '../components/SiteProvider'
import { LoginPage } from '../features/login/LoginPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { MenusPage } from '../features/menus/MenusPage'
import { CongestionPage } from '../features/congestion/CongestionPage'
import { WastePage } from '../features/waste/WastePage'
import { NoticesPage } from '../features/notices/NoticesPage'
import { SurveysPage } from '../features/surveys/SurveysPage'
import { InquiriesPage } from '../features/inquiries/InquiriesPage'
import { WasteSubmissionsPage } from '../features/wasteSubmissions/WasteSubmissionsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <SiteProvider>
              <AdminLayout />
            </SiteProvider>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="menus" element={<MenusPage />} />
          <Route path="analytics/congestion" element={<CongestionPage />} />
          <Route path="analytics/waste" element={<WastePage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="surveys" element={<SurveysPage />} />
          <Route path="inquiries" element={<InquiriesPage />} />
          <Route path="waste-submissions" element={<WasteSubmissionsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
