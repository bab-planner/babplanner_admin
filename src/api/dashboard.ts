import { request } from './http'
import type { AdminDashboard } from './types'

export function fetchDashboard(siteId: number): Promise<AdminDashboard> {
  return request<AdminDashboard>(`/api/v1/admin/dashboard?siteId=${siteId}`)
}
