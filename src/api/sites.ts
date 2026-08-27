import { request } from './http'
import type { AdminSite } from './types'

/** 관리 대상 급식소. siteId를 화면에 박지 않기 위해 존재한다. */
export function fetchSites(): Promise<AdminSite[]> {
  return request<AdminSite[]>('/api/v1/admin/sites')
}
