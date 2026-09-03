import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createMenu, deleteMenu, fetchMenu, fetchMenus, updateMenu } from '../../api/menus'
import { ApiError } from '../../api/http'
import type { MealType, MenuDetail, MenuSummary, MenuWriteRequest } from '../../api/types'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { MenuForm } from './MenuForm'
import { MEAL_TYPES, MEAL_TYPE_LABEL } from '../../utils/labels'
import { todayInputValue } from '../../utils/format'

type Editing = { mode: 'create' } | { mode: 'edit'; menuId: number } | null

/** Figma 목록이 한 화면에 열 줄을 둔다. 서버는 페이지를 나눠 주지 않는다. */
const PAGE_SIZE = 10

/**
 * 메뉴 상태.
 *
 * 서버에 상태 컬럼이 없다. 제공일과 오늘을 비교해서 만든다. 그래서 Figma의
 * "판매중"을 그대로 쓰지 않았다. 우리가 아는 것은 그 메뉴의 제공일이지 지금
 * 판매 중인지가 아니다. 배식 시간까지는 알 수 없으므로, 아는 만큼만 적는다.
 */
function serviceStatus(serviceDate: string, today: string) {
  if (serviceDate < today) return { label: '제공 종료', className: 'list-status-past' }
  if (serviceDate > today) return { label: '제공 예정', className: 'list-status-upcoming' }
  return { label: '오늘 제공', className: 'list-status-today' }
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (next: number) => void
}) {
  if (pageCount <= 1) return null

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)

  return (
    <nav className="pagination" aria-label="목록 페이지">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="이전 페이지">
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      {pages.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-current={value === page ? 'page' : undefined}
          aria-label={`${value} 페이지`}
        >
          {value}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === pageCount}
        aria-label="다음 페이지"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  )
}

