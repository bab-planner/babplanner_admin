import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WasteSubmissionsPage } from '../features/wasteSubmissions/WasteSubmissionsPage'
import type { WasteSubmission } from '../api/types'
import { setAccessToken } from '../auth/session'
import {
  TEST_ACCESS_TOKEN,
  envelope,
  errorEnvelope,
  jsonResponse,
  mockFetch,
  renderWithProviders,
} from './helpers'

function submission(overrides: Partial<WasteSubmission> = {}): WasteSubmission {
  return {
    id: 7,
    userName: '김학생',
    userPhoneMasked: '010-****-5678',
    menuId: 3,
    menuName: '제육볶음',
    serviceDate: '2026-10-05',
    status: 'PENDING',
    earnedPoints: null,
    couponIssued: null,
    createdAt: '2026-10-05T03:00:00Z',
    capturedAt: null,
    reviewedAt: null,
    ...overrides,
  }
}

const PENDING = submission()
const APPROVED = submission({
  id: 8,
  userName: '이학생',
  userPhoneMasked: '010-****-1111',
  status: 'APPROVED',
  earnedPoints: 100,
})

function imageResponse(): Response {
  return new Response(new Blob(['png-bytes'], { type: 'image/png' }), {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  })
}

const createObjectURL = vi.fn(() => 'blob:photo-1')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  setAccessToken(TEST_ACCESS_TOKEN)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function setup(rows: WasteSubmission[] = [PENDING]) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/waste-submissions?', (call) => {
    const status = new URL(call.url, 'http://x').searchParams.get('status')
    return jsonResponse(envelope(status ? rows.filter((row) => row.status === status) : rows))
  })
  fetchMock.on('/api/v1/admin/waste-submissions/7/image', imageResponse())
  renderWithProviders(<WasteSubmissionsPage />, { withSites: false })
  return fetchMock
}

