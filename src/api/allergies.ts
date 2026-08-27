import { request } from './http'
import type { Allergy } from './types'

/** 알레르기 목록. 사용자 화면과 같은 출처를 쓴다. */
export function fetchAllergies(): Promise<Allergy[]> {
  return request<Allergy[]>('/api/v1/allergies')
}
