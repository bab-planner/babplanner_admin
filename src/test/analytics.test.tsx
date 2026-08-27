import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CongestionPage } from '../features/congestion/CongestionPage'
import { WastePage } from '../features/waste/WastePage'
import type { Congestion, MenuWaste, WasteSummary } from '../api/types'
import { envelope, jsonResponse, mockFetch, renderWithProviders } from './helpers'

const SITES = [{ id: 3, name: '학생식당' }]

const OBSERVATIONS: Congestion[] = [
  {
    siteId: 3,
    peopleCount: 10,
    level: 'COMFORTABLE',
    displayMessage: '바로 이용 가능',
    observedAt: '2026-09-15T02:00:00Z',
    source: 'CCTV_AI',
  },
  {
    siteId: 3,
    peopleCount: 90,
    level: 'CROWDED',
    displayMessage: null,
    observedAt: '2026-09-15T02:30:00Z',
    source: 'CCTV_AI',
  },
]

function congestion(rows: Congestion[] = OBSERVATIONS) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope(SITES)))
  fetchMock.on('/api/v1/admin/congestion/timeseries', jsonResponse(envelope(rows)))
  renderWithProviders(<CongestionPage />)
  return fetchMock
}

describe('혼잡도 분석', () => {
  it('기간을 지정해 조회한다', async () => {
    const fetchMock = congestion()

    await userEvent.click(await screen.findByRole('button', { name: '조회' }))

    await waitFor(() =>
      expect(
        fetchMock.calls.some((call) => call.url.includes('/api/v1/admin/congestion/timeseries')),
      ).toBe(true),
    )
    const call = fetchMock.calls.find((entry) => entry.url.includes('timeseries'))!
    // 지역 시각을 그대로 보내면 서버가 다른 순간으로 읽는다.
    expect(call.url).toMatch(/from=.*(Z|%3A00)/)
  })

  it('시작이 종료보다 늦으면 보내지 않는다', async () => {
    const fetchMock = congestion()
    await screen.findByRole('button', { name: '조회' })

    const from = screen.getByLabelText('시작')
    const to = screen.getByLabelText('종료')
    await userEvent.clear(from)
    await userEvent.type(from, '2026-09-16T10:00')
    await userEvent.clear(to)
    await userEvent.type(to, '2026-09-15T10:00')
    await userEvent.click(screen.getByRole('button', { name: '조회' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('시작 시각이 종료 시각보다 늦습니다.')
    expect(fetchMock.calls.some((call) => call.url.includes('timeseries'))).toBe(false)
  })

  it('관측을 원본 그대로 표에 보여 준다', async () => {
    congestion()
    await userEvent.click(await screen.findByRole('button', { name: '조회' }))

    expect(await screen.findByText('여유')).toBeInTheDocument()
    expect(screen.getByText('혼잡')).toBeInTheDocument()
    expect(screen.getByText('10명')).toBeInTheDocument()
    expect(screen.getByText('90명')).toBeInTheDocument()
    expect(screen.getAllByText('CCTV_AI')).toHaveLength(2)
  })

  it('구간 평균이나 보간값을 만들지 않는다', async () => {
    congestion()
    await userEvent.click(await screen.findByRole('button', { name: '조회' }))
    await screen.findByText('여유')

    // 서버가 준 두 건 그대로다. 사이를 메우면 없던 관측이 생긴다.
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(OBSERVATIONS.length + 1)
    expect(screen.queryByText('50명')).not.toBeInTheDocument()
  })

  it('인원이 없는 관측을 0으로 만들지 않는다', async () => {
    congestion([{ ...OBSERVATIONS[0]!, peopleCount: null }])
    await userEvent.click(await screen.findByRole('button', { name: '조회' }))

    expect(await screen.findByText('여유')).toBeInTheDocument()
    expect(screen.queryByText('0명')).not.toBeInTheDocument()
  })

  it('관측이 없으면 빈 상태를 알린다', async () => {
    congestion([])
    await userEvent.click(await screen.findByRole('button', { name: '조회' }))

    expect(await screen.findByText('해당 기간에 관측이 없습니다.')).toBeInTheDocument()
  })
})

const SUMMARY: WasteSummary = {
  totalSubmissions: 12,
  averageWasteRate: 0.1833333333,
  repeatedWasteMenuCount: null,
}

const BY_MENU: MenuWaste[] = [
  { menuId: 2, menuName: '고등어구이', averageWasteRate: 0.8, sampleCount: 5 },
  { menuId: 1, menuName: '샐러드', averageWasteRate: 0.1, sampleCount: 9 },
]

function waste(summary: WasteSummary = SUMMARY, byMenu: MenuWaste[] = BY_MENU) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope(SITES)))
  fetchMock.on('/api/v1/admin/waste/summary', jsonResponse(envelope(summary)))
  fetchMock.on('/api/v1/admin/waste/by-menu', jsonResponse(envelope(byMenu)))
  renderWithProviders(<WastePage />)
  return fetchMock
}

describe('잔반 분석', () => {
  it('요약을 보여 준다', async () => {
    waste()

    expect(await screen.findByText('18.3%')).toBeInTheDocument()
    expect(screen.getByText('12건')).toBeInTheDocument()
  })

  it('0~1 값을 표시할 때만 백분율로 바꾼다', async () => {
    waste({ ...SUMMARY, averageWasteRate: 0.1833333333 })

    // 원 데이터를 자르지 않는다. 보이는 자리만 줄인다.
    expect(await screen.findByText('18.3%')).toBeInTheDocument()
    expect(screen.queryByText('0.1833333333')).not.toBeInTheDocument()
  })

  it('표본이 없으면 0%로 표시하지 않는다', async () => {
    waste({ totalSubmissions: 0, averageWasteRate: null, repeatedWasteMenuCount: null }, [])

    expect(await screen.findByText('데이터 없음')).toBeInTheDocument()
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
  })

  it('반복 잔반 메뉴 기준이 없다는 것을 그대로 알린다', async () => {
    waste()

    expect(await screen.findByText('판정 기준 미확정')).toBeInTheDocument()
  })

  it('메뉴별 결과를 서버 정렬 그대로 보여 준다', async () => {
    waste()
    await screen.findByText('고등어구이')

    const rows = screen.getAllByRole('row')
    // 잔반률이 높은 것부터. 여기서 다시 정렬하거나 분류하지 않는다.
    expect(rows[1]).toHaveTextContent('고등어구이')
    expect(rows[2]).toHaveTextContent('샐러드')
    expect(screen.getByText('80.0%')).toBeInTheDocument()
    expect(screen.getByText('10.0%')).toBeInTheDocument()
  })

  it('문제 메뉴 같은 자체 분류를 만들지 않는다', async () => {
    waste()
    await screen.findByText('고등어구이')

    for (const label of ['문제 메뉴', '정상 메뉴', '주의']) {
      expect(screen.queryByText(new RegExp(label))).not.toBeInTheDocument()
    }
  })

  it('시작일이 종료일보다 늦으면 막는다', async () => {
    const fetchMock = waste()
    await screen.findByText('18.3%')
    const before = fetchMock.countOf('/api/v1/admin/waste/summary')

    const from = screen.getByLabelText('시작일')
    await userEvent.clear(from)
    await userEvent.type(from, '2030-01-01')
    await userEvent.click(screen.getByRole('button', { name: '조회' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('시작일이 종료일보다 늦습니다.')
    expect(fetchMock.countOf('/api/v1/admin/waste/summary')).toBe(before)
  })
})
