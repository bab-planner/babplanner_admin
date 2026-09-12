/**
 * OpenAPI 계약을 그대로 옮긴 타입.
 *
 * 서버가 null을 주는 자리는 여기서도 null이다. 화면이 0이나 빈 문자열로
 * 바꾸지 않도록, 없는 값은 타입에서부터 없는 값으로 둔다.
 */

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER'

export type MenuCategory =
  | 'KOREAN'
  | 'SNACK'
  | 'CHINESE'
  | 'JAPANESE'
  | 'WESTERN'
  | 'OTHER'

export type CongestionLevel = 'COMFORTABLE' | 'NORMAL' | 'CROWDED' | 'VERY_CROWDED'

export type InquiryStatus = 'RECEIVED' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED'

export type InquiryCategory = 'MENU' | 'ALLERGY' | 'FACILITY' | 'SERVICE' | 'OTHER'

export type SurveyQuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'SCALE'
  | 'TEXT'

export type Role = 'USER' | 'ADMIN'

export interface AdminUser {
  id: number
  name: string
  phone: string
  studentId: string
  role: Role
}

export interface AuthData {
  accessToken: string
  refreshToken: string
  user: AdminUser
}

export interface AdminSite {
  id: number
  name: string
}

export interface Congestion {
  siteId: number
  peopleCount: number | null
  level: CongestionLevel
  displayMessage: string | null
  observedAt: string
  source: string | null
}

export interface WasteSummary {
  totalSubmissions: number
  /** 표본이 없으면 null. 0으로 바꾸면 "아무도 남기지 않았다"로 읽힌다. */
  averageWasteRate: number | null
  /** 판정 기준이 정해지지 않아 항상 null이다. */
  repeatedWasteMenuCount: number | null
}

export interface MenuWaste {
  menuId: number
  menuName: string
  averageWasteRate: number
  sampleCount: number
}

export interface ProcurementItem {
  ingredientName: string
  unit: string
  plannedQuantity: number | null
  recommendedQuantity: number
  adjustmentRate: number | null
  reason: string | null
}

export interface AdminDashboard {
  /** 수요 예측 모델이 없어 현재는 항상 null이다. */
  todayPredictedPeople: number | null
  tomorrowPredictedPeople: number | null
  currentCongestion: Congestion | null
  wasteSummary: WasteSummary
  /** 발주 추천 모델이 없어 현재는 항상 빈 배열이다. */
  procurementPreview: ProcurementItem[]
}

export interface Nutrition {
  caloriesKcal: number | null
  proteinG: number | null
  carbohydrateG: number | null
  fatG: number | null
  sodiumMg: number | null
}

export interface Allergy {
  id: number
  name: string
}

export interface MenuSummary {
  id: number
  siteId: number | null
  restaurantName: string
  serviceDate: string
  mealType: MealType
  category: MenuCategory
  name: string
  items: string[] | null
  caloriesKcal: number | null
  imageUrl: string | null
}

export interface MenuDetail extends MenuSummary {
  description: string | null
  nutrition: Nutrition | null
  allergens: Allergy[] | null
}

export interface MenuWriteRequest {
  siteId: number
  restaurantName: string
  serviceDate: string
  mealType: MealType
  category: MenuCategory
  name: string
  items?: string[]
  description?: string | null
  imageUrl?: string | null
  nutrition?: Nutrition | null
  allergenIds?: number[]
}

export interface Notice {
  id: number
  title: string
  content: string
  important: boolean
  published: boolean
  publishedAt: string
}

export interface NoticeWriteRequest {
  title: string
  content: string
  important: boolean
  published: boolean
}

export interface SurveyQuestion {
  id: number
  text: string
  type: SurveyQuestionType
  required: boolean
  options: string[] | null
}

export interface Survey {
  id: number
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  questions: SurveyQuestion[]
}

export interface SurveyQuestionWriteRequest {
  text: string
  type: SurveyQuestionType
  required: boolean
  options?: string[]
}

export interface SurveyWriteRequest {
  title: string
  description?: string
  startsAt: string
  endsAt: string
  questions: SurveyQuestionWriteRequest[]
}

/**
 * 문항 유형마다 모양이 다르다. 응답에 유형이 함께 오지 않으므로 문항 정의와
 * 맞춰 읽는다.
 */
export interface ChoiceSummary {
  responseCount: number
  optionCounts: Record<string, number>
}

