import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenusPage } from '../features/menus/MenusPage'
import type { MenuDetail, MenuSummary } from '../api/types'
import {
  emptyResponse,
  envelope,
  errorEnvelope,
  jsonResponse,
  mockFetch,
  renderWithProviders,
} from './helpers'

const SITES = [
  { id: 3, name: '학생식당' },
  { id: 7, name: '교직원식당' },
]

const ALLERGIES = [
  { id: 1, name: '난류' },
  { id: 2, name: '우유' },
]

const MENU: MenuSummary = {
  id: 11,
  siteId: 3,
  restaurantName: '학생식당',
  serviceDate: '2026-09-15',
  mealType: 'LUNCH',
  category: 'KOREAN',
  name: '김치찌개 정식',
  items: ['김치찌개', '쌀밥'],
  caloriesKcal: 720,
  imageUrl: null,
}

const DETAIL: MenuDetail = {
  ...MENU,
  description: '매콤한 김치찌개',
  nutrition: { caloriesKcal: 720, proteinG: 25, carbohydrateG: null, fatG: null, sodiumMg: null },
  allergens: [{ id: 2, name: '우유' }],
}

function setup(menus: MenuSummary[] = [MENU]) {
  const fetchMock = mockFetch()
  fetchMock.on('/api/v1/admin/sites', jsonResponse(envelope(SITES)))
  fetchMock.on('/api/v1/allergies', jsonResponse(envelope(ALLERGIES)))
  fetchMock.on('/api/v1/admin/menus', jsonResponse(envelope(menus)))
  fetchMock.on('/api/v1/admin/menus/11', jsonResponse(envelope(DETAIL)))
  renderWithProviders(<MenusPage />)
  return fetchMock
}

describe('메뉴 목록', () => {
  it('서버가 준 메뉴를 보여 준다', async () => {
    setup()

    expect(await screen.findByText('김치찌개 정식')).toBeInTheDocument()
    expect(screen.getByText('김치찌개, 쌀밥')).toBeInTheDocument()
    expect(screen.getByText('720 kcal')).toBeInTheDocument()
  })

  it('날짜와 식사 구분으로 거른다', async () => {
    const fetchMock = setup()
    await screen.findByText('김치찌개 정식')

    await userEvent.selectOptions(screen.getByLabelText('식사 구분'), 'DINNER')

    await waitFor(() =>
      expect(
        fetchMock.calls.some((call) => call.url.includes('mealType=DINNER')),
      ).toBe(true),
    )
  })

  it('결과가 없으면 빈 상태를 알린다', async () => {
    setup([])

    expect(await screen.findByText('해당 조건의 메뉴가 없습니다.')).toBeInTheDocument()
  })
})

describe('메뉴 등록', () => {
  it('식당 이름을 선택한 급식소에서 가져온다', async () => {
    setup()
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '메뉴 등록' }))

    // 자유 입력하게 두면 SITE_NAME_MISMATCH가 난다.
    expect(await screen.findByTestId('restaurant-name')).toHaveTextContent('학생식당')
    await userEvent.selectOptions(screen.getByLabelText('급식소'), '7')
    expect(screen.getByTestId('restaurant-name')).toHaveTextContent('교직원식당')
  })

  it('입력한 값을 계약 그대로 보낸다', async () => {
    const fetchMock = setup()
    fetchMock.on('/api/v1/admin/menus', (call) =>
      call.method === 'POST' ? jsonResponse(envelope(DETAIL), 201) : jsonResponse(envelope([MENU])),
    )
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '메뉴 등록' }))

    await userEvent.type(await screen.findByLabelText('메뉴명'), '된장찌개 정식')
    await userEvent.type(screen.getByLabelText('구성 항목 1'), '된장찌개')
    await userEvent.click(screen.getByRole('checkbox', { name: '난류' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const post = fetchMock.calls.find((call) => call.method === 'POST')
      expect(post?.body).toMatchObject({
        siteId: 3,
        restaurantName: '학생식당',
        mealType: 'LUNCH',
        category: 'KOREAN',
        name: '된장찌개 정식',
        items: ['된장찌개'],
        // 라벨이 아니라 id를 보낸다.
        allergenIds: [1],
      })
    })
  })

  it('비워 둔 영양정보를 0으로 만들지 않는다', async () => {
    const fetchMock = setup()
    fetchMock.on('/api/v1/admin/menus', (call) =>
      call.method === 'POST' ? jsonResponse(envelope(DETAIL), 201) : jsonResponse(envelope([MENU])),
    )
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '메뉴 등록' }))

    await userEvent.type(await screen.findByLabelText('메뉴명'), '샐러드')
    await userEvent.type(screen.getByLabelText('열량 (kcal)'), '300')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const post = fetchMock.calls.find((call) => call.method === 'POST')
      // 모른다는 것과 0인 것은 다르다.
      expect((post?.body as { nutrition: Record<string, unknown> }).nutrition).toEqual({
        caloriesKcal: 300,
        proteinG: null,
        carbohydrateG: null,
        fatG: null,
        sodiumMg: null,
      })
    })
  })

  it('빈 구성 항목은 보내지 않는다', async () => {
    const fetchMock = setup()
    fetchMock.on('/api/v1/admin/menus', (call) =>
      call.method === 'POST' ? jsonResponse(envelope(DETAIL), 201) : jsonResponse(envelope([MENU])),
    )
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '메뉴 등록' }))

    await userEvent.type(await screen.findByLabelText('메뉴명'), '비빔밥')
    await userEvent.click(screen.getByRole('button', { name: '항목 추가' }))
    await userEvent.type(screen.getByLabelText('구성 항목 1'), '비빔밥')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const post = fetchMock.calls.find((call) => call.method === 'POST')
      expect((post?.body as { items: string[] }).items).toEqual(['비빔밥'])
    })
  })
})

