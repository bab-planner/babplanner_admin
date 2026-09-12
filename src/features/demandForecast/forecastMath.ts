/**
 * 예측값과 최근 평균의 단순 비교.
 *
 * 산술 차이일 뿐이다. 왜 늘었는지를 설명하지 않는다. 모델은 원인을 알려 주지
 * 않으므로, 이 차이를 모델이 찾아낸 증가 이유처럼 보여 주면 안 된다.
 */

export interface AverageComparison {
  /** 예측 - 평균 (명). */
  difference: number
  /** 평균 대비 백분율. 평균이 0이면 비율을 정할 수 없어 null. */
  percent: number | null
}

export function compareToAverage(predicted: number, average: number): AverageComparison {
  const difference = predicted - average
  return {
    difference,
    percent: average > 0 ? (difference / average) * 100 : null,
  }
}

const countFormat = new Intl.NumberFormat('ko-KR')

/** +64명 / -12명 / 0명 */
export function formatSignedCount(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${countFormat.format(Math.abs(value))}명`
}

/** +17.4% / -3.2% / 0.0%. 비율이 없으면 빈 문자열. */
export function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return ''
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}
