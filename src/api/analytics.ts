import { request } from './http'
import type { Congestion, MenuWaste, WasteSummary } from './types'

/**
 * 혼잡도 시계열.
 *
 * 서버가 준 관측을 그대로 받는다. 구간 평균이나 보간을 여기서 만들지 않는다.
 */
export function fetchCongestionTimeseries(
  siteId: number,
  from: string,
  to: string,
): Promise<Congestion[]> {
  const query = new URLSearchParams({ siteId: String(siteId), from, to })
  return request<Congestion[]>(`/api/v1/admin/congestion/timeseries?${query}`)
}

export function fetchWasteSummary(from: string, to: string): Promise<WasteSummary> {
  const query = new URLSearchParams({ from, to })
  return request<WasteSummary>(`/api/v1/admin/waste/summary?${query}`)
}

export function fetchWasteByMenu(from: string, to: string): Promise<MenuWaste[]> {
  const query = new URLSearchParams({ from, to })
  return request<MenuWaste[]>(`/api/v1/admin/waste/by-menu?${query}`)
}
