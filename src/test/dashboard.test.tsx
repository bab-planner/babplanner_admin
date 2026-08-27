import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import type { AdminDashboard } from '../api/types'
import {
  envelope,
  errorEnvelope,
  jsonResponse,
  mockFetch,
  renderWithProviders,
} from './helpers'

const EMPTY: AdminDashboard = {
  todayPredictedPeople: null,
  tomorrowPredictedPeople: null,
  currentCongestion: null,
  wasteSummary: { totalSubmissions: 0, averageWasteRate: null, repeatedWasteMenuCount: null },
  procurementPreview: [],
}

function show(dashboard: Partial<AdminDashboard>) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope([{ id: 1, name: '학생식당' }])))
  fetchMock.on('/api/v1/admin/dashboard', jsonResponse(envelope({ ...EMPTY, ...dashboard })))
  renderWithProviders(<DashboardPage />)
  return fetchMock
}

describe('대시보드 조회 상태', () => {
  it('불러오는 동안 상태를 알린다', () => {
    const fetchMock = mockFetch()
    fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope([{ id: 1, name: '학생식당' }])))
    fetchMock.on('/api/v1/admin/dashboard', jsonResponse(envelope(EMPTY)))

    renderWithProviders(<DashboardPage />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('실패하면 오류로 알린다', async () => {
    const fetchMock = mockFetch()
    fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope([{ id: 1, name: '학생식당' }])))
    fetchMock.on('/api/v1/admin/dashboard', jsonResponse(errorEnvelope('INTERNAL_ERROR', '서버 오류'), 500))

    renderWithProviders(<DashboardPage />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('현재 혼잡도', () => {
  it('저장된 값을 보여 준다', async () => {
    show({
      currentCongestion: {
        siteId: 1,
        peopleCount: 42,
        level: 'CROWDED',
        displayMessage: '10분 이내',
        observedAt: '2026-09-15T02:00:00Z',
        source: 'CCTV_AI',
      },
    })

    expect(await screen.findByText('혼잡')).toBeInTheDocument()
    expect(screen.getByText(/42명/)).toBeInTheDocument()
  })

  it('혼잡도가 없으면 임의 단계를 만들지 않는다', async () => {
    show({ currentCongestion: null })

    expect(await screen.findByText('혼잡도 데이터 없음')).toBeInTheDocument()
    // 관측이 없다는 것과 여유롭다는 것은 다른 말이다.
    expect(screen.queryByText('보통')).not.toBeInTheDocument()
    expect(screen.queryByText('여유')).not.toBeInTheDocument()
  })
})

describe('잔반 요약', () => {
  it('평균 잔반률을 백분율로 보여 준다', async () => {
    show({
      wasteSummary: {
        totalSubmissions: 12,
        averageWasteRate: 0.1833333333,
        repeatedWasteMenuCount: null,
      },
    })

    expect(await screen.findByText('18.3%')).toBeInTheDocument()
  })

  it('표본이 없으면 0%로 표시하지 않는다', async () => {
    show({
      wasteSummary: { totalSubmissions: 0, averageWasteRate: null, repeatedWasteMenuCount: null },
    })

    expect(await screen.findByText('데이터 없음')).toBeInTheDocument()
    // 0%는 "아무도 남기지 않았다"로 읽힌다.
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('반복 잔반 메뉴 수를 0으로 만들지 않는다', async () => {
    show({
      wasteSummary: { totalSubmissions: 3, averageWasteRate: 0.2, repeatedWasteMenuCount: null },
    })

    // 판정 기준이 정해지지 않았다. 0개라고 하면 "그런 메뉴가 없다"가 된다.
    expect(await screen.findByText(/판정 기준 미확정/)).toBeInTheDocument()
    expect(screen.queryByText(/반복 잔반 메뉴 0개/)).not.toBeInTheDocument()
  })
})

describe('예상 식수', () => {
  it('예측이 없으면 0명으로 표시하지 않는다', async () => {
    show({ todayPredictedPeople: null, tomorrowPredictedPeople: null })

    expect(await screen.findByText(/예측 데이터 없음/)).toBeInTheDocument()
    expect(screen.queryByText('0명')).not.toBeInTheDocument()
  })

  it('식사별 화면으로 가는 길을 준다', async () => {
    show({})

    // 대시보드가 어느 끼니를 대표할지 정해지지 않았다. 대신 식사별 화면을
    // 안내한다.
    expect(await screen.findByRole('link', { name: '식사별 예상 식수 보기' })).toHaveAttribute(
      'href',
      '/demand',
    )
  })

  it('서버가 값을 주면 그대로 보여 준다', async () => {
    show({ todayPredictedPeople: 128, tomorrowPredictedPeople: 96 })

    expect(await screen.findByText('128명')).toBeInTheDocument()
    expect(screen.getByText('96명')).toBeInTheDocument()
  })
})

describe('발주 추천 미리보기', () => {
  it('비어 있으면 0kg 추천처럼 보이지 않는다', async () => {
    show({ procurementPreview: [] })

    expect(await screen.findByText('추천 데이터 없음')).toBeInTheDocument()
    expect(screen.queryByText(/0 kg/)).not.toBeInTheDocument()
  })

  it('항목이 있으면 서버 값을 그대로 보여 준다', async () => {
    show({
      procurementPreview: [
        {
          ingredientName: '돼지고기',
          unit: 'kg',
          plannedQuantity: 12.5,
          recommendedQuantity: 12.5,
          adjustmentRate: 0,
          reason: null,
        },
      ],
    })

    expect(await screen.findByText('돼지고기 12.5 kg')).toBeInTheDocument()
  })
})

describe('예시 숫자', () => {
  it('데이터가 비어도 초안의 숫자가 뜨지 않는다', async () => {
    show({})
    await screen.findByText('혼잡도 데이터 없음')

    // 과거 화면설계서에 있던 값이다.
    for (const sample of ['528', '370', '18%']) {
      expect(screen.queryByText(new RegExp(sample))).not.toBeInTheDocument()
    }
  })
})
