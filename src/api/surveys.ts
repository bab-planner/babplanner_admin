import { request } from './http'
import type { Survey, SurveyResult, SurveyWriteRequest } from './types'

export function fetchSurveys(): Promise<Survey[]> {
  return request<Survey[]>('/api/v1/admin/surveys')
}

export function createSurvey(body: SurveyWriteRequest): Promise<Survey> {
  return request<Survey>('/api/v1/admin/surveys', { method: 'POST', body })
}

export function fetchSurveyResult(surveyId: number): Promise<SurveyResult> {
  return request<SurveyResult>(`/api/v1/admin/surveys/${surveyId}/results`)
}
