import { request, requestBlob } from './http'
import type { WasteSubmission, WasteSubmissionStatus } from './types'

export const WASTE_SUBMISSION_LIMIT = 50

export function fetchWasteSubmissions(
  status?: WasteSubmissionStatus,
): Promise<WasteSubmission[]> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('limit', String(WASTE_SUBMISSION_LIMIT))
  return request<WasteSubmission[]>(`/api/v1/admin/waste-submissions?${params.toString()}`)
}

/** 인증 헤더가 필요해 <img src> 로 못 쓴다. Blob 으로 받아 화면이 URL 을 만든다. */
export function fetchWasteSubmissionImage(id: number, signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/api/v1/admin/waste-submissions/${id}/image`, { signal })
}

/** 처음 승인하면 사용자에게 포인트가 지급된다. 이미 승인된 것은 그대로 200. */
export function approveWasteSubmission(id: number): Promise<WasteSubmission> {
  return request<WasteSubmission>(`/api/v1/admin/waste-submissions/${id}/approve`, {
    method: 'POST',
  })
}

/** 승인된 것은 거절할 수 없다. 서버가 409 로 막는다. */
export function rejectWasteSubmission(id: number): Promise<WasteSubmission> {
  return request<WasteSubmission>(`/api/v1/admin/waste-submissions/${id}/reject`, {
    method: 'POST',
  })
}
