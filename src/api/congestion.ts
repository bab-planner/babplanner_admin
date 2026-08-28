import { request } from './http'
import type { Congestion } from './types'

/**
 * 현재 혼잡도.
 *
 * OpenAPI에 `security`가 없는 공개 endpoint다. 관리자 대시보드
 * (`/api/v1/admin/dashboard`)도 같은 저장 값을 내려주지만, 그쪽은 잔반·예측·
 * 발주까지 한 번에 묶어 온다. 현재 인원만 짧은 주기로 다시 읽으려면 대시보드
 * 전체를 반복해서 부르는 대신 이 경로를 따로 쓴다.
 *
 * 서버가 준 `level`을 그대로 쓴다. 인원수로 단계를 다시 계산하지 않는다 —
 * 몇 명부터 붐비는지는 급식소마다 다르고, 그 기준은 수집기 쪽 운영 정책이다.
 */
export function fetchCurrentCongestion(siteId: number): Promise<Congestion> {
  const query = new URLSearchParams({ siteId: String(siteId) })
  return request<Congestion>(`/api/v1/congestion/current?${query}`)
}
