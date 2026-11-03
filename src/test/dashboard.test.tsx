import { describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import { CONGESTION_FRESHNESS_MS, DashboardPage, isDemoMode, isFreshCongestion } from '../features/dashboard/DashboardPage'
import type { AdminDashboard, MenuWaste } from '../api/types'
import {
  envelope,
  errorEnvelope,
  jsonResponse,
  mockFetch,
  renderWithProviders,
} from './helpers'

const EMPTY: AdminDashboard = {
  currentCongestion: null,
  wasteSummary: { totalSubmissions: 0, averageWasteRate: null, repeatedWasteMenuCount: null },
}

function show(dashboard: Partial<AdminDashboard>, wasteRows: MenuWaste[] = []) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope([{ id: 1, name: '학생식당' }])))
  fetchMock.on('/api/v1/admin/dashboard', jsonResponse(envelope({ ...EMPTY, ...dashboard })))
  fetchMock.on('/api/v1/admin/waste/by-menu', jsonResponse(envelope(wasteRows)))
  // 현재 혼잡도는 공개 endpoint를 따로 읽는다. 대시보드가 준 값과 같은
  // 저장 현재값이므로 여기서도 같은 것을 돌려준다.
  const current = { ...EMPTY, ...dashboard }.currentCongestion
  fetchMock.on(
    '/api/v1/congestion/current',
    current
      ? jsonResponse(envelope(current))
      : jsonResponse(errorEnvelope('CONGESTION_NOT_AVAILABLE', '관측이 없습니다.'), 404),
  )
  // 맨 위 식수 예측 카드가 처음 한 번 모델 상태를 읽는다.
  fetchMock.on(
    '/api/v1/admin/demand-forecasts/status',
    jsonResponse(
      envelope({
        available: true,
        modelLoaded: true,
        historyAvailable: true,
        modelName: 'lightgbm',
        modelVersion: '54453980807e',
        syntheticData: true,
        trainingPeriod: ['2023-03-13', '2026-09-11'],
        reason: null,
        warnings: [],
      }),
    ),
  )
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

describe('시연 모드', () => {
  it('true에서만 시연용 표기를 켜며 API를 Mock으로 전환하지 않는다', () => {
    expect(isDemoMode('true')).toBe(true)
    expect(isDemoMode('false')).toBe(false)
    expect(isDemoMode(undefined)).toBe(false)
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
        observedAt: new Date().toISOString(),
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

describe('혼잡도 관측 신선도', () => {
  const now = Date.parse('2026-11-04T03:00:00Z')

  it('15분 이내만 현재 관측으로 인정하고 미래·잘못된 시각은 제외한다', () => {
    expect(isFreshCongestion(new Date(now - CONGESTION_FRESHNESS_MS).toISOString(), now)).toBe(true)
    expect(isFreshCongestion(new Date(now - CONGESTION_FRESHNESS_MS - 1).toISOString(), now)).toBe(false)
    expect(isFreshCongestion(new Date(now + 1).toISOString(), now)).toBe(false)
    expect(isFreshCongestion('not-a-date', now)).toBe(false)
  })

  it('오래된 시연 관측은 마지막 기록으로만 표시한다', async () => {
    show({ currentCongestion: { siteId: 1, peopleCount: 6, level: 'COMFORTABLE', displayMessage: null, observedAt: '2026-11-03T05:00:00Z', source: 'DEMO_SEED' } })

    expect(await screen.findByText('현재 혼잡 정보 없음')).toBeInTheDocument()
    expect(screen.getByText(/마지막 기록: 여유 · 6명 · 시연용 관측 데이터/)).toBeInTheDocument()
    expect(screen.queryByText(/관측 인원 6명/)).not.toBeInTheDocument()
  })
})

describe('현재 혼잡도 실시간 갱신', () => {
  const BASE = {
    siteId: 1,
    peopleCount: 3,
    level: 'COMFORTABLE' as const,
    displayMessage: null,
    observedAt: new Date().toISOString(),
    source: 'CCTV_AI',
  }

  it('공개 현재 혼잡도 endpoint를 읽는다', async () => {
    const fetchMock = show({ currentCongestion: BASE })

    await screen.findByText('여유')

    const asked = fetchMock.calls.filter((call) =>
      call.url.includes('/api/v1/congestion/current'),
    )
    expect(asked.length).toBeGreaterThan(0)
    expect(asked[0]!.url).toContain('siteId=1')
    // 수집 경로는 브라우저가 부르지 않는다.
    expect(fetchMock.calls.every((call) => !call.url.includes('/internal/v1'))).toBe(true)
  })

  it('현재 인원만 주기적으로 다시 읽고 대시보드 전체는 다시 부르지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const fetchMock = mockFetch()
      fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope([{ id: 1, name: '학생식당' }])))
      fetchMock.on(
        '/api/v1/admin/dashboard',
        jsonResponse(envelope({ ...EMPTY, currentCongestion: BASE })),
      )
      fetchMock.on('/api/v1/congestion/current', (_call, index) =>
        jsonResponse(
          envelope(
            index === 0
              ? BASE
              : { ...BASE, peopleCount: 21, level: 'VERY_CROWDED', observedAt: new Date().toISOString() },
          ),
        ),
      )
      renderWithProviders(<DashboardPage />)

      expect(await screen.findByText('여유')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })

      expect(await screen.findByText('매우 혼잡')).toBeInTheDocument()
      expect(screen.getByText(/21명/)).toBeInTheDocument()
      // 잔반·혼잡도 요약까지 같은 주기로 다시 부르지 않는다.
      expect(fetchMock.countOf('/api/v1/admin/dashboard')).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('현재값 조회가 실패해도 대시보드가 준 값으로 버틴다', async () => {
    const fetchMock = mockFetch()
    fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope([{ id: 1, name: '학생식당' }])))
    fetchMock.on(
      '/api/v1/admin/dashboard',
      jsonResponse(envelope({ ...EMPTY, currentCongestion: { ...BASE, level: 'NORMAL' } })),
    )
    fetchMock.on(
      '/api/v1/congestion/current',
      jsonResponse(errorEnvelope('INTERNAL_ERROR', '서버 오류'), 500),
    )
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText('보통')).toBeInTheDocument()
  })

  it('인원수로 단계를 다시 계산하지 않는다', async () => {
    // 서버가 인원 3명에 VERY_CROWDED를 줬다. 화면은 서버 판정을 그대로 쓴다.
    show({ currentCongestion: { ...BASE, peopleCount: 3, level: 'VERY_CROWDED' } })

    expect(await screen.findByText('매우 혼잡')).toBeInTheDocument()
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

  it('반복 잔반 메뉴 수를 지어내지 않는다', async () => {
    show({
      wasteSummary: { totalSubmissions: 3, averageWasteRate: 0.2, repeatedWasteMenuCount: null },
    })
    await screen.findByText('20.0%')

    // Figma 대시보드에 이 지표가 없어 여기서는 보여 주지 않는다. 판정 기준도
    // 정해지지 않았다. 0개라고 하면 "그런 메뉴가 없다"가 된다.
    expect(screen.queryByText(/반복 잔반 메뉴/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0개/)).not.toBeInTheDocument()
  })
})

describe('메뉴별 잔반률 차트', () => {
  it('API 값에서 높은 순 상위 10개만, 정확한 비율과 표본으로 안내한다', async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      menuId: index + 1,
      menuName: index === 10 ? '아주 긴 한글 메뉴 이름은 말줄임으로 표시됩니다 정식' : `메뉴 ${index + 1}`,
      averageWasteRate: (11 - index) / 100,
      sampleCount: index + 2,
    })).reverse()
    show({}, rows)

    expect(await screen.findByText('상위 10개 / 전체 11개')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '메뉴별 잔반률 목록' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    expect(list).toHaveTextContent('메뉴 1: 11.0%, 표본 2건')
    expect(list).not.toHaveTextContent('아주 긴 한글 메뉴 이름')
    expect(screen.getByRole('link', { name: '전체 메뉴 보기' })).toHaveAttribute('href', '/analytics/waste')
  })
})

