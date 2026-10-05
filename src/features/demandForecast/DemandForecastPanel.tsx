import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  buildDemandForecastRequest,
  getDemandForecastStatus,
  predictDemandForecast,
} from '../../api/demandForecast'
import type { DemandForecastConditionsInput } from '../../api/demandForecast'
import { DEMO_DEFAULT_CONDITIONS } from '../../api/demandForecastPoc'
import { ApiError } from '../../api/http'
import type { DemandForecastResponse, MenuCategory } from '../../api/types'
import { MENU_CATEGORIES, MENU_CATEGORY_LABEL } from '../../utils/labels'
import { formatCount } from '../../utils/format'
import { compareToAverage, formatSignedCount, formatSignedPercent } from './forecastMath'

/**
 * 중식 예상 인원 (합성데이터 PoC).
 *
 * 대시보드에서 식수 예측을 대표하는 유일한 화면이다. 여기서 "식수"는 급식을 먹는
 * 사람 수다. 물의 양이 아니다.
 *
 * 제목에 "내일"이나 "다음 운영일"을 쓰지 않는다. 관리자가 날짜를 고를 수 있고, 고른
 * 날짜가 실제 다음 운영일인지 이 화면이 보장하지 않는다. 날짜는 결과에 적는다.
 *
 * 기본 화면은 결과 중심이다. 조건은 한 줄로 요약해 보여 주고, 고칠 때만 입력 폼을
 * 펼친다. 시연 흐름: 조건 확인 → (필요하면 수정) → "식수 예측" → 결과와 비교값.
 *
 * 지키는 것:
 *
 * - 숫자는 서버 응답에서만 나온다. 실패하면 숫자를 보여 주지 않는다. 대신할 값이나
 *   이전 결과를 "최신"처럼 남기지 않는다.
 * - 서버 내부 사정(AI 서버 이름, 내부 주소, 모델 파일 등)을 화면에 옮기지 않는다.
 * - 합성데이터로 학습한 모델이면 그 사실을 알린다. 크게 강조하지는 않는다.
 * - 증감은 단순 산술 차이다. 모델은 원인을 알려 주지 않으므로 이유를 붙이지 않는다.
 * - 현재 혼잡도(CCTV)와 섞지 않는다. 혼잡도는 옆의 다른 카드다.
 */

export const FORECAST_UNAVAILABLE_MESSAGE = '현재 식수 예측을 사용할 수 없습니다.'
export const FORECAST_NOT_READY_MESSAGE = '식수 예측 모델 준비 중입니다.'
export const SYNTHETIC_NOTICE = '현재 식수 예측은 합성데이터 기반 시범 결과입니다.'

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

/** 2026-09-15 + 화요일 → 2026.09.15 (화). 표시용이다. */
function formatForecastDate(dateText: string, weekday: string | null): string {
  const date = dateText.replaceAll('-', '.')
  return weekday ? `${date} (${weekday.slice(0, 1)})` : date
}

// ---------- 입력 ----------

export interface ForecastFormState {
  date: string
  semester: '' | '1' | '2'
  semesterWeek: string
  examPeriod: boolean
  holiday: boolean
  campusEvent: boolean
  temperature: string
  rainfall: string
  humidity: string
  menuCategory: MenuCategory | ''
  mainMenu: string
  specialMenu: boolean
}

export type ForecastFieldErrors = Partial<Record<keyof ForecastFormState, string>>

function weekdayOf(dateText: string): number {
  return new Date(`${dateText}T00:00:00`).getDay()
}

function isWeekend(dateText: string): boolean {
  const day = weekdayOf(dateText)
  return day === 0 || day === 6
}

/** 폼 값. 시연 기본 조건(demandForecastPoc.ts)에서 시작한다. 결과 숫자는 없다. */
export function formFromConditions(conditions: DemandForecastConditionsInput): ForecastFormState {
  return {
    date: conditions.date,
    semester: String(conditions.semester) as ForecastFormState['semester'],
    semesterWeek: String(conditions.semesterWeek),
    examPeriod: conditions.examPeriod,
    holiday: conditions.holiday,
    campusEvent: conditions.campusEvent,
    temperature: String(conditions.temperature),
    rainfall: String(conditions.rainfall),
    humidity: String(conditions.humidity),
    menuCategory: conditions.menuCategory,
    mainMenu: conditions.mainMenu,
    specialMenu: conditions.specialMenu,
  }
}

