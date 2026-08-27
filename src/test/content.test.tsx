import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NoticesPage } from '../features/notices/NoticesPage'
import { SurveysPage } from '../features/surveys/SurveysPage'
import { InquiriesPage } from '../features/inquiries/InquiriesPage'
import type { Inquiry, Notice, Survey, SurveyResult } from '../api/types'
import {
  emptyResponse,
  envelope,
  errorEnvelope,
  jsonResponse,
  mockFetch,
  renderWithProviders,
} from './helpers'

const NOTICES: Notice[] = [
  {
    id: 1,
    title: '휴무 안내',
    content: '월요일 휴무입니다.',
    important: true,
    published: true,
    publishedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 2,
    title: '작성 중인 공지',
    content: '초안',
    important: false,
    published: false,
    publishedAt: '2026-09-02T00:00:00Z',
  },
]

function notices(rows: Notice[] = NOTICES) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/notices', jsonResponse(envelope(rows)))
  renderWithProviders(<NoticesPage />, { withSites: false })
  return fetchMock
}

describe('공지 관리', () => {
  it('공개 여부를 명확히 보여 준다', async () => {
    notices()

    expect(await screen.findByText('휴무 안내')).toBeInTheDocument()
    // 관리 목록에는 비공개 공지도 있다. 어느 것이 사용자에게 보이는지
    // 목록에서 바로 읽혀야 한다. '공개'는 표 머리글에도 있으므로 각 행을 본다.
    expect(screen.getByText('휴무 안내').closest('tr')).toHaveTextContent('공개')
    expect(screen.getByText('작성 중인 공지').closest('tr')).toHaveTextContent('비공개')
  })

  it('네 필드를 그대로 보낸다', async () => {
    const fetchMock = notices()
    fetchMock.on('/api/v1/admin/notices', (call) =>
      call.method === 'POST' ? jsonResponse(envelope(NOTICES[0]), 201) : jsonResponse(envelope(NOTICES)),
    )
    await screen.findByText('휴무 안내')
    await userEvent.click(screen.getByRole('button', { name: '공지 등록' }))

    await userEvent.type(await screen.findByLabelText('제목'), '새 공지')
    await userEvent.type(screen.getByLabelText('내용'), '본문')
    await userEvent.click(screen.getByRole('checkbox', { name: '중요 공지' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const post = fetchMock.calls.find((call) => call.method === 'POST')
      expect(post?.body).toEqual({
        title: '새 공지',
        content: '본문',
        important: true,
        published: true,
      })
      // publishedAt은 서버가 정한다.
      expect(post?.body).not.toHaveProperty('publishedAt')
    })
  })

  it('공개 여부를 끄고 저장할 수 있다', async () => {
    const fetchMock = notices()
    fetchMock.on('/api/v1/admin/notices/2', jsonResponse(envelope(NOTICES[1])))
    await screen.findByText('작성 중인 공지')

    const row = screen.getByText('작성 중인 공지').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '수정' }))

    expect(await screen.findByRole('checkbox', { name: '공개' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: '공개' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const put = fetchMock.calls.find((call) => call.method === 'PUT')
      expect(put?.body).toMatchObject({ published: true })
    })
  })

  it('삭제 전에 확인한다', async () => {
    const fetchMock = notices()
    fetchMock.on('/api/v1/admin/notices/1', emptyResponse())
    await screen.findByText('휴무 안내')

    const row = screen.getByText('휴무 안내').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '삭제' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() =>
      expect(fetchMock.calls.some((call) => call.method === 'DELETE')).toBe(true),
    )
  })
})

const SURVEY: Survey = {
  id: 5,
  title: '9월 만족도 조사',
  description: null,
  startsAt: '2026-09-01T00:00:00Z',
  endsAt: '2026-09-30T00:00:00Z',
  questions: [
    { id: 51, text: '메뉴에 만족하시나요?', type: 'SINGLE_CHOICE', required: true, options: ['예', '아니오'] },
    { id: 52, text: '전반적인 점수', type: 'SCALE', required: true, options: null },
    { id: 53, text: '개선 의견', type: 'TEXT', required: false, options: null },
  ],
}

const RESULT: SurveyResult = {
  surveyId: 5,
  responseCount: 7,
  questionResults: [
    { questionId: 51, summary: { responseCount: 7, optionCounts: { 예: 5, 아니오: 2 } } },
    { questionId: 52, summary: { responseCount: 7, average: 4.25, distribution: { '4': 3, '5': 4 } } },
    { questionId: 53, summary: { responseCount: 2, responses: ['더 맵게 해주세요'] } },
  ],
}

function surveys(rows: Survey[] = [SURVEY]) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/surveys', jsonResponse(envelope(rows)))
  fetchMock.on('/api/v1/admin/surveys/5/results', jsonResponse(envelope(RESULT)))
  renderWithProviders(<SurveysPage />, { withSites: false })
  return fetchMock
}