describe('메뉴 수정', () => {
  it('관리자 경로로 상세를 읽는다', async () => {
    const fetchMock = setup()
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '수정' }))
    await screen.findByLabelText('메뉴명')

    // 공개 조회에 기대면 그쪽이 좁아질 때 관리 화면이 같이 망가진다.
    expect(fetchMock.calls.some((call) => call.url.includes('/api/v1/admin/menus/11'))).toBe(true)
    expect(
      fetchMock.calls.some((call) => /\/api\/v1\/menus\/11/.test(call.url)),
    ).toBe(false)
  })

  it('현재 값을 모두 채워 연다', async () => {
    setup()
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '수정' }))

    // PUT은 전체 교체다. 빠뜨린 값은 지워진다.
    expect(await screen.findByLabelText('메뉴명')).toHaveValue('김치찌개 정식')
    expect(screen.getByLabelText('구성 항목 1')).toHaveValue('김치찌개')
    expect(screen.getByLabelText('구성 항목 2')).toHaveValue('쌀밥')
    expect(screen.getByLabelText('설명')).toHaveValue('매콤한 김치찌개')
    expect(screen.getByRole('checkbox', { name: '우유' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '난류' })).not.toBeChecked()
  })

  it('수정하면 전체 값을 PUT으로 보낸다', async () => {
    const fetchMock = setup()
    fetchMock.on('/api/v1/admin/menus/11', jsonResponse(envelope(DETAIL)))
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '수정' }))
    await screen.findByLabelText('메뉴명')

    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const put = fetchMock.calls.find((call) => call.method === 'PUT')
      expect(put?.url).toContain('/api/v1/admin/menus/11')
      expect(put?.body).toMatchObject({
        items: ['김치찌개', '쌀밥'],
        allergenIds: [2],
        description: '매콤한 김치찌개',
      })
    })
  })
})

describe('메뉴 삭제', () => {
  it('확인을 거쳐 삭제한다', async () => {
    const fetchMock = setup()
    fetchMock.on('/api/v1/admin/menus/11', emptyResponse())
    await screen.findByText('김치찌개 정식')

    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() =>
      expect(fetchMock.calls.some((call) => call.method === 'DELETE')).toBe(true),
    )
  })

  it('사용 중인 메뉴는 이유를 설명한다', async () => {
    const fetchMock = setup()
    fetchMock.on(
      '/api/v1/admin/menus/11',
      jsonResponse(errorEnvelope('MENU_IN_USE', '이 메뉴를 사용한 기록이 있어 삭제할 수 없습니다.'), 409),
    )
    await screen.findByText('김치찌개 정식')

    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    // "삭제 실패"만 뜨면 관리자는 계속 다시 누른다.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '잔반 기록에서 사용 중인 메뉴는 삭제할 수 없습니다.',
    )
  })
})
