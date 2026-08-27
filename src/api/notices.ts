import { request } from './http'
import type { Notice, NoticeWriteRequest } from './types'

export function fetchNotices(): Promise<Notice[]> {
  return request<Notice[]>('/api/v1/admin/notices')
}

export function createNotice(body: NoticeWriteRequest): Promise<Notice> {
  return request<Notice>('/api/v1/admin/notices', { method: 'POST', body })
}

export function updateNotice(noticeId: number, body: NoticeWriteRequest): Promise<Notice> {
  return request<Notice>(`/api/v1/admin/notices/${noticeId}`, { method: 'PUT', body })
}

export function deleteNotice(noticeId: number): Promise<void> {
  return request<void>(`/api/v1/admin/notices/${noticeId}`, { method: 'DELETE' })
}
