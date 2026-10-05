import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DemandForecastPanel,
  FORECAST_NOT_READY_MESSAGE,
  FORECAST_UNAVAILABLE_MESSAGE,
  SYNTHETIC_NOTICE,
  formFromConditions,
  validateForecastForm,
} from '../features/demandForecast/DemandForecastPanel'
import {
  compareToAverage,
  formatSignedCount,
  formatSignedPercent,
} from '../features/demandForecast/forecastMath'
import { buildDemandForecastRequest } from '../api/demandForecast'
import {
  DEMO_DEFAULT_CONDITIONS,
} from '../api/demandForecastPoc'
import type { DemandForecastResponse, DemandForecastStatus } from '../api/types'
import type { Recorded } from './helpers'
import { envelope, errorEnvelope, jsonResponse, mockFetch, renderWithProviders } from './helpers'

const STATUS_PATH = '/api/v1/admin/demand-forecasts/status'
const PREDICT_PATH = '/api/v1/admin/demand-forecasts/predict'

const STATUS_OK: DemandForecastStatus = {
  available: true,
  modelLoaded: true,
  historyAvailable: true,
  modelName: 'lightgbm',
  modelVersion: '54453980807e',
  syntheticData: true,
  trainingPeriod: ['2023-03-13', '2026-09-11'],
  reason: null,
  warnings: [],
}

const DISCLAIMER = '합성데이터 기반 PoC 예측값이며 실제 급식 운영 정확도를 의미하지 않습니다.'
const WARNING =
  '직전 평일(2026-09-14) 기록이 이력에 없어 가장 최근 기록(2026-09-11)을 기준으로 과거 feature를 만들었습니다.'

/** Spring이 돌려주는 모양. 숫자는 테스트마다 바꿔 끼운다. */
function forecast(overrides: Partial<DemandForecastResponse> = {}): DemandForecastResponse {
  return {
    forecastDate: '2026-09-15',
    mealType: 'LUNCH',
    predictedMealCount: 431,
    reference: {
      previousDay: 350,
      sameWeekdayPreviousWeek: 375,
      rolling7DayAverage: 367,
      historyAsOf: '2026-09-11',
    },
    conditions: {
      weekday: '화요일',
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
    },
    model: { name: 'lightgbm', version: '54453980807e', syntheticData: true, trainedAt: null },
    disclaimer: DISCLAIMER,
    warnings: [],
    predictedAt: '2026-09-13T01:00:00Z',
    ...overrides,
  }
}

type Responder = Response | ((call: Recorded, index: number) => Response | Promise<Response>)

function setup({
  status = jsonResponse(envelope(STATUS_OK)),
  predict = jsonResponse(envelope(forecast())),
}: { status?: Responder; predict?: Responder } = {}) {
  const fetchMock = mockFetch()
  fetchMock.on(STATUS_PATH, status)
  fetchMock.on(PREDICT_PATH, predict)
  renderWithProviders(<DemandForecastPanel />, { withSites: false })
  return fetchMock
}

/** 머리의 "식수 예측" 버튼. 모델 상태를 확인할 때까지 기다린다. */
async function predictButton() {
  const button = await screen.findByRole('button', { name: '식수 예측' })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

async function openConditions(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: '예측 조건 수정' }))
  return user
}

async function replaceValue(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label)
  await user.clear(input)
  await user.type(input, value)
}

function predictCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.calls.filter((call) => call.url.includes(PREDICT_PATH))
}

const DEMO_BODY = {
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
}

