import { request } from './http'
import type { MealType, ProcurementItem, ProcurementRunRequest } from './types'

/** 가장 최근 실행의 항목만 돌아온다. */
export function fetchProcurement(
  siteId: number,
  date: string,
  mealType: MealType,
): Promise<ProcurementItem[]> {
  const query = new URLSearchParams({ siteId: String(siteId), date, mealType })
  return request<ProcurementItem[]>(`/api/v1/admin/procurement-recommendations?${query}`)
}

export function runProcurement(body: ProcurementRunRequest): Promise<ProcurementItem[]> {
  return request<ProcurementItem[]>('/api/v1/admin/procurement-recommendations', {
    method: 'POST',
    body,
  })
}
