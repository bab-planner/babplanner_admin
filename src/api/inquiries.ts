import { request } from './http'
import type { Inquiry, InquiryStatus } from './types'

export function fetchInquiries(status?: InquiryStatus | ''): Promise<Inquiry[]> {
  const query = status ? `?status=${status}` : ''
  return request<Inquiry[]>(`/api/v1/admin/inquiries${query}`)
}

export function fetchInquiry(inquiryId: number): Promise<Inquiry> {
  return request<Inquiry>(`/api/v1/admin/inquiries/${inquiryId}`)
}

/**
 * 부분 수정.
 *
 * 보낸 것만 바뀐다. 상태만 보내면 답변은 그대로고, adminAnswer에 null을
 * 명시하면 답변이 지워진다. 아무것도 보내지 않는 요청은 422이므로 화면에서
 * 미리 막는다.
 */
export function updateInquiry(
  inquiryId: number,
  patch: { status?: InquiryStatus; adminAnswer?: string | null },
): Promise<Inquiry> {
  return request<Inquiry>(`/api/v1/admin/inquiries/${inquiryId}`, {
    method: 'PATCH',
    body: patch,
  })
}