function numberIn(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

/**
 * 명백히 틀린 값만 막는다. 범위는 서버 계약과 같다. 최종 판단은 서버가 한다.
 */
export function validateForecastForm(form: ForecastFormState): {
  input: DemandForecastConditionsInput | null
  errors: ForecastFieldErrors
} {
  const errors: ForecastFieldErrors = {}

  if (!form.date) errors.date = '예측 날짜를 선택해 주세요.'
  else if (isWeekend(form.date)) errors.date = '주말은 예측 대상이 아닙니다.'

  if (form.semester === '') errors.semester = '학기를 선택해 주세요.'

  const week = numberIn(form.semesterWeek, 1, 16)
  if (week === null || !Number.isInteger(week)) {
    errors.semesterWeek = '1~16주차 사이로 입력해 주세요.'
  }

  const temperature = numberIn(form.temperature, -30, 45)
  if (temperature === null) errors.temperature = '기온은 -30~45℃ 사이로 입력해 주세요.'

  const rainfall = numberIn(form.rainfall, 0, 500)
  if (rainfall === null) errors.rainfall = '강수량은 0~500mm 사이로 입력해 주세요.'

  const humidity = numberIn(form.humidity, 0, 100)
  if (humidity === null) errors.humidity = '습도는 0~100% 사이로 입력해 주세요.'

  if (form.menuCategory === '') errors.menuCategory = '메뉴 유형을 선택해 주세요.'

  const mainMenu = form.mainMenu.trim()
  if (!mainMenu) errors.mainMenu = '메인 메뉴를 입력해 주세요.'
  else if (mainMenu.length > 50) errors.mainMenu = '50자 이내로 입력해 주세요.'

  if (Object.keys(errors).length > 0) return { input: null, errors }

  return {
    input: {
      date: form.date,
      semester: Number(form.semester),
      semesterWeek: week!,
      examPeriod: form.examPeriod,
      holiday: form.holiday,
      campusEvent: form.campusEvent,
      temperature: temperature!,
      rainfall: rainfall!,
      humidity: humidity!,
      menuCategory: form.menuCategory as MenuCategory,
      mainMenu,
      specialMenu: form.specialMenu,
    },
    errors,
  }
}

/**
 * 실패 안내.
 *
 * 503은 AI 쪽 문제다. 원인(서버 다운, 토큰, 모델 파일)은 백엔드 로그에만 있고 화면에는
 * 한 가지 문구만 보인다. 네트워크 예외 문구도 그대로 옮기지 않는다.
 */
function forecastErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) return FORECAST_UNAVAILABLE_MESSAGE
    if (error.status === 400) return '입력한 급식 조건을 다시 확인해 주세요.'
    return error.message
  }
  return FORECAST_UNAVAILABLE_MESSAGE
}

// ---------- 조건 요약 ----------

type ConditionSource = Omit<DemandForecastConditionsInput, 'date'>

function conditionChips(conditions: ConditionSource, weekday: string | null): string[] {
  const chips: string[] = []
  if (weekday) chips.push(weekday)
  chips.push(`${conditions.semester}학기 ${conditions.semesterWeek}주차`)
  chips.push(conditions.examPeriod ? '시험기간' : '시험기간 아님')
  chips.push(`${MENU_CATEGORY_LABEL[conditions.menuCategory]} / ${conditions.mainMenu}`)
  if (conditions.specialMenu) chips.push('특식')
  chips.push(`기온 ${conditions.temperature}℃`)
  chips.push(conditions.rainfall > 0 ? `강수 ${conditions.rainfall}mm` : '강수 없음')
  chips.push(`습도 ${conditions.humidity}%`)
  if (conditions.holiday) chips.push('공휴일')
  if (conditions.campusEvent) chips.push('교내 행사')
  return chips
}