describe('잔반 인증 관리', () => {
  it('대기 중 목록을 기본으로 불러와 마스킹된 번호만 보여 준다', async () => {
    const fetchMock = setup([PENDING, APPROVED])

    expect(await screen.findByText('김학생')).toBeInTheDocument()
    expect(screen.getByText('010-****-5678')).toBeInTheDocument()
    expect(screen.getByText('제육볶음')).toBeInTheDocument()
    expect(screen.queryByText('이학생')).not.toBeInTheDocument()
    expect(fetchMock.calls[0]!.url).toContain('status=PENDING')
    expect(fetchMock.calls[0]!.url).toContain('limit=50')
  })

  it('탭을 바꾸면 해당 상태로 다시 조회하고 지급 포인트를 보여 준다', async () => {
    const fetchMock = setup([PENDING, APPROVED])
    await screen.findByText('김학생')

    await userEvent.click(screen.getByRole('tab', { name: '승인' }))
    const row = (await screen.findByText('이학생')).closest('tr')!
    expect(row).toHaveTextContent('100 P')
    expect(fetchMock.calls.some((call) => call.url.includes('status=APPROVED'))).toBe(true)

    await userEvent.click(screen.getByRole('tab', { name: '전체' }))
    await screen.findByText('김학생')
    const last = fetchMock.calls.filter((call) => call.url.includes('waste-submissions?')).at(-1)!
    expect(last.url).not.toContain('status=')
  })

  it('비어 있으면 안내를 보여 준다', async () => {
    setup([])
    expect(await screen.findByText('대기 중인 잔반 인증이 없습니다.')).toBeInTheDocument()
  })

  it('목록 오류는 서버 문구 없이 안내하고 다시 시도할 수 있다', async () => {
    const fetchMock = mockFetch()
    fetchMock.on(
      '/api/v1/admin/waste-submissions?',
      jsonResponse(errorEnvelope('INTERNAL', 'SQLException at Foo.java'), 500),
    )
    renderWithProviders(<WasteSubmissionsPage />, { withSites: false })

    expect(await screen.findByText('잔반 인증 목록을 불러오지 못했습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/SQLException/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(fetchMock.countOf('waste-submissions?')).toBe(2))
  })

  it('사진을 인증 헤더로 받아 보여 주고 닫으면 URL을 해제한다', async () => {
    const fetchMock = setup()
    await userEvent.click(await screen.findByRole('button', { name: '김학생 사진 보기' }))

    const img = await screen.findByAltText('김학생 님의 잔반 사진')
    expect(img).toHaveAttribute('src', 'blob:photo-1')
    const call = fetchMock.calls.find((c) => c.url.includes('/7/image'))!
    expect(call.headers.get('Authorization')).toBe(`Bearer ${TEST_ACCESS_TOKEN}`)

    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-1')
  })

  it('승인은 확인 후 POST approve를 보내고 목록을 다시 불러온다', async () => {
    const fetchMock = setup()
    fetchMock.on(
      '/api/v1/admin/waste-submissions/7/approve',
      jsonResponse(envelope({ ...PENDING, status: 'APPROVED', earnedPoints: 100 })),
    )
    await userEvent.click(await screen.findByRole('button', { name: '김학생 사진 보기' }))
    await screen.findByAltText('김학생 님의 잔반 사진')
    const before = fetchMock.countOf('waste-submissions?')

    await userEvent.click(screen.getByRole('button', { name: '승인' }))
    const confirm = screen.getByRole('dialog', { name: '이 잔반 인증을 승인할까요?' })
    expect(confirm).toHaveTextContent('100 포인트가 지급되고 되돌릴 수 없습니다')
    expect(fetchMock.countOf('/approve')).toBe(0)

    await userEvent.click(within(confirm).getByRole('button', { name: '승인하기' }))

    expect(await screen.findByText(/승인했습니다/)).toBeInTheDocument()
    const post = fetchMock.calls.find((c) => c.url.includes('/7/approve'))!
    expect(post.method).toBe('POST')
    await waitFor(() => expect(fetchMock.countOf('waste-submissions?')).toBeGreaterThan(before))
    // 승인된 인증은 더 처리할 수 없다.
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument()
  })

  it('거절은 확인 후 POST reject를 보낸다', async () => {
    const fetchMock = setup()
    fetchMock.on(
      '/api/v1/admin/waste-submissions/7/reject',
      jsonResponse(envelope({ ...PENDING, status: 'REJECTED' })),
    )
    await userEvent.click(await screen.findByRole('button', { name: '김학생 사진 보기' }))
    await screen.findByAltText('김학생 님의 잔반 사진')

    await userEvent.click(screen.getByRole('button', { name: '거절' }))
    const confirm = screen.getByRole('dialog', { name: '이 잔반 인증을 거절할까요?' })
    expect(confirm).toHaveTextContent('포인트가 지급되지 않습니다')
    await userEvent.click(within(confirm).getByRole('button', { name: '거절하기' }))

    expect(await screen.findByText(/거절했습니다/)).toBeInTheDocument()
    expect(fetchMock.calls.find((c) => c.url.includes('/7/reject'))!.method).toBe('POST')
  })

  it('이미 승인된 인증을 거절하면 409를 한국어로 안내한다', async () => {
    const fetchMock = setup()
    fetchMock.on(
      '/api/v1/admin/waste-submissions/7/reject',
      jsonResponse(
        errorEnvelope('WASTE_SUBMISSION_ALREADY_APPROVED', 'already approved: Exception'),
        409,
      ),
    )
    await userEvent.click(await screen.findByRole('button', { name: '김학생 사진 보기' }))
    await screen.findByAltText('김학생 님의 잔반 사진')
    await userEvent.click(screen.getByRole('button', { name: '거절' }))
    const confirm = screen.getByRole('dialog', { name: '이 잔반 인증을 거절할까요?' })
    await userEvent.click(within(confirm).getByRole('button', { name: '거절하기' }))

    expect(await screen.findByText('이미 승인된 인증은 거절할 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/Exception/)).not.toBeInTheDocument()
  })
})