describe('시연 흐름', () => {
  it('기본은 결과 중심이고 조건 입력 폼은 접혀 있다', async () => {
    setup()
    await predictButton()

    expect(screen.getByRole('heading', { name: '중식 예상 인원' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: '예측 조건 수정' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('form', { name: '급식 조건' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('학기 주차')).not.toBeInTheDocument()
  })

  it('시연 기본 조건이 요약되어 있다', async () => {
    setup()
    await predictButton()

    const conditions = within(screen.getByRole('list', { name: '예측 조건' }))
    for (const chip of ['화요일', '2학기 3주차', '시험기간 아님', '양식 / 돈까스', '기온 24℃', '강수 없음', '습도 60%']) {
      expect(conditions.getByText(chip)).toBeInTheDocument()
    }
    expect(screen.getByText('예측 조건 · 2026.09.15')).toBeInTheDocument()
  })

  it('펼치면 시연 기본값이 들어 있고, 다시 접을 수 있다', async () => {
    setup()
    await predictButton()
    const user = await openConditions()

    expect(screen.getByRole('button', { name: '조건 접기' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('예측 날짜')).toHaveValue('2026-09-15')
    expect(screen.getByLabelText('학기')).toHaveValue('2')
    expect(screen.getByLabelText('학기 주차')).toHaveValue(3)
    expect(screen.getByLabelText('예보 기온(℃)')).toHaveValue(24)
    expect(screen.getByLabelText('예보 강수량(mm)')).toHaveValue(0)
    expect(screen.getByLabelText('예보 습도(%)')).toHaveValue(60)
    expect(screen.getByLabelText('메뉴 유형')).toHaveValue('WESTERN')
    expect(screen.getByLabelText('메인 메뉴')).toHaveValue('돈까스')
    for (const label of ['시험 기간', '교내 행사', '공휴일', '특식']) {
      expect(screen.getByLabelText(label)).not.toBeChecked()
    }
    expect(screen.getByText('예측 시점(전날)에 확보 가능한 예보값을 입력')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '조건 접기' }))
    expect(screen.queryByLabelText('학기 주차')).not.toBeInTheDocument()
  })

  it('조건을 건드리지 않고 바로 누르면 시연 조건으로 요청하고 응답을 보여 준다', async () => {
    const fetchMock = setup()
    const user = userEvent.setup()

    await user.click(await predictButton())

    expect(await screen.findByText('431명')).toBeInTheDocument()
    const [post] = predictCalls(fetchMock)
    expect(post!.method).toBe('POST')
    expect(post!.body).toEqual(DEMO_BODY)
  })

  it('결과 카드는 예상 인원 → 평균 대비 → 비교값 → 기준 기록일 순이다', async () => {
    setup({ predict: jsonResponse(envelope(forecast({ warnings: [WARNING] }))) })
    const user = userEvent.setup()
    await user.click(await predictButton())

    const value = await screen.findByText('431명')
    const change = screen.getByText('+64명 (+17.4%)')
    const previous = screen.getByText('전일 식수 인원')
    const history = screen.getByText('최근 식수 기록: 2026-09-11')
    const order = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(order(value, change)).toBeTruthy()
    expect(order(change, previous)).toBeTruthy()
    expect(order(previous, history)).toBeTruthy()

    expect(screen.getByText('2026.09.15 (화)')).toBeInTheDocument()
    expect(screen.getByText('최근 7일 평균 대비', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('350명')).toBeInTheDocument()
    expect(screen.getByText('전주 동일 요일')).toBeInTheDocument()
    expect(screen.getByText('375명')).toBeInTheDocument()
    expect(screen.getByText('367명')).toBeInTheDocument()
  })

  it('조건을 고치면 고친 조건으로 요청한다', async () => {
    const fetchMock = setup()
    await predictButton()
    const user = await openConditions()

    await user.selectOptions(screen.getByLabelText('메뉴 유형'), 'KOREAN')
    await replaceValue(user, '메인 메뉴', '비빔밥')
    await replaceValue(user, '예보 강수량(mm)', '12.5')
    await user.click(screen.getByLabelText('시험 기간'))
    await user.click(screen.getByRole('button', { name: '이 조건으로 예측' }))

    await waitFor(() => expect(predictCalls(fetchMock)).toHaveLength(1))
    expect(predictCalls(fetchMock)[0]!.body).toMatchObject({
      menuCategory: 'KOREAN',
      mainMenu: '비빔밥',
      rainfall: 12.5,
      examPeriod: true,
    })
  })

  it('기본 조건으로 되돌릴 수 있다', async () => {
    setup()
    await predictButton()
    const user = await openConditions()
    await replaceValue(user, '메인 메뉴', '비빔밥')

    await user.click(screen.getByRole('button', { name: '기본 조건으로' }))

    expect(screen.getByLabelText('메인 메뉴')).toHaveValue('돈까스')
  })
})

describe('숫자는 서버에서만', () => {
  it('다른 응답이 오면 그 숫자를 보여 준다', async () => {
    setup({
      predict: jsonResponse(
        envelope(
          forecast({
            predictedMealCount: 512,
            reference: {
              previousDay: 401,
              sameWeekdayPreviousWeek: 388,
              rolling7DayAverage: 400,
              historyAsOf: '2026-09-11',
            },
          }),
        ),
      ),
    })
    const user = userEvent.setup()

    await user.click(await predictButton())

    expect(await screen.findByText('512명')).toBeInTheDocument()
    expect(screen.getByText('+112명 (+28.0%)')).toBeInTheDocument()
    expect(screen.queryByText('431명')).not.toBeInTheDocument()
  })

  it('누르기 전에는 예상 인원 숫자가 없다', async () => {
    setup()
    await predictButton()

    const panel = screen.getByRole('region', { name: '중식 예상 인원' })
    expect(panel).not.toHaveTextContent(/\d+명/)
    expect(screen.getByText(/누르면 예상 인원이 표시됩니다/)).toBeInTheDocument()
  })

  it('화면 코드 어디에도 시연 결과값 431이 없다', () => {
    const sources: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          if (name !== 'test') walk(path)
        } else if (/\.(ts|tsx)$/.test(name)) {
          sources.push(path)
        }
      }
    }
    walk(join(process.cwd(), 'src'))

    expect(sources.length).toBeGreaterThan(10)
    for (const path of sources) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/\b431\b/)
    }
  })

  it('예상 인원을 물의 양이나 원인 분석처럼 표현하지 않는다', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(await predictButton())
    await screen.findByText('431명')

    expect(document.body).not.toHaveTextContent(/\d+\s*L\b/)
    expect(document.body).not.toHaveTextContent('식수량')
    expect(document.body).not.toHaveTextContent('AI가')
  })

  it('FastAPI 내부 경로를 부르지 않는다', async () => {
    const fetchMock = setup()
    const user = userEvent.setup()
    await user.click(await predictButton())
    await screen.findByText('431명')

    for (const call of fetchMock.calls) {
      expect(call.url).toContain('/api/v1/admin/demand-forecasts/')
      expect(call.url).not.toContain('/internal/')
      expect(call.headers.has('X-Service-Token')).toBe(false)
    }
  })
})

