import type {
  CongestionLevel,
  InquiryCategory,
  InquiryStatus,
  MealType,
  MenuCategory,
  SurveyQuestionType,
} from '../api/types'

/**
 * 화면에 보일 한국어.
 *
 * 요청과 저장에는 항상 원래 enum을 쓴다. 여기 있는 것은 표시용 이름뿐이다.
 * 라벨을 값으로 보내기 시작하면 서버가 모르는 문자열이 올라간다.
 */

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  BREAKFAST: '조식',
  LUNCH: '중식',
  DINNER: '석식',
}

export const MENU_CATEGORY_LABEL: Record<MenuCategory, string> = {
  KOREAN: '한식',
  SNACK: '분식',
  CHINESE: '중식',
  JAPANESE: '일식',
  WESTERN: '양식',
  OTHER: '기타',
}

export const CONGESTION_LEVEL_LABEL: Record<CongestionLevel, string> = {
  COMFORTABLE: '여유',
  NORMAL: '보통',
  CROWDED: '혼잡',
  VERY_CROWDED: '매우 혼잡',
}

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  RECEIVED: '접수됨',
  IN_PROGRESS: '처리 중',
  ANSWERED: '답변 완료',
  CLOSED: '종료',
}

export const INQUIRY_CATEGORY_LABEL: Record<InquiryCategory, string> = {
  MENU: '메뉴',
  ALLERGY: '알레르기',
  FACILITY: '시설',
  SERVICE: '서비스',
  OTHER: '기타',
}

export const QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  SINGLE_CHOICE: '단일 선택',
  MULTIPLE_CHOICE: '복수 선택',
  SCALE: '척도',
  TEXT: '주관식',
}

export const MEAL_TYPES: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER']

export const MENU_CATEGORIES: MenuCategory[] = [
  'KOREAN',
  'SNACK',
  'CHINESE',
  'JAPANESE',
  'WESTERN',
  'OTHER',
]

export const INQUIRY_STATUSES: InquiryStatus[] = [
  'RECEIVED',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
]

export const QUESTION_TYPES: SurveyQuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'SCALE',
  'TEXT',
]
