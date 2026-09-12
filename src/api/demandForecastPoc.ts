/**
 * 식수 예측 PoC 전용 임시 값. **이 파일은 나중에 통째로 지운다.**
 *
 * 지금 서버의 식수 예측 요청에는 `menuPopularity`(0~1)가 필요하다. 이 값은 합성
 * 데이터로 학습한 시범 모델의 입력 feature이고, 실제 학생 선호도를 잰 값이 아니다.
 * 메뉴 데이터(MenuSummary)에도 선호도 같은 값이 없다.
 *
 * 그래서 관리자에게 "0.9" 같은 숫자를 입력받지 않고, 여기서 단순한 시연용 값으로
 * 채운다. 화면 어디에도 이 값을 "선호도"로 보여 주지 않는다.
 *
 * TODO(demand-forecast): 과거 실제 메뉴별 식수 기록으로 백엔드(Spring) 또는 AI
 * feature pipeline이 자동 계산하게 되면 이 파일과 `buildDemandForecastRequest`의
 * 호출을 지운다. 그때는 요청에서 menuPopularity 필드 자체가 빠질 수 있다.
 */

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

/** 시연용으로 "인기 메뉴"로 취급하는 이름. 실제 선호 조사 결과가 아니다. */
const DEMO_POPULAR_MENUS: ReadonlySet<string> = new Set(['돈까스', '제육볶음', '탕수육'])

/** 인기 메뉴로 취급할 때의 시연용 값. */
export const DEMO_POPULAR_MENU_POPULARITY = 0.9

/** 그 밖의 메뉴에 쓰는 시연용 값. */
export const DEMO_DEFAULT_MENU_POPULARITY = 0.7

/**
 * 메인 메뉴 이름으로 PoC 요청용 `menuPopularity`를 정한다.
 *
 * 공백만 다른 이름은 같은 메뉴로 본다. 그 밖의 가공(유사어, 부분 일치)은 하지 않는다.
 * 임시 값에 규칙을 늘리면 그만큼 지우기 어려워진다.
 */
export function demoMenuPopularity(mainMenu: string): number {
  return DEMO_POPULAR_MENUS.has(mainMenu.trim())
    ? DEMO_POPULAR_MENU_POPULARITY
    : DEMO_DEFAULT_MENU_POPULARITY
}