describe('불러오는 중', () => {
  it('상태를 확인하는 동안 예측 버튼을 막는다', () => {
    setup({ status: () => new Promise<Response>(() => {}) })

    expect(screen.getByText('식수 예측 상태를 확인하는 중…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '식수 예측' })).toBeDisabled()
  })

  it('예측 중에는 표시하고 중복 요청을 막는다', async () => {
    let answer: (response: Response) => void = () => {}
    const fetchMock = setup({
      predict: () =>
        new Promise<Response>((resolve) => {
          answer = resolve
        }),
    })
    const user = userEvent.setup()

    await user.click(await predictButton())

    const busy = await screen.findByRole('button', { name: '예측 중…' })
    expect(busy).toBeDisabled()
    expect(screen.getByText('식수를 예측하는 중…')).toBeInTheDocument()
    await user.click(busy)
    expect(predictCalls(fetchMock)).toHaveLength(1)

    answer(jsonResponse(envelope(forecast())))
    expect(await screen.findByText('431명')).toBeInTheDocument()
  })
})

describe('실패', () => {
  const FORBIDDEN = ['FastAPI', '/internal', 'model artifact', 'X-Service-Token', 'Exception', 'stack']

  it('503이면 쓸 수 없다고만 알리고 숫자를 만들지 않는다', async () => {
    setup({
      predict: jsonResponse(
        errorEnvelope('AI_SERVICE_UNAVAILABLE', '예측 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'),
        503,
      ),
    })
    const user = userEvent.setup()

    await user.click(await predictButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(FORECAST_UNAVAILABLE_MESSAGE)
    const panel = screen.getByRole('region', { name: '중식 예상 인원' })
    expect(panel).not.toHaveTextContent(/\d+명/)
    for (const word of FORBIDDEN) {
      expect(document.body).not.toHaveTextContent(word)
    }
  })

  it('앞선 성공값을 새 요청 실패 뒤에 남기지 않는다', async () => {
    setup({
      predict: (_call, index) =>
        index === 0
          ? jsonResponse(envelope(forecast()))
          : jsonResponse(errorEnvelope('AI_SERVICE_UNAVAILABLE', '...'), 503),
    })
    const user = userEvent.setup()
    await user.click(await predictButton())
    expect(await screen.findByText('431명')).toBeInTheDocument()

    await user.click(await predictButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(FORECAST_UNAVAILABLE_MESSAGE)
    expect(screen.queryByText('431명')).not.toBeInTheDocument()
    expect(screen.queryByText('+64명 (+17.4%)')).not.toBeInTheDocument()
  })

  it('백엔드에 닿지 못해도 네트워크 예외 문구를 옮기지 않는다', async () => {
    setup({ predict: () => Promise.reject(new TypeError('Failed to fetch')) })
    const user = userEvent.setup()

    await user.click(await predictButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(FORECAST_UNAVAILABLE_MESSAGE)
    expect(document.body).not.toHaveTextContent('Failed to fetch')
  })
})

describe('모델 상태', () => {
  it('모델이 준비되지 않았으면 알리고, 내부 사유는 보여 주지 않는다', async () => {
    setup({
      status: jsonResponse(
        envelope({
          ...STATUS_OK,
          available: false,
          modelLoaded: false,
          modelName: null,
          modelVersion: null,
          syntheticData: null,
          reason: 'model artifact not found',
        }),
      ),
    })

    expect(await screen.findByText(FORECAST_NOT_READY_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '식수 예측' })).toBeDisabled()
    expect(document.body).not.toHaveTextContent('model artifact')
  })

  it('상태를 확인하지 못하면 쓸 수 없다고 알리고, 다시 확인할 수 있다', async () => {
    const fetchMock = setup({
      status: (_call, index) =>
        index === 0
          ? jsonResponse(errorEnvelope('AI_SERVICE_UNAVAILABLE', '...'), 503)
          : jsonResponse(envelope(STATUS_OK)),
    })

    expect(await screen.findByText(FORECAST_UNAVAILABLE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '식수 예측' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '상태 다시 확인' }))

    await predictButton()
    expect(fetchMock.countOf(STATUS_PATH)).toBe(2)
  })

  it('상태는 처음 한 번만 읽는다', async () => {
    const fetchMock = setup()
    const user = userEvent.setup()
    await user.click(await predictButton())
    await screen.findByText('431명')
    await user.click(await predictButton())
    await screen.findByText('431명')

    expect(fetchMock.countOf(STATUS_PATH)).toBe(1)
  })
})

describe('합성데이터 안내', () => {
  it('합성데이터 모델이면 결과 아래에 작게 알리고 서버 disclaimer를 붙인다', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(await predictButton())
    const value = await screen.findByText('431명')

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(SYNTHETIC_NOTICE)
    expect(note).toHaveTextContent(DISCLAIMER)
    // 서버 disclaimer는 버리지 않고 툴팁으로 둔다. 보이는 문구는 짧은 한 줄이다.
    expect(note).toHaveAttribute('title', DISCLAIMER)
    expect(screen.getByText('합성데이터 기반')).toBeInTheDocument()
    expect(screen.getByText('AI 예측 PoC')).toBeInTheDocument()
    // 결과보다 아래다.
    expect(value.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 모델 버전은 본문에 크게 보이지 않는다.
    expect(document.body).not.toHaveTextContent('54453980807e')
  })

  it('실데이터 모델이면 합성데이터 안내가 없다', async () => {
    setup({
      status: jsonResponse(envelope({ ...STATUS_OK, syntheticData: false })),
      predict: jsonResponse(
        envelope(
          forecast({
            model: { name: 'lightgbm', version: 'real-001', syntheticData: false, trainedAt: null },
            disclaimer: '모델 예측값이며 실제 식수와 다를 수 있습니다.',
          }),
        ),
      ),
    })
    const user = userEvent.setup()
    await user.click(await predictButton())
    await screen.findByText('431명')

    expect(screen.queryByText(SYNTHETIC_NOTICE, { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByText('합성데이터 기반')).not.toBeInTheDocument()
  })
})

describe('참고 사항', () => {
  it('서버 warning 문구를 그대로, 기록일 옆에 작게 보여 준다', async () => {
    setup({ predict: jsonResponse(envelope(forecast({ warnings: [WARNING] }))) })
    const user = userEvent.setup()
    await user.click(await predictButton())

    const list = await screen.findByRole('list', { name: '예측 참고 사항' })
    expect(list).toHaveTextContent(`※ ${WARNING}`)
    // 오류가 아니다.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warning이 없으면 영역을 숨긴다', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(await predictButton())
    await screen.findByText('431명')

    expect(screen.queryByRole('list', { name: '예측 참고 사항' })).not.toBeInTheDocument()
  })
})

describe('입력 검증', () => {
  it('주말이면 보내지 않고, 고칠 곳이 보이게 폼을 연다', async () => {
    const fetchMock = setup()
    await predictButton()
    const user = await openConditions()
    fireEvent.change(screen.getByLabelText('예측 날짜'), { target: { value: '2026-09-12' } })
    await user.click(screen.getByRole('button', { name: '조건 접기' }))

    await user.click(screen.getByRole('button', { name: '식수 예측' }))

    expect(await screen.findByText('주말은 예측 대상이 아닙니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '조건 접기' })).toHaveAttribute('aria-expanded', 'true')
    expect(predictCalls(fetchMock)).toHaveLength(0)
  })

  it('범위를 벗어나면 보내지 않는다', async () => {
    const fetchMock = setup()
    await predictButton()
    const user = await openConditions()
    await replaceValue(user, '예보 습도(%)', '101')
    await user.clear(screen.getByLabelText('메인 메뉴'))

    await user.click(screen.getByRole('button', { name: '이 조건으로 예측' }))

    expect(await screen.findByText('습도는 0~100% 사이로 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('메인 메뉴를 입력해 주세요.')).toBeInTheDocument()
    expect(predictCalls(fetchMock)).toHaveLength(0)
  })

  it('검증 규칙은 서버 계약 범위와 같다', () => {
    const valid = formFromConditions(DEMO_DEFAULT_CONDITIONS)

    expect(validateForecastForm({ ...valid, mainMenu: ' 돈까스 ' }).input).toMatchObject({
      mainMenu: '돈까스',
      semester: 2,
    })
    expect(validateForecastForm({ ...valid, semesterWeek: '17' }).errors.semesterWeek).toBeDefined()
    expect(validateForecastForm({ ...valid, semesterWeek: '2.5' }).errors.semesterWeek).toBeDefined()
    expect(validateForecastForm({ ...valid, temperature: '46' }).errors.temperature).toBeDefined()
    expect(validateForecastForm({ ...valid, rainfall: '-1' }).errors.rainfall).toBeDefined()
    expect(validateForecastForm({ ...valid, mainMenu: 'x'.repeat(51) }).errors.mainMenu).toBeDefined()
  })
})

describe('증감 계산', () => {
  it('최근 7일 평균과의 차이와 비율', () => {
    expect(compareToAverage(431, 367)).toEqual({ difference: 64, percent: (64 / 367) * 100 })
    expect(formatSignedCount(64)).toBe('+64명')
    expect(formatSignedPercent((64 / 367) * 100)).toBe('+17.4%')
  })

  it('감소와 변화 없음', () => {
    const down = compareToAverage(300, 367)
    expect(formatSignedCount(down.difference)).toBe('-67명')
    expect(formatSignedPercent(down.percent)).toBe('-18.3%')
    expect(formatSignedCount(0)).toBe('0명')
    expect(formatSignedPercent(0)).toBe('0.0%')
  })

  it('평균이 0이면 비율을 만들지 않는다', () => {
    expect(compareToAverage(10, 0).percent).toBeNull()
    expect(formatSignedPercent(null)).toBe('')
  })
})

describe('메뉴 분류와 PoC 임시 값', () => {
  it('메뉴 분류는 서버 enum 이름 그대로 보낸다', () => {
    for (const category of ['KOREAN', 'CHINESE', 'WESTERN', 'JAPANESE', 'SNACK', 'OTHER'] as const) {
      const body = buildDemandForecastRequest({
        ...DEMO_DEFAULT_CONDITIONS,
        menuCategory: category,
        mainMenu: '메뉴',
      })
      expect(body.menuCategory).toBe(category)
    }
  })

  it('화면에는 한글 라벨로 보여 준다', async () => {
    setup({
      predict: jsonResponse(
        envelope(forecast({ conditions: { ...forecast().conditions, menuCategory: 'SNACK', mainMenu: '떡볶이' } })),
      ),
    })
    const user = userEvent.setup()
    await user.click(await predictButton())

    expect(await screen.findByText('분식 / 떡볶이')).toBeInTheDocument()
  })

  it('시연 기본 조건은 조건만 정하고 결과 숫자는 담지 않는다', () => {
    expect(Object.keys(DEMO_DEFAULT_CONDITIONS)).not.toContain('predictedMealCount')
    expect(buildDemandForecastRequest(DEMO_DEFAULT_CONDITIONS)).toEqual(DEMO_BODY)
  })
})