export interface ScaleSummary {
  responseCount: number
  /** 답이 하나도 없으면 null. 0으로 두면 "전부 최하점"으로 읽힌다. */
  average: number | null
  distribution: Record<string, number>
}

export interface TextSummary {
  responseCount: number
  responses: string[]
}

export type QuestionSummary = Partial<ChoiceSummary & ScaleSummary & TextSummary>

export interface SurveyResult {
  surveyId: number
  /** 응답한 사람 수. 답변 개수가 아니다. */
  responseCount: number
  questionResults: { questionId: number; summary: QuestionSummary }[]
}

export interface Inquiry {
  id: number
  category: InquiryCategory
  title: string
  content: string
  status: InquiryStatus
  adminAnswer: string | null
  createdAt: string
  answeredAt: string | null
}

export interface DemandPrediction {
  id: number
  siteId: number
  serviceDate: string
  mealType: MealType
  predictedPeople: number
  /** fastapi-fixture- 로 시작하면 개발용 fixture다. 예측이 아니다. */
  modelVersion: string
  createdAt: string
}

export interface DemandPredictionRequest {
  siteId: number
  serviceDate: string
  mealType: MealType
}

export interface PlannedIngredientRequest {
  ingredientName: string
  unit: string
  plannedQuantity: number
}

export interface ProcurementRunRequest {
  siteId: number
  serviceDate: string
  mealType: MealType
  plannedIngredients: PlannedIngredientRequest[]
}

/*
 * 식수 예측 (합성데이터 PoC).
 *
 * `/api/v1/admin/demand-forecasts/*` 계약. 위의 DemandPrediction(실행 이력을
 * 저장하는 기존 기능)과 다른 기능이다. 이쪽은 급식 조건을 보내 예상 이용 인원을
 * 받기만 하고, 서버가 저장하지 않는다.
 */

export interface DemandForecastRequest {
  /** 예측일(yyyy-MM-dd). 학기 중 평일만. */
  date: string
  semester: number
  semesterWeek: number
  examPeriod: boolean
  holiday: boolean
  campusEvent: boolean
  temperature: number
  rainfall: number
  humidity: number
  /** 서버 enum 이름. 한글 라벨로 보내지 않는다. */
  menuCategory: MenuCategory
  mainMenu: string
  /**
   * 합성데이터 PoC용 시뮬레이션 값(0~1). 실제 선호도 데이터가 아니다.
   * 관리자 화면에서 입력받지 않고 `demandForecastPoc.ts`가 채운다.
   */
  menuPopularity: number
  specialMenu: boolean
}

/** 예측에 쓴 과거 식수. 서버가 예측일 이전 기록에서만 만든 값이다. */
export interface DemandForecastReference {
  previousDay: number
  sameWeekdayPreviousWeek: number
  rolling7DayAverage: number
  /** 이력의 마지막 날짜(yyyy-MM-dd). */
  historyAsOf: string
}

/** 서버가 받은 조건. 요일만 서버가 날짜에서 계산한 값이다. */
export interface DemandForecastConditions {
  weekday: string | null
  semester: number
  semesterWeek: number
  examPeriod: boolean
  holiday: boolean
  campusEvent: boolean
  temperature: number
  rainfall: number
  humidity: number
  menuCategory: MenuCategory
  mainMenu: string
  menuPopularity: number
  specialMenu: boolean
}

export interface DemandForecastModel {
  name: string | null
  /** 모델 파일 해시 앞 12자리. 화면 본문에 크게 보여 주지 않는다. */
  version: string
  /** true면 합성데이터로 학습한 시범 모델이다. 화면이 반드시 알린다. */
  syntheticData: boolean
  trainedAt: string | null
}

export interface DemandForecastResponse {
  forecastDate: string
  mealType: MealType
  predictedMealCount: number
  reference: DemandForecastReference
  conditions: DemandForecastConditions
  model: DemandForecastModel
  disclaimer: string
  warnings: string[]
  /** 서버가 결과를 받은 시각(ISO-8601 UTC). */
  predictedAt: string
}

export interface DemandForecastStatus {
  available: boolean
  modelLoaded: boolean
  historyAvailable: boolean | null
  modelName: string | null
  modelVersion: string | null
  syntheticData: boolean | null
  trainingPeriod: string[]
  /** 서버 내부 사정이 담긴 문구다. 화면에 그대로 보여 주지 않는다. */
  reason: string | null
  warnings: string[]
}