describe('설문 관리', () => {
  it('목록을 보여 주고 수정/삭제 버튼은 만들지 않는다', async () => {
    surveys()

    expect(await screen.findByText('9월 만족도 조사')).toBeInTheDocument()
    // 서버에 수정과 삭제 API가 없다.
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('네 가지 문항 유형만 고를 수 있다', async () => {
    surveys()
    await screen.findByText('9월 만족도 조사')
    await userEvent.click(screen.getByRole('button', { name: '설문 등록' }))

    const select = await screen.findByLabelText('유형')
    const options = within(select).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['단일 선택', '복수 선택', '척도', '주관식'])
  })

  it('문항에 id를 보내지 않는다', async () => {
    const fetchMock = surveys()
    fetchMock.on('/api/v1/admin/surveys', (call) =>
      call.method === 'POST' ? jsonResponse(envelope(SURVEY), 201) : jsonResponse(envelope([SURVEY])),
    )
    await screen.findByText('9월 만족도 조사')
    await userEvent.click(screen.getByRole('button', { name: '설문 등록' }))

    await userEvent.type(await screen.findByLabelText('제목'), '10월 조사')
    await userEvent.type(screen.getByLabelText('시작 시각'), '2026-10-01T09:00')
    await userEvent.type(screen.getByLabelText('종료 시각'), '2026-10-31T09:00')
    await userEvent.type(screen.getByLabelText('내용'), '맛은 어떤가요?')
    await userEvent.type(screen.getByLabelText('문항 1 선택지 1'), '좋음')
    await userEvent.type(screen.getByLabelText('문항 1 선택지 2'), '나쁨')
    await userEvent.click(screen.getByRole('button', { name: '설문 등록' }))

    await waitFor(() => {
      const post = fetchMock.calls.find((call) => call.method === 'POST')
      const body = post?.body as { questions: Record<string, unknown>[] }
      // 클라이언트가 DB 키를 정하면 다른 설문의 문항을 덮어쓸 수 있다.
      expect(body.questions[0]).not.toHaveProperty('id')
      expect(body.questions[0]).toMatchObject({
        text: '맛은 어떤가요?',
        type: 'SINGLE_CHOICE',
        options: ['좋음', '나쁨'],
      })
    })
  })

  it('선택형 문항에 선택지가 둘 미만이면 보내지 않는다', async () => {
    const fetchMock = surveys()
    await screen.findByText('9월 만족도 조사')
    await userEvent.click(screen.getByRole('button', { name: '설문 등록' }))

    await userEvent.type(await screen.findByLabelText('제목'), '조사')
    await userEvent.type(screen.getByLabelText('시작 시각'), '2026-10-01T09:00')
    await userEvent.type(screen.getByLabelText('종료 시각'), '2026-10-31T09:00')
    await userEvent.type(screen.getByLabelText('내용'), '문항')
    await userEvent.type(screen.getByLabelText('문항 1 선택지 1'), '하나뿐')
    await userEvent.click(screen.getByRole('button', { name: '설문 등록' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '선택형 문항은 선택지가 두 개 이상이어야 합니다.',
    )
    expect(fetchMock.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('유형마다 다른 결과 모양을 그대로 읽는다', async () => {
    surveys()
    await screen.findByText('9월 만족도 조사')
    await userEvent.click(screen.getByRole('button', { name: '결과 보기' }))

    // 응답한 사람 수다. 답변 개수가 아니다.
    expect(await screen.findByText(/응답한 사람 7명/)).toBeInTheDocument()
    expect(screen.getByText('예 — 5명')).toBeInTheDocument()
    expect(screen.getByText(/평균 4.25/)).toBeInTheDocument()
    expect(screen.getByText('더 맵게 해주세요')).toBeInTheDocument()
  })

  it('결과에서 응답자를 찾으려 하지 않는다', async () => {
    surveys()
    await screen.findByText('9월 만족도 조사')
    await userEvent.click(screen.getByRole('button', { name: '결과 보기' }))
    await screen.findByText('더 맵게 해주세요')

    // API에 없는 것이 정상이다. 화면이 만들어 내지 않는다.
    for (const label of ['작성자', '학번', '휴대폰']) {
      expect(screen.queryByText(new RegExp(label))).not.toBeInTheDocument()
    }
  })
})

const INQUIRIES: Inquiry[] = [
  {
    id: 9,
    category: 'MENU',
    title: '메뉴 문의',
    content: '내일 메뉴가 궁금합니다.',
    status: 'RECEIVED',
    adminAnswer: null,
    createdAt: '2026-09-10T02:00:00Z',
    answeredAt: null,
  },
  {
    id: 10,
    category: 'FACILITY',
    title: '시설 건의',
    content: '의자가 흔들립니다.',
    status: 'ANSWERED',
    adminAnswer: '확인했습니다.',
    createdAt: '2026-09-09T02:00:00Z',
    answeredAt: '2026-09-09T05:00:00Z',
  },
]

function inquiries(rows: Inquiry[] = INQUIRIES) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/inquiries', jsonResponse(envelope(rows)))
  renderWithProviders(<InquiriesPage />, { withSites: false })
  return fetchMock
}

describe('문의 관리', () => {
  it('상태로 거를 수 있다', async () => {
    const fetchMock = inquiries()
    await screen.findByText('메뉴 문의')

    await userEvent.selectOptions(screen.getByLabelText('상태'), 'ANSWERED')

    await waitFor(() =>
      expect(fetchMock.calls.some((call) => call.url.includes('status=ANSWERED'))).toBe(true),
    )
  })

  it('상세에서 실제 필드를 보여 준다', async () => {
    inquiries()
    await screen.findByText('메뉴 문의')

    const row = screen.getByText('시설 건의').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '상세' }))

    expect(await screen.findByText('의자가 흔들립니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('답변')).toHaveValue('확인했습니다.')
  })

  it('답변만 바꾸면 상태를 보내지 않는다', async () => {
    const fetchMock = inquiries()
    fetchMock.on('/api/v1/admin/inquiries/9', jsonResponse(envelope(INQUIRIES[0])))
    await screen.findByText('메뉴 문의')

    const row = screen.getByText('메뉴 문의').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '상세' }))
    await userEvent.type(await screen.findByLabelText('답변'), '내일은 김치찌개입니다.')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const patch = fetchMock.calls.find((call) => call.method === 'PATCH')
      expect(patch?.body).toEqual({ adminAnswer: '내일은 김치찌개입니다.' })
      // 답변을 썼다고 상태를 자동으로 ANSWERED로 바꾸지 않는다.
      expect(patch?.body).not.toHaveProperty('status')
    })
  })

  it('상태만 바꾸면 답변을 보내지 않는다', async () => {
    const fetchMock = inquiries()
    fetchMock.on('/api/v1/admin/inquiries/10', jsonResponse(envelope(INQUIRIES[1])))
    await screen.findByText('시설 건의')

    const row = screen.getByText('시설 건의').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '상세' }))
    // 목록 필터에도 '상태' 라벨이 있다. 상세 패널 안을 본다.
    const panel = (await screen.findByLabelText('답변')).closest('section')!
    await userEvent.selectOptions(within(panel).getByLabelText('상태'), 'CLOSED')
    await userEvent.click(within(panel).getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const patch = fetchMock.calls.find((call) => call.method === 'PATCH')
      // 필드를 안 보내면 답변은 그대로 남는다.
      expect(patch?.body).toEqual({ status: 'CLOSED' })
    })
  })

  it('답변 삭제는 null을 명시한다', async () => {
    const fetchMock = inquiries()
    fetchMock.on('/api/v1/admin/inquiries/10', jsonResponse(envelope(INQUIRIES[1])))
    await screen.findByText('시설 건의')

    const row = screen.getByText('시설 건의').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '상세' }))
    await userEvent.click(await screen.findByRole('button', { name: '답변 삭제' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => {
      const patch = fetchMock.calls.find((call) => call.method === 'PATCH')
      // 필드를 빼면 그대로 남는다. null을 명시해야 지워진다.
      expect(patch?.body).toEqual({ adminAnswer: null })
    })
  })

  it('바뀐 것이 없으면 빈 PATCH를 보내지 않는다', async () => {
    const fetchMock = inquiries()
    await screen.findByText('메뉴 문의')

    const row = screen.getByText('메뉴 문의').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '상세' }))
    await userEvent.click(await screen.findByRole('button', { name: '저장' }))

    // 서버는 빈 PATCH를 422로 거절한다. 굳이 보내지 않는다.
    expect(await screen.findByRole('alert')).toHaveTextContent('변경한 내용이 없습니다.')
    expect(fetchMock.calls.some((call) => call.method === 'PATCH')).toBe(false)
  })

  it('저장이 실패하면 이유를 알린다', async () => {
    const fetchMock = inquiries()
    fetchMock.on(
      '/api/v1/admin/inquiries/9',
      jsonResponse(errorEnvelope('VALIDATION_ERROR', '요청 값을 다시 확인해 주세요.'), 400),
    )
    await screen.findByText('메뉴 문의')

    const row = screen.getByText('메뉴 문의').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '상세' }))
    await userEvent.type(await screen.findByLabelText('답변'), '답변')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('요청 값을 다시 확인해 주세요.')
  })
})
