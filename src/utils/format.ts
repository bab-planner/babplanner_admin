/**
 * 표시용 서식.
 *
 * 원본 값을 바꾸지 않는다. 여기서 하는 일은 화면에 어떻게 보일지를 정하는
 * 것뿐이고, 서버로 다시 보내는 값은 항상 받은 그대로다.
 */

/** 값이 없다는 것을 한 가지 모양으로 보여 준다. 0으로 대신하지 않는다. */
export const NO_VALUE = '—'

const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
})

const numberFormat = new Intl.NumberFormat('ko-KR')

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return NO_VALUE
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : dateTimeFormat.format(parsed)
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return NO_VALUE
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : timeFormat.format(parsed)
}

export function formatCount(value: number | null | undefined, unit = ''): string {
  if (value === null || value === undefined) return NO_VALUE
  return `${numberFormat.format(value)}${unit}`
}

/**
 * 0~1 비율을 백분율 문자열로.
 *
 * 서버가 준 값은 그대로 두고 보이는 자리만 줄인다. 0.18333…을 0.18로
 * 저장하거나 다시 계산에 쓰지 않는다.
 */
export function formatRate(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE
  return `${(value * 100).toFixed(digits)}%`
}

export function formatQuantity(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined) return NO_VALUE
  const text = numberFormat.format(value)
  return unit ? `${text} ${unit}` : text
}

/** yyyy-MM-dd. date input과 API가 같은 모양을 쓴다. */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayInputValue(): string {
  return toDateInputValue(new Date())
}

export function daysAgoInputValue(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toDateInputValue(date)
}

/**
 * datetime-local 입력을 API가 받는 시각 문자열로.
 *
 * 입력값은 브라우저의 지역 시각이다. 그대로 보내면 시간대가 빠져 서버가
 * 다른 순간으로 읽는다. Date를 거쳐 offset이 붙은 값으로 만든다.
 */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString()
}

export function isoToLocalInput(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function hoursAgoLocalInput(hours: number): string {
  const date = new Date()
  date.setHours(date.getHours() - hours)
  return isoToLocalInput(date.toISOString())
}

export function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString())
}
