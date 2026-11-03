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

/**
 * 브라우저의 실행 시간대와 무관하게 한국의 달력 날짜를 읽는다.
 * Date의 로컬 getter를 쓰면 해외에서 관리자 화면을 열었을 때 기본 예측일이
 * 하루 어긋날 수 있다.
 */
function koreaCalendarDate(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day') }
}

function dateText(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/** 한국 날짜 기준 다음 평일. 공휴일·학사 운영일은 확인하지 않는다. */
export function nextWeekdayInKorea(now = new Date()): string {
  const { year, month, day } = koreaCalendarDate(now)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  const weekday = candidate.getUTCDay()
  candidate.setUTCDate(candidate.getUTCDate() + (weekday === 5 ? 3 : weekday === 6 ? 2 : weekday === 0 ? 1 : 1))
  return dateText(candidate)
}

/**
 * 날짜에 맞춘 시연 입력 초깃값. 학사일정 API가 없으므로 학기·주차는 단순 추정이며,
 * 날씨와 메뉴 역시 템플릿 값으로 둔다. 이 함수는 사용자 편집 뒤에는 다시 호출하지 않는다.
 */
export function createDefaultForecastConditions(now = new Date()): DemandForecastConditionsInput {
  const date = nextWeekdayInKorea(now)
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(year, month - 1, day))
  const secondSemester = month >= 9
  const semesterStart = new Date(Date.UTC(year, secondSemester ? 8 : 2, secondSemester ? 1 : 2))
  const estimatedWeek = Math.min(16, Math.max(1, Math.floor((target.getTime() - semesterStart.getTime()) / 604_800_000) + 1))
  return {
    ...DEMO_DEFAULT_CONDITIONS,
    date,
    semester: secondSemester ? 2 : 1,
    semesterWeek: estimatedWeek,
  }
}
