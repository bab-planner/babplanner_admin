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

    // Figma 목록의 컬럼만 둔다. 구성 항목과 열량은 수정 화면에서 본다.
    expect(await screen.findByText('김치찌개 정식')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('중식')).toBeInTheDocument()
    expect(within(table).getByText('2026-09-15')).toBeInTheDocument()
    expect(within(table).queryByText('김치찌개, 쌀밥')).not.toBeInTheDocument()
    expect(within(table).queryByText('720 kcal')).not.toBeInTheDocument()
  })

  it('메뉴 상태를 제공날짜로만 만든다', async () => {
    // 서버에 상태 컬럼이 없다. 제공일과 오늘을 비교해서 만든다. Figma의
    // "판매중"은 지금 파는 중이라는 뜻이라 이 데이터로는 말할 수 없다.
    setup([{ ...MENU, id: 1, serviceDate: '2000-01-01' }])
    expect(await screen.findByText('제공 종료')).toBeInTheDocument()
    expect(screen.queryByText('판매중')).not.toBeInTheDocument()
  })

  it('앞으로 제공할 메뉴는 종료로 적지 않는다', async () => {
    setup([{ ...MENU, id: 2, serviceDate: '2999-12-31' }])
    expect(await screen.findByText('제공 예정')).toBeInTheDocument()
  })

  it('열 줄이 넘으면 페이지로 나눈다', async () => {
    // 서버가 페이지를 나눠 주지 않아 화면에서 자른다.
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...MENU,
      id: 100 + index,
      name: `메뉴 ${index + 1}`,
    }))
    setup(many)

    expect(await screen.findByText('메뉴 1')).toBeInTheDocument()
    expect(screen.getByText('메뉴 10')).toBeInTheDocument()
    expect(screen.queryByText('메뉴 11')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '2 페이지' }))

    expect(await screen.findByText('메뉴 11')).toBeInTheDocument()
    expect(screen.queryByText('메뉴 1')).not.toBeInTheDocument()
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
  it('식당 이름을 헤더에서 고른 급식소에서 가져온다', async () => {
    setup()
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '신규 메뉴 등록' }))

    // Figma 폼에는 급식소 선택이 없다. 헤더에서 고른 급식소를 쓰고 화면에는
    // 읽기 전용으로 보여 준다. 자유 입력하게 두면 SITE_NAME_MISMATCH가 난다.
    expect(await screen.findByTestId('restaurant-name')).toHaveTextContent('학생식당')
    expect(screen.queryByRole('combobox', { name: '급식소' })).not.toBeInTheDocument()
  })

  it('임시 저장 버튼을 두지 않는다', async () => {
    setup()
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '신규 메뉴 등록' }))
    await screen.findByLabelText('메뉴 이름')

    // 서버에 임시 저장 상태도 API도 없다. 버튼만 두면 눌러 놓고 저장된 줄
    // 아는 사람이 생긴다.
    expect(screen.queryByRole('button', { name: '임시 저장' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })

  it('메뉴 설명에 없는 글자 수 제한을 걸지 않는다', async () => {
    setup()
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '신규 메뉴 등록' }))

    // Figma는 "0/50"으로 상한을 적지만 서버에도 DB에도 그런 제한이 없다.
    const description = await screen.findByLabelText('메뉴 설명')
    expect(description).not.toHaveAttribute('maxLength')
  })

  it('입력한 값을 계약 그대로 보낸다', async () => {
    const fetchMock = setup()
    fetchMock.on('/api/v1/admin/menus', (call) =>
      call.method === 'POST' ? jsonResponse(envelope(DETAIL), 201) : jsonResponse(envelope([MENU])),
    )
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '신규 메뉴 등록' }))

    await userEvent.type(await screen.findByLabelText('메뉴 이름'), '된장찌개 정식')
    await userEvent.type(screen.getByLabelText('구성 항목 1'), '된장찌개')
    await userEvent.click(screen.getByRole('checkbox', { name: '난류' }))
    await userEvent.click(screen.getByRole('button', { name: /^(등록|수정)$/ }))

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
    await userEvent.click(screen.getByRole('button', { name: '신규 메뉴 등록' }))

    await userEvent.type(await screen.findByLabelText('메뉴 이름'), '샐러드')
    await userEvent.type(screen.getByLabelText('총 열량 (Kcal)'), '300')
    await userEvent.click(screen.getByRole('button', { name: /^(등록|수정)$/ }))

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
    await userEvent.click(screen.getByRole('button', { name: '신규 메뉴 등록' }))

    await userEvent.type(await screen.findByLabelText('메뉴 이름'), '비빔밥')
    await userEvent.click(screen.getByRole('button', { name: '항목 추가' }))
    await userEvent.type(screen.getByLabelText('구성 항목 1'), '비빔밥')
    await userEvent.click(screen.getByRole('button', { name: /^(등록|수정)$/ }))

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
    await screen.findByLabelText('메뉴 이름')

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
    expect(await screen.findByLabelText('메뉴 이름')).toHaveValue('김치찌개 정식')
    expect(screen.getByLabelText('구성 항목 1')).toHaveValue('김치찌개')
    expect(screen.getByLabelText('구성 항목 2')).toHaveValue('쌀밥')
    expect(screen.getByLabelText('메뉴 설명')).toHaveValue('매콤한 김치찌개')
    expect(screen.getByRole('checkbox', { name: '우유' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '난류' })).not.toBeChecked()
  })

  it('수정하면 전체 값을 PUT으로 보낸다', async () => {
    const fetchMock = setup()
    fetchMock.on('/api/v1/admin/menus/11', jsonResponse(envelope(DETAIL)))
    await screen.findByText('김치찌개 정식')
    await userEvent.click(screen.getByRole('button', { name: '수정' }))
    await screen.findByLabelText('메뉴 이름')

    await userEvent.click(screen.getByRole('button', { name: /^(등록|수정)$/ }))

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
