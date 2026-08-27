import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMenu, deleteMenu, fetchMenu, fetchMenus, updateMenu } from '../../api/menus'
import { ApiError } from '../../api/http'
import type { MealType, MenuDetail, MenuSummary, MenuWriteRequest } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { MenuForm } from './MenuForm'
import { MEAL_TYPES, MEAL_TYPE_LABEL, MENU_CATEGORY_LABEL } from '../../utils/labels'
import { formatCount, todayInputValue } from '../../utils/format'

type Editing = { mode: 'create' } | { mode: 'edit'; menuId: number } | null

export function MenusPage() {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInputValue())
  const [mealType, setMealType] = useState<MealType | ''>('')
  const [editing, setEditing] = useState<Editing>(null)
  const [pendingDelete, setPendingDelete] = useState<MenuSummary | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const menusKey = ['admin', 'menus', date, mealType] as const

  const menus = useQuery({
    queryKey: menusKey,
    queryFn: () => fetchMenus(date, mealType),
  })

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

  if (editing) {
    const initial = editing.mode === 'edit' ? editingDetail.data : undefined
    const loadingDetail = editing.mode === 'edit' && editingDetail.isPending

    return (
      <>
        <PageHeader title={editing.mode === 'edit' ? '메뉴 수정' : '메뉴 등록'} />
        {loadingDetail ? (
          <p className="status status-loading" role="status">
            불러오는 중…
          </p>
        ) : (
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
          />
        )}
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="메뉴 관리"
        actions={
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setFormError(null)
              setEditing({ mode: 'create' })
            }}
          >
            메뉴 등록
          </button>
        }
      />

      <div className="filters">
        <label className="field">
          <span className="field-label">제공일</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        <label className="field">
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
        isEmpty={(rows) => rows.length === 0}
        emptyMessage="해당 조건의 메뉴가 없습니다."
      >
        {(rows) => (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">식당</th>
                  <th scope="col">식사</th>
                  <th scope="col">분류</th>
                  <th scope="col">메뉴명</th>
                  <th scope="col">구성</th>
                  <th scope="col">열량</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((menu: MenuSummary) => (
                  <tr key={menu.id}>
                    <td>{menu.restaurantName}</td>
                    <td>{MEAL_TYPE_LABEL[menu.mealType]}</td>
                    <td>{MENU_CATEGORY_LABEL[menu.category]}</td>
                    <td>{menu.name}</td>
                    <td>{menu.items?.join(', ') ?? '—'}</td>
                    <td>{formatCount(menu.caloriesKcal, ' kcal')}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          setFormError(null)
                          setEditing({ mode: 'edit', menuId: menu.id })
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="button button-danger"
                        onClick={() => setPendingDelete(menu)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </>
  )
}

export type { MenuDetail }
