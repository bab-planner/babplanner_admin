/** 식수 예측 PoC 전용 시연 값. */

import type { DemandForecastConditionsInput } from './demandForecast'

/**
 * 시연 기본 조건. 대시보드를 열면 이 조건이 채워져 있어 바로 예측해 볼 수 있다.
 *
 * **조건만 정한다. 결과 숫자는 여기 없다.** 예상 인원은 항상 서버 응답에서 온다.
 *
 * TODO(demand-forecast): 학사일정(Spring DB)과 기상예보가 자동으로 조건을 채우게
 * 되면 이 값을 지우고, 다음 운영일과 등록된 중식 식단으로 조건을 만든다.
 */
export const DEMO_DEFAULT_CONDITIONS: Readonly<DemandForecastConditionsInput> = Object.freeze({
  date: '2026-09-15',
  semester: 2,
  semesterWeek: 3,
  examPeriod: false,
  holiday: false,
  campusEvent: false,
  temperature: 24,
  rainfall: 0,
  humidity: 60,
  menuCategory: 'WESTERN',
  mainMenu: '돈까스',
  specialMenu: false,
})
