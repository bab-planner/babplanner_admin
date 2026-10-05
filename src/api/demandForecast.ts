import { request } from './http'
import type { DemandForecastRequest, DemandForecastResponse, DemandForecastStatus } from './types'

/*
 * 식수 예측 (합성데이터 PoC).
 *
 * 브라우저는 백엔드의 관리자 경로만 부른다. 실제 예측은 백엔드가 내부 AI 서버에
 * 맡기지만, 그 주소와 서비스 토큰은 백엔드만 안다. 이 파일에 `/internal/` 경로를
 * 두지 않는다.
 */

/** 관리자가 화면에서 입력하는 "급식 조건". 요청 계약과 같다. */
export type DemandForecastConditionsInput = DemandForecastRequest

/**
 * 급식 조건을 서버 요청으로 만든다.
 *
 * 메인 메뉴의 앞뒤 공백만 다듬고 나머지는 입력 그대로다. 메뉴 분류는 서버 enum 이름(WESTERN 등)을 그대로 보낸다.
 */
export function buildDemandForecastRequest(
  conditions: DemandForecastConditionsInput,
): DemandForecastRequest {
  const mainMenu = conditions.mainMenu.trim()
  return {
    ...conditions,
    mainMenu,
  }
}

/** 식수 예측 모델을 지금 쓸 수 있는지. 화면에 처음 들어올 때 한 번만 읽는다. */
export function getDemandForecastStatus(): Promise<DemandForecastStatus> {
  return request<DemandForecastStatus>('/api/v1/admin/demand-forecasts/status')
}

/**
 * 예상 식수 인원을 계산한다. 서버는 결과를 저장하지 않는다.
 *
 * 예측할 수 없으면 서버가 503(AI_SERVICE_UNAVAILABLE)을 준다. 그때 화면은 숫자를
 * 보여 주지 않는다.
 */
export function predictDemandForecast(
  body: DemandForecastRequest,
): Promise<DemandForecastResponse> {
  return request<DemandForecastResponse>('/api/v1/admin/demand-forecasts/predict', {
    method: 'POST',
    body,
  })
}
