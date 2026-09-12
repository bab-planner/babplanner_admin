import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DemandPage } from '../features/demand/DemandPage'
import { ProcurementPage } from '../features/procurement/ProcurementPage'
import type { DemandPrediction, ProcurementItem } from '../api/types'
import { envelope, errorEnvelope, jsonResponse, mockFetch, renderWithProviders } from './helpers'

const SITES = [{ id: 3, name: '학생식당' }]

const FIXTURE_PREDICTION: DemandPrediction = {
  id: 1,
  siteId: 3,
  serviceDate: '2026-09-15',
  mealType: 'LUNCH',
  predictedPeople: 100,
  modelVersion: 'fastapi-fixture-demand-v1',
  createdAt: '2026-09-14T02:00:00Z',
}

const REAL_PREDICTION: DemandPrediction = {
  ...FIXTURE_PREDICTION,
  id: 2,
  predictedPeople: 214,
  modelVersion: 'demand-lstm-v3',
}

function demand(history: DemandPrediction[] = [FIXTURE_PREDICTION]) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope(SITES)))
  fetchMock.on('/api/v1/admin/demand-predictions', jsonResponse(envelope(history)))
  renderWithProviders(<DemandPage />)
  return fetchMock
}

describe('발주 기준 인원', () => {
  it('실행 이력을 보여 준다', async () => {
    demand([REAL_PREDICTION])

    expect(await screen.findByText('214명')).toBeInTheDocument()
    // '중식'은 식사 구분 선택지에도 있다. 표 안을 본다.
    const row = screen.getByText('214명').closest('tr')!
    expect(row).toHaveTextContent('중식')
    expect(row).toHaveTextContent('2026-09-15')
  })

  it('여러 실행 이력을 모두 남긴다', async () => {
    demand([REAL_PREDICTION, FIXTURE_PREDICTION])

    // 덮어쓰기 UI를 만들지 않는다. 그때 무엇을 보고 발주했는지가 남아야 한다.
    expect(await screen.findByText('214명')).toBeInTheDocument()
    expect(screen.getByText('100명')).toBeInTheDocument()
  })

  it('실행하면 계약대로 요청한다', async () => {
    const fetchMock = demand()
    fetchMock.on('/api/v1/admin/demand-predictions', (call) =>
      call.method === 'POST'
        ? jsonResponse(envelope(FIXTURE_PREDICTION), 201)
        : jsonResponse(envelope([FIXTURE_PREDICTION])),
    )
    await screen.findByText('100명')

    await userEvent.click(screen.getByRole('button', { name: '발주 기준 인원 실행' }))

    await waitFor(() => {
      const post = fetchMock.calls.find((call) => call.method === 'POST')
      expect(post?.body).toMatchObject({ siteId: 3, mealType: 'LUNCH' })
      // 예측 인원을 클라이언트가 보내지 않는다.
      expect(post?.body).not.toHaveProperty('predictedPeople')
    })
  })

  it('fixture가 낸 값에는 경고를 붙인다', async () => {
    demand([FIXTURE_PREDICTION])

    // 100명이 그냥 떠 있으면 관리자는 그것을 예측으로 읽는다.
    expect(await screen.findByText('개발용 fixture — 실제 AI 예측이 아닙니다')).toBeInTheDocument()
    expect(screen.getByText('100명')).toBeInTheDocument()
  })

  it('실제 모델 결과에는 경고를 붙이지 않는다', async () => {
    demand([REAL_PREDICTION])
    await screen.findByText('214명')

    expect(
      screen.queryByText('개발용 fixture — 실제 AI 예측이 아닙니다'),
    ).not.toBeInTheDocument()
  })

  it('예측 서비스가 없으면 그대로 알린다', async () => {
    const fetchMock = demand()
    fetchMock.on('/api/v1/admin/demand-predictions', (call) =>
      call.method === 'POST'
        ? jsonResponse(errorEnvelope('AI_SERVICE_UNAVAILABLE', '예측 서비스를 사용할 수 없습니다.'), 503)
        : jsonResponse(envelope([FIXTURE_PREDICTION])),
    )
    await screen.findByText('100명')

    await userEvent.click(screen.getByRole('button', { name: '발주 기준 인원 실행' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '예측 서비스를 현재 사용할 수 없습니다.',
    )
    // 실패했는데 지난 결과를 새 예측처럼 보여 주지 않는다. 이력은 그대로다.
    expect(screen.getByText('100명')).toBeInTheDocument()
  })

  it('실행 중에는 버튼을 잠근다', async () => {
    const fetchMock = demand()
    fetchMock.on('/api/v1/admin/demand-predictions', async (call) => {
      if (call.method !== 'POST') return jsonResponse(envelope([FIXTURE_PREDICTION]))
      await new Promise((resolve) => setTimeout(resolve, 30))
      return jsonResponse(envelope(FIXTURE_PREDICTION), 201)
    })
    await screen.findByText('100명')

    const button = screen.getByRole('button', { name: '발주 기준 인원 실행' })
    await userEvent.click(button)

    // 두 번 눌리면 같은 실행이 이력에 두 줄 남는다.
    expect(await screen.findByRole('button', { name: '실행 중…' })).toBeDisabled()
  })

  it('이력이 없으면 빈 상태를 알린다', async () => {
    demand([])

    expect(await screen.findByText('해당 조건의 실행 이력이 없습니다.')).toBeInTheDocument()
  })
})

const RECOMMENDATION: ProcurementItem[] = [
  {
    ingredientName: '돼지고기',
    unit: 'kg',
    plannedQuantity: 12.5,
    recommendedQuantity: 12.5,
    adjustmentRate: 0,
    reason: '개발용 fixture입니다.',
  },
]

function procurement(items: ProcurementItem[] = []) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope(SITES)))
  fetchMock.on('/api/v1/admin/procurement-recommendations', jsonResponse(envelope(items)))
  renderWithProviders(<ProcurementPage />)
  return fetchMock
}