// ---------- 결과 ----------

function ForecastResult({ result }: { result: DemandForecastResponse }) {
  const { reference } = result
  const comparison = compareToAverage(result.predictedMealCount, reference.rolling7DayAverage)
  const percent = formatSignedPercent(comparison.percent)

  return (
    <div className="forecast-main">
      {/* 1순위: 예상 인원, 2순위: 최근 평균과의 단순 차이 */}
      <div className="forecast-headline">
        <p className="forecast-caption">
          {formatForecastDate(result.forecastDate, result.conditions.weekday)}
        </p>
        <p className="forecast-value">{formatCount(result.predictedMealCount, '명')}</p>
        <p className="forecast-change">
          최근 7일 평균 대비{' '}
          <strong>
            {formatSignedCount(comparison.difference)}
            {percent ? ` (${percent})` : ''}
          </strong>
        </p>
      </div>

      {/* 3순위: 비교값과 기준 기록일. 참고 사항은 여기 작게 붙인다. */}
      <div className="forecast-compare">
        <dl className="forecast-reference">
          <div>
            <dt>전일 식수 인원</dt>
            <dd>{formatCount(reference.previousDay, '명')}</dd>
          </div>
          <div>
            <dt>전주 동일 요일</dt>
            <dd>{formatCount(reference.sameWeekdayPreviousWeek, '명')}</dd>
          </div>
          <div>
            <dt>최근 7일 평균</dt>
            <dd>{formatCount(reference.rolling7DayAverage, '명')}</dd>
          </div>
        </dl>
        <p className="forecast-history">최근 식수 기록: {reference.historyAsOf}</p>
        {/* 서버 문구를 그대로 옮긴다. 오류가 아니므로 붉게 칠하지 않는다. */}
        {result.warnings.length > 0 ? (
          <ul className="forecast-warnings" aria-label="예측 참고 사항">
            {result.warnings.map((warning) => (
              <li key={warning}>※ {warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

// ---------- 폼 ----------

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string
  error?: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="field-error" id={`${htmlFor}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

// ---------- 패널 ----------

export function DemandForecastPanel() {
  const [form, setForm] = useState<ForecastFormState>(() =>
    formFromConditions(DEMO_DEFAULT_CONDITIONS),
  )
  const [errors, setErrors] = useState<ForecastFieldErrors>({})
  const [editing, setEditing] = useState(false)

  // 처음 들어올 때 한 번만 읽는다. 주기적으로 다시 부르지 않는다.
  const status = useQuery({
    queryKey: ['admin', 'demand-forecast', 'status'],
    queryFn: getDemandForecastStatus,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const run = useMutation({
    mutationFn: (input: DemandForecastConditionsInput) =>
      predictDemandForecast(buildDemandForecastRequest(input)),
  })

  // 가장 최근 요청이 성공했을 때만 결과가 있다. 새 요청이 진행 중이거나 실패하면
  // 이전 결과는 보이지 않는다.
  const result = run.isSuccess ? run.data : undefined
  const ready = status.data?.available === true
  const synthetic = Boolean(status.data?.syntheticData) || Boolean(result?.model.syntheticData)

  function update<K extends keyof ForecastFormState>(key: K, value: ForecastFormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function predict() {
    if (run.isPending || !ready) return
    const { input, errors: found } = validateForecastForm(form)
    setErrors(found)
    if (input) {
      run.mutate(input)
    } else {
      // 고칠 곳을 보여 준다. 접힌 채로 두면 무엇이 틀렸는지 알 수 없다.
      setEditing(true)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    predict()
  }

  function resetToDefaults() {
    setForm(formFromConditions(DEMO_DEFAULT_CONDITIONS))
    setErrors({})
  }

  const invalid = (key: keyof ForecastFormState) =>
    errors[key] ? { 'aria-invalid': true, 'aria-describedby': `forecast-${key}-error` } : {}

  // 결과가 있으면 그 결과의 조건을, 없으면 지금 폼 조건을 요약한다.
  const pending = validateForecastForm(form).input
  const chips = result
    ? conditionChips(result.conditions, result.conditions.weekday)
    : pending
      ? conditionChips(pending, WEEKDAY_NAMES[weekdayOf(pending.date)] ?? null)
      : null
  const chipsDate = result ? result.forecastDate : pending?.date

  let body: ReactNode
  if (run.isPending) {
    body = (
      <div className="forecast-placeholder">
        <p className="status" role="status">
          식수를 예측하는 중…
        </p>
        <div className="forecast-skeleton" aria-hidden="true" />
      </div>
    )
  } else if (run.isError) {
    body = (
      <div className="forecast-placeholder">
        <p className="status status-error" role="alert">
          {forecastErrorMessage(run.error)}
        </p>
      </div>
    )
  } else if (result) {
    body = <ForecastResult result={result} />
  } else if (status.isPending) {
    body = (
      <div className="forecast-placeholder">
        <p className="status" role="status">
          식수 예측 상태를 확인하는 중…
        </p>
      </div>
    )
  } else if (!ready) {
    body = (
      <div className="forecast-placeholder">
        <p className="status" role="status">
          {status.error ? FORECAST_UNAVAILABLE_MESSAGE : FORECAST_NOT_READY_MESSAGE}
        </p>
        <button type="button" className="button" onClick={() => void status.refetch()}>
          상태 다시 확인
        </button>
      </div>
    )
  } else {
    body = (
      <div className="forecast-placeholder">
        <p className="status" role="status">
          아래 조건을 확인하고 ‘식수 예측’을 누르면 예상 인원이 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <section className="panel forecast-panel" aria-labelledby="forecast-title">
      <div className="panel-head">
        <div>
          <h2 className="panel-title" id="forecast-title">
            중식 예상 인원
          </h2>
          <p className="panel-note">선택한 날짜의 조리·발주 계획을 위한 예상 식수 인원</p>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={!ready || run.isPending}
            onClick={predict}
          >
            {run.isPending ? '예측 중…' : '식수 예측'}
          </button>
        </div>
      </div>

      <div aria-live="polite">{body}</div>

      <div className="forecast-conditions-row">
        <span className="forecast-conditions-label">
          예측 조건{chipsDate ? ` · ${formatForecastDate(chipsDate, null)}` : ''}
        </span>
        {chips ? (
          <ul className="forecast-conditions" aria-label="예측 조건">
            {chips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        ) : (
          <span className="forecast-conditions-invalid">입력한 조건을 확인해 주세요.</span>
        )}
        <button
          type="button"
          className="button forecast-toggle"
          aria-expanded={editing}
          aria-controls={editing ? 'forecast-form' : undefined}
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? '조건 접기' : '예측 조건 수정'}
        </button>
      </div>

      {editing ? (
        <form id="forecast-form" className="forecast-form" noValidate onSubmit={submit} aria-label="급식 조건">
          <fieldset className="forecast-fieldset">
            <legend>날짜·학사</legend>
            <Field label="예측 날짜" htmlFor="forecast-date" error={errors.date}>
              <input
                id="forecast-date"
                type="date"
                value={form.date}
                onChange={(event) => update('date', event.target.value)}
                {...invalid('date')}
              />
            </Field>
            <Field label="학기" htmlFor="forecast-semester" error={errors.semester}>
              <select
                id="forecast-semester"
                value={form.semester}
                onChange={(event) =>
                  update('semester', event.target.value as ForecastFormState['semester'])
                }
                {...invalid('semester')}
              >
                <option value="">선택</option>
                <option value="1">1학기</option>
                <option value="2">2학기</option>
              </select>
            </Field>
            <Field label="학기 주차" htmlFor="forecast-semesterWeek" error={errors.semesterWeek}>
              <input
                id="forecast-semesterWeek"
                type="number"
                inputMode="numeric"
                min={1}
                max={16}
                value={form.semesterWeek}
                onChange={(event) => update('semesterWeek', event.target.value)}
                {...invalid('semesterWeek')}
              />
            </Field>
            <div className="forecast-checks">
              <Check label="시험 기간" checked={form.examPeriod} onChange={(v) => update('examPeriod', v)} />
              <Check label="교내 행사" checked={form.campusEvent} onChange={(v) => update('campusEvent', v)} />
              <Check label="공휴일" checked={form.holiday} onChange={(v) => update('holiday', v)} />
            </div>
          </fieldset>

          <fieldset className="forecast-fieldset">
            <legend>날씨 예보</legend>
            <p className="field-hint">예측 시점(전날)에 확보 가능한 예보값을 입력</p>
            <Field label="예보 기온(℃)" htmlFor="forecast-temperature" error={errors.temperature}>
              <input
                id="forecast-temperature"
                type="number"
                step="0.1"
                value={form.temperature}
                onChange={(event) => update('temperature', event.target.value)}
                {...invalid('temperature')}
              />
            </Field>
            <Field label="예보 강수량(mm)" htmlFor="forecast-rainfall" error={errors.rainfall}>
              <input
                id="forecast-rainfall"
                type="number"
                step="0.1"
                min={0}
                value={form.rainfall}
                onChange={(event) => update('rainfall', event.target.value)}
                {...invalid('rainfall')}
              />
            </Field>
            <Field label="예보 습도(%)" htmlFor="forecast-humidity" error={errors.humidity}>
              <input
                id="forecast-humidity"
                type="number"
                min={0}
                max={100}
                value={form.humidity}
                onChange={(event) => update('humidity', event.target.value)}
                {...invalid('humidity')}
              />
            </Field>
          </fieldset>

          <fieldset className="forecast-fieldset">
            <legend>메뉴</legend>
            <Field label="메뉴 유형" htmlFor="forecast-menuCategory" error={errors.menuCategory}>
              <select
                id="forecast-menuCategory"
                value={form.menuCategory}
                onChange={(event) =>
                  update('menuCategory', event.target.value as ForecastFormState['menuCategory'])
                }
                {...invalid('menuCategory')}
              >
                <option value="">선택</option>
                {MENU_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {MENU_CATEGORY_LABEL[category]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="메인 메뉴" htmlFor="forecast-mainMenu" error={errors.mainMenu}>
              <input
                id="forecast-mainMenu"
                type="text"
                maxLength={50}
                value={form.mainMenu}
                onChange={(event) => update('mainMenu', event.target.value)}
                {...invalid('mainMenu')}
              />
            </Field>
            <div className="forecast-checks">
              <Check label="특식" checked={form.specialMenu} onChange={(v) => update('specialMenu', v)} />
            </div>
          </fieldset>

          <div className="forecast-form-actions">
            <p className="forecast-hint">날씨와 학사 조건은 자동 연동 전까지 직접 입력합니다.</p>
            <button type="button" className="button" onClick={resetToDefaults}>
              기본 조건으로
            </button>
            <button type="submit" className="button button-primary" disabled={!ready || run.isPending}>
              이 조건으로 예측
            </button>
          </div>
        </form>
      ) : null}

      {/* 4순위: PoC 표시와 합성데이터 안내. 숨기지 않되 작게 둔다. */}
      <div className="forecast-footer">
        <span
          className="badge badge-on"
          title={status.data?.modelVersion ? `모델 버전 ${status.data.modelVersion}` : undefined}
        >
          AI 예측 PoC
        </span>
        {synthetic ? <span className="badge forecast-badge-synthetic">합성데이터 기반</span> : null}
        {result?.model.syntheticData ? (
          // 보이는 문구는 짧게 하나. 서버 disclaimer는 버리지 않고 툴팁(기존 배지와 같은
          // title 방식)으로 두고, 화면 낭독기에는 그대로 읽힌다.
          <p className="forecast-poc-note" role="note" title={result.disclaimer}>
            {SYNTHETIC_NOTICE}
            <span className="sr-only">{result.disclaimer}</span>
          </p>
        ) : null}
      </div>
    </section>
  )
}
