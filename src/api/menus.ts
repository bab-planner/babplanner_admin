import { request } from './http'
import type { MealType, MenuDetail, MenuSummary, MenuWriteRequest } from './types'

export function fetchMenus(date: string, mealType?: MealType | ''): Promise<MenuSummary[]> {
  const query = new URLSearchParams({ date })
  if (mealType) query.set('mealType', mealType)
  return request<MenuSummary[]>(`/api/v1/admin/menus?${query}`)
}

/**
 * 편집 화면은 상세를 읽어 전체 값을 채운다. PUT이 전체 교체라서다.
 *
 * 관리자 경로를 쓴다. 공개 조회에 기대고 있으면 나중에 미공개 식단 같은
 * 개념이 생겨 공개 조회가 좁아지는 순간 이 화면이 같이 망가진다.
 */
export function fetchMenu(menuId: number): Promise<MenuDetail> {
  return request<MenuDetail>(`/api/v1/admin/menus/${menuId}`)
}

export function createMenu(body: MenuWriteRequest): Promise<MenuDetail> {
  return request<MenuDetail>('/api/v1/admin/menus', { method: 'POST', body })
}

export function updateMenu(menuId: number, body: MenuWriteRequest): Promise<MenuDetail> {
  return request<MenuDetail>(`/api/v1/admin/menus/${menuId}`, { method: 'PUT', body })
}

export function deleteMenu(menuId: number): Promise<void> {
  return request<void>(`/api/v1/admin/menus/${menuId}`, { method: 'DELETE' })
}