async function fillRow(name: string, unit: string, quantity: string) {
  await userEvent.type(screen.getByLabelText('식재료 1 이름'), name)
  await userEvent.type(screen.getByLabelText('식재료 1 단위'), unit)
  await userEvent.type(screen.getByLabelText('식재료 1 수량'), quantity)
}

describe('발주량 추천', () => {
  it('수량과 단위를 따로 받는다', async () => {
    procurement()

    expect(await screen.findByLabelText('식재료 1 이름')).toBeInTheDocument()
    expect(screen.getByLabelText('식재료 1 단위')).toBeInTheDocument()
    expect(screen.getByLabelText('식재료 1 수량')).toHaveAttribute('type', 'number')
  })

  it('0 이하 수량을 보내지 않는다', async () => {
    const fetchMock = procurement()
    await screen.findByLabelText('식재료 1 이름')
    await fillRow('쌀', 'kg', '0')

    await userEvent.click(screen.getByRole('button', { name: '발주 추천 실행' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('수량은 0보다 큰 숫자여야 합니다.')
    expect(fetchMock.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('같은 식재료와 단위를 두 번 보내지 않는다', async () => {
    const fetchMock = procurement()
    await screen.findByLabelText('식재료 1 이름')
    await fillRow('쌀', 'kg', '10')
    await userEvent.click(screen.getByRole('button', { name: '식재료 추가' }))
    await userEvent.type(screen.getByLabelText('식재료 2 이름'), ' 쌀 ')
    await userEvent.type(screen.getByLabelText('식재료 2 단위'), 'KG')
    await userEvent.type(screen.getByLabelText('식재료 2 수량'), '20')

    await userEvent.click(screen.getByRole('button', { name: '발주 추천 실행' }))

    // 앞뒤 공백과 대소문자를 무시했을 때 같은 줄이다. 서버와 같은 기준이다.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '같은 식재료와 단위가 두 번 들어 있습니다.',
    )
    expect(fetchMock.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('같은 이름이라도 단위가 다르면 보낸다', async () => {
    const fetchMock = procurement()
    fetchMock.on('/api/v1/admin/procurement-recommendations', (call) =>
      call.method === 'POST' ? jsonResponse(envelope(RECOMMENDATION), 201) : jsonResponse(envelope([])),
    )
    await screen.findByLabelText('식재료 1 이름')
    await fillRow('쌀', 'kg', '40')
    await userEvent.click(screen.getByRole('button', { name: '식재료 추가' }))
    await userEvent.type(screen.getByLabelText('식재료 2 이름'), '쌀')
    await userEvent.type(screen.getByLabelText('식재료 2 단위'), '포')
    await userEvent.type(screen.getByLabelText('식재료 2 수량'), '3')

    await userEvent.click(screen.getByRole('button', { name: '발주 추천 실행' }))

    await waitFor(() => {
      const post = fetchMock.calls.find((call) => call.method === 'POST')
      // kg과 포를 여기서 환산하지 않는다.
      expect((post?.body as { plannedIngredients: unknown[] }).plannedIngredients).toEqual([
        { ingredientName: '쌀', unit: 'kg', plannedQuantity: 40 },
        { ingredientName: '쌀', unit: '포', plannedQuantity: 3 },
      ])
    })
  })

  it('발주 기준 인원이 없으면 무엇을 먼저 해야 하는지 알린다', async () => {
    const fetchMock = procurement()
    fetchMock.on('/api/v1/admin/procurement-recommendations', (call) =>
      call.method === 'POST'
        ? jsonResponse(errorEnvelope('DEMAND_PREDICTION_REQUIRED', '먼저 예측해 주세요.'), 409)
        : jsonResponse(envelope([])),
    )
    await screen.findByLabelText('식재료 1 이름')
    await fillRow('쌀', 'kg', '10')

    await userEvent.click(screen.getByRole('button', { name: '발주 추천 실행' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('같은 식당·날짜·식사 구분의 발주 기준 인원을 먼저 실행해야 합니다.')
    // 어디로 가야 하는지도 알려 준다.
    expect(screen.getByRole('link', { name: '발주 기준 인원 실행 화면으로 이동' })).toHaveAttribute(
      'href',
      expect.stringContaining('/demand?date='),
    )
  })

  it('서버가 준 추천 값을 그대로 보여 준다', async () => {
    procurement(RECOMMENDATION)

    expect(await screen.findByText('돼지고기')).toBeInTheDocument()
    const row = screen.getByText('돼지고기').closest('tr')!
    // 계획과 추천이 같다. 여기서 다시 계산하지 않는다.
    expect(row).toHaveTextContent('12.5')
    expect(row).toHaveTextContent('0.0%')
  })

  it('개발 환경 fixture 안내를 항상 보여 준다', async () => {
    procurement()

    // 추천 수량이 계획과 같은 것이 최적화 결과로 읽히면 안 된다.
    expect(await screen.findByRole('note')).toHaveTextContent('fixture 추천기')
  })

  it('결과가 없으면 빈 상태를 알린다', async () => {
    procurement([])

    expect(await screen.findByText('해당 조건의 추천 결과가 없습니다.')).toBeInTheDocument()
  })

  it('추천 서비스가 없으면 그대로 알린다', async () => {
    const fetchMock = procurement()
    fetchMock.on('/api/v1/admin/procurement-recommendations', (call) =>
      call.method === 'POST'
        ? jsonResponse(errorEnvelope('AI_SERVICE_UNAVAILABLE', 'x'), 503)
        : jsonResponse(envelope([])),
    )
    await screen.findByLabelText('식재료 1 이름')
    await fillRow('쌀', 'kg', '10')

    await userEvent.click(screen.getByRole('button', { name: '발주 추천 실행' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '추천 서비스를 현재 사용할 수 없습니다.',
    )
  })

  it('식재료를 하나도 넣지 않으면 보내지 않는다', async () => {
    const fetchMock = procurement()
    await screen.findByLabelText('식재료 1 이름')

    await userEvent.click(screen.getByRole('button', { name: '발주 추천 실행' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('식재료를 한 줄 이상 입력해 주세요.')
    expect(fetchMock.calls.some((call) => call.method === 'POST')).toBe(false)
  })
})