describe('식수 예측은 하나다', () => {
  it('예전 "예상 식수" 패널이 없고, 식수 예측 영역은 맨 위 카드 하나다', async () => {
    show({})

    await screen.findByRole('region', { name: '중식 예상 인원' })

    // 이름 있는 영역(region) 가운데 예측 카드는 하나다.
    expect(screen.getAllByRole('region', { name: /예상/ })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: '예상 식수' })).not.toBeInTheDocument()
    expect(screen.queryByText('오늘 예상 식수')).not.toBeInTheDocument()
    expect(screen.queryByText('내일 예상 식수')).not.toBeInTheDocument()
    expect(screen.queryByText(/예측 데이터 없음/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '예측 실행' })).not.toBeInTheDocument()
  })

  it('예측이 없으면 0명으로 표시하지 않는다', async () => {
    show({})

    await screen.findByRole('region', { name: '중식 예상 인원' })
    expect(screen.queryByText('0명')).not.toBeInTheDocument()
  })

})

describe('맨 위 AI 영역', () => {
  it('식수 예측과 현재 혼잡도가 맨 위에 나란히, 서로 다른 카드로 있다', async () => {
    show({
      currentCongestion: {
        siteId: 1,
        peopleCount: 42,
        level: 'CROWDED',
        displayMessage: null,
        observedAt: new Date().toISOString(),
        source: 'CCTV_AI',
      },
    })

    const forecast = await screen.findByRole('region', { name: '중식 예상 인원' })
    await screen.findByText('혼잡')

    const top = forecast.parentElement!
    expect(top).toHaveClass('dash-top')
    // 대시보드 제목(sr-only) 바로 다음, 맨 위다.
    expect(top.parentElement?.firstElementChild?.nextElementSibling).toBe(top)

    const congestion = within(top)
      .getByRole('heading', { name: '현재 식당 혼잡도' })
      .closest('section')!
    expect(forecast.contains(congestion)).toBe(false)
    expect(congestion).toHaveTextContent('관측 인원 42명')

    // 두 AI 결과를 한 카드로 합치지 않는다. 예측 카드에 혼잡도 설명이 없다.
    expect(forecast).not.toHaveTextContent('혼잡')
    expect(forecast).not.toHaveTextContent('CCTV')
  })

  it('예측을 실행하기 전에는 숫자 없이 조건만 보인다', async () => {
    show({})

    const forecast = await screen.findByRole('region', { name: '중식 예상 인원' })
    expect(
      await within(forecast).findByText(/누르면 예상 인원이 표시됩니다/),
    ).toBeInTheDocument()
    expect(within(forecast).getByText('양식 / 돈까스')).toBeInTheDocument()
    expect(forecast).not.toHaveTextContent(/\d+명/)
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