export function MenusPage() {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInputValue())
  const [mealType, setMealType] = useState<MealType | ''>('')
  const [editing, setEditing] = useState<Editing>(null)
  const [pendingDelete, setPendingDelete] = useState<MenuSummary | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const menusKey = ['admin', 'menus', date, mealType] as const

  const menus = useQuery({
    queryKey: menusKey,
    queryFn: () => fetchMenus(date, mealType),
  })

  // 조건이 바뀌면 첫 페이지로 돌아간다. 3페이지를 보다가 결과가 한 페이지로
  // 줄면 빈 화면이 남는다.
  useEffect(() => {
    setPage(1)
  }, [date, mealType])

  // 편집은 상세를 읽어 전체 값을 채운다. PUT이 전체 교체라, 화면에 없는 값이
  // 그대로 지워지면 안 된다.
  const editingDetail = useQuery({
    queryKey: ['admin', 'menu', editing?.mode === 'edit' ? editing.menuId : null],
    queryFn: () => fetchMenu((editing as { menuId: number }).menuId),
    enabled: editing?.mode === 'edit',
  })

  function invalidateMenus() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'menus'] })
  }

  const save = useMutation({
    mutationFn: (body: MenuWriteRequest) =>
      editing?.mode === 'edit' ? updateMenu(editing.menuId, body) : createMenu(body),
    onSuccess: () => {
      setEditing(null)
      setFormError(null)
      invalidateMenus()
    },
    onError: (error) => setFormError(messageOf(error)),
  })

  const remove = useMutation({
    mutationFn: (menuId: number) => deleteMenu(menuId),
    onSuccess: () => {
      setPendingDelete(null)
      setListError(null)
      // 수정 화면에서 지웠으면 그 메뉴가 없으므로 목록으로 돌아간다.
      setEditing(null)
      invalidateMenus()
    },
    onError: (error) => {
      setPendingDelete(null)
      // 왜 못 지우는지 알려 준다. "삭제 실패"만 뜨면 관리자는 계속 다시
      // 누른다.
      setListError(
        error instanceof ApiError && error.is('MENU_IN_USE')
          ? '잔반 기록에서 사용 중인 메뉴는 삭제할 수 없습니다.'
          : messageOf(error),
      )
    },
  })

  const today = todayInputValue()
  const rows = menus.data
  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1
  const visible = useMemo(
    () => (rows ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : []),
    [rows, page],
  )

  if (editing) {
    const initial = editing.mode === 'edit' ? editingDetail.data : undefined
    const loadingDetail = editing.mode === 'edit' && editingDetail.isPending

    return (
      <>
        {loadingDetail ? (
          <p className="status status-loading" role="status">
            불러오는 중…
          </p>
        ) : (
          // 제목은 폼이 직접 그린다. Figma 등록/수정 화면은 제목을 카드 바깥
          // 맨 위에 둔다.
          <MenuForm
            key={initial?.id ?? 'new'}
            initial={initial}
            defaultDate={date}
            submitting={save.isPending}
            errorMessage={formError}
            onSubmit={(body) => save.mutate(body)}
            onCancel={() => {
              setEditing(null)
              setFormError(null)
            }}
            // 수정 화면에서만 삭제를 둔다. Figma 하단이 뒤로/삭제/수정이다.
            onDelete={initial ? () => setPendingDelete(initial) : undefined}
          />
        )}

        <ConfirmDialog
          open={pendingDelete !== null}
          title="메뉴를 삭제할까요?"
          description={pendingDelete ? `${pendingDelete.name} 을(를) 삭제합니다.` : undefined}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) remove.mutate(pendingDelete.id)
          }}
        />
      </>
    )
  }

  return (
    <section className="content-card">
      <div className="content-card-head">
        <h1 className="content-card-title">메뉴 목록</h1>

        <div className="content-card-actions">
          {/*
            Figma 목록에는 조회 조건이 없다. 그런데 서버에는 "전체 메뉴" 조회가
            없고 제공일이 필수다. 조건이 없으면 목록을 부를 수 없어 남겨 둔다.
          */}
          <label className="field field-inline">
            <span className="field-label">제공일</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>

          <label className="field field-inline">
            <span className="field-label">식사 구분</span>
            <select
              value={mealType}
              onChange={(event) => setMealType(event.target.value as MealType | '')}
            >
              <option value="">전체</option>
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MEAL_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="button-dark"
            onClick={() => {
              setFormError(null)
              setEditing({ mode: 'create' })
            }}
          >
            신규 메뉴 등록
          </button>
        </div>
      </div>

      {listError ? (
        <p className="status status-error" role="alert">
          {listError}
        </p>
      ) : null}

      <StatusBlock
        isLoading={menus.isPending}
        error={menus.error}
        data={menus.data}
        isEmpty={(list) => list.length === 0}
        emptyMessage="해당 조건의 메뉴가 없습니다."
      >
        {() => (
          <>
            <div className="list-scroll">
              <table className="list-table">
                <caption className="sr-only">
                  메뉴 목록입니다. 메뉴 상태는 제공날짜와 오늘을 비교해 표시합니다.
                </caption>
                {/*
                  Figma 컬럼 폭(86 / 378 / 119 / 257 / 179 / 257)의 비율을
                  그대로 두고, 빠진 등록일시 257을 남은 컬럼에 비례 배분했다.
                  한 컬럼에 몰아주면 그 칸만 넓게 비어 보인다.
                */}
                <colgroup>
                  <col style={{ width: '6.7%' }} />
                  <col style={{ width: '29.6%' }} />
                  <col style={{ width: '9.3%' }} />
                  <col style={{ width: '20.1%' }} />
                  <col style={{ width: '14.0%' }} />
                  <col style={{ width: '20.1%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">번호</th>
                    <th scope="col">이름</th>
                    <th scope="col">식사구분</th>
                    <th scope="col">메뉴 제공날짜</th>
                    <th scope="col">메뉴 상태</th>
                    <th scope="col">
                      <span className="sr-only">작업</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((menu: MenuSummary, index: number) => {
                    const status = serviceStatus(menu.serviceDate, today)
                    return (
                      <tr key={menu.id}>
                        <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                        <td>{menu.name}</td>
                        <td>{MEAL_TYPE_LABEL[menu.mealType]}</td>
                        <td>{menu.serviceDate}</td>
                        <td className={status.className}>{status.label}</td>
                        <td>
                          <div className="list-actions">
                            <button
                              type="button"
                              className="row-button"
                              onClick={() => {
                                setFormError(null)
                                setEditing({ mode: 'edit', menuId: menu.id })
                              }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              className="row-button row-button-outline"
                              onClick={() => setPendingDelete(menu)}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </>
        )}
      </StatusBlock>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="메뉴를 삭제할까요?"
        description={pendingDelete ? `${pendingDelete.name} 을(를) 삭제합니다.` : undefined}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id)
        }}
      />
    </section>
  )
}

export type { MenuDetail }
