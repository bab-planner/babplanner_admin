import { request } from './http'
import type { DemandPrediction, DemandPredictionRequest, MealType } from './types'

export function fetchDemandPredictions(
  siteId: number,
  date: string,
  mealType?: MealType | '',
): Promise<DemandPrediction[]> {
  const query = new URLSearchParams({ siteId: String(siteId), date })
  if (mealType) query.set('mealType', mealType)
  return request<DemandPrediction[]>(`/api/v1/admin/demand-predictions?${query}`)
}

/** 예측 실행. 같은 조건을 다시 실행해도 기존 결과를 덮지 않는다. */
export function runDemandPrediction(
  body: DemandPredictionRequest,
): Promise<DemandPrediction> {
  return request<DemandPrediction>('/api/v1/admin/demand-predictions', {
    method: 'POST',
    body,
  })
}
