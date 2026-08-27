import { request } from './http'
import type { MealType, MenuDetail, MenuSummary, MenuWriteRequest } from './types'

export function fetchMenus(date: string, mealType?: MealType | ''): Promise<MenuSummary[]> {
  const query = new URLSearchParams({ date })
  if (mealType) query.set('mealType', mealType)
  return request<MenuSummary[]>(`/api/v1/admin/menus?${query}`)
}

/** 편집 화면은 상세를 읽어 전체 값을 채운다. PUT이 전체 교체라서다. */
export function fetchMenu(menuId: number): Promise<MenuDetail> {
  return request<MenuDetail>(`/api/v1/menus/${menuId}`)
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
