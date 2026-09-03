import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAllergies } from '../../api/allergies'
import type {
  MealType,
  MenuCategory,
  MenuDetail,
  MenuWriteRequest,
  Nutrition,
} from '../../api/types'
import { useSites } from '../../components/SiteProvider'
import { MEAL_TYPES, MEAL_TYPE_LABEL, MENU_CATEGORIES, MENU_CATEGORY_LABEL } from '../../utils/labels'

/**
 * 메뉴 등록·수정 폼.
 *
 * 화면 구성은 Figma 관리자 웹(147:6471 등록 / 147:7297 수정)을 따른다.
 * 입력 카드와 사진 카드가 나란히 오고, 그 아래 영양 정보와 알레르기 정보가
 * 온다. 버튼은 오른쪽 끝에 붙는다.
 *
 * Figma와 다르게 둔 것과 그 이유:
 *
 * - 제공날짜를 기간이 아니라 하루로 받는다. 서버의 serviceDate가 날짜 하나다.
 *   기간을 받아 봐야 보낼 곳이 없다.
 * - "임시 저장" 버튼을 두지 않았다. 임시 저장 상태도 API도 없다. 버튼만
 *   만들어 두면 눌러 놓고 저장된 줄 아는 사람이 생긴다.
 * - 사진은 파일 업로드가 아니라 주소 입력이다. 서버에 이미지 업로드 경로가
 *   없고 imageUrl 문자열만 받는다.
 * - 메뉴 설명에 50자 제한을 걸지 않았다. 서버에도 DB에도 그런 제한이 없다.
 *   화면에서만 막으면 이미 저장된 긴 설명을 수정할 때 저장이 막힌다.
 *
 * Figma에 없지만 남긴 것:
 *
 * - 분류(category): 서버가 필수로 받고, 사용자 앱 홈이 이 값으로 한식·분식을
 *   나눈다. 빼면 전부 한식으로 저장된다.
 * - 구성 항목(items): 사용자 앱 식단 목록이 이 값을 보여 준다.
 * - 급식소: 고를 수는 없고 어느 급식소인지만 보여 준다. 값은 헤더에서 고른
 *   급식소이고, 수정할 때는 그 메뉴가 속한 급식소다.
 */

/** 영양정보 입력. 비워 두면 null로 보낸다. 0으로 바꾸지 않는다. */
type NutritionInput = Record<keyof Nutrition, string>

const EMPTY_NUTRITION: NutritionInput = {
  caloriesKcal: '',
  proteinG: '',
  carbohydrateG: '',
  fatG: '',
  sodiumMg: '',
}

const NUTRITION_FIELDS: { key: keyof Nutrition; label: string }[] = [
  { key: 'caloriesKcal', label: '총 열량 (Kcal)' },
  { key: 'proteinG', label: '단백질 (g)' },
  { key: 'carbohydrateG', label: '탄수화물 (g)' },
  { key: 'fatG', label: '지방 (g)' },
  { key: 'sodiumMg', label: '나트륨 (mg)' },
]

/** 서버의 menus.name 이 varchar(100)이다. 넘겨 보내면 저장에서 잘린다. */
const NAME_MAX_LENGTH = 100

function toNutritionInput(nutrition: Nutrition | null | undefined): NutritionInput {
  if (!nutrition) return { ...EMPTY_NUTRITION }
  return {
    caloriesKcal: nutrition.caloriesKcal?.toString() ?? '',
    proteinG: nutrition.proteinG?.toString() ?? '',
    carbohydrateG: nutrition.carbohydrateG?.toString() ?? '',
    fatG: nutrition.fatG?.toString() ?? '',
    sodiumMg: nutrition.sodiumMg?.toString() ?? '',
  }
}

/**
 * 빈 칸은 null이다.
 *
 * 0으로 채우면 "열량 0kcal인 메뉴"가 저장된다. 모른다는 것과 0인 것은 다르다.
 */
function toNutrition(input: NutritionInput): Nutrition | null {
  const parse = (value: string): number | null => {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const nutrition: Nutrition = {
    caloriesKcal: parse(input.caloriesKcal),
    proteinG: parse(input.proteinG),
    carbohydrateG: parse(input.carbohydrateG),
    fatG: parse(input.fatG),
    sodiumMg: parse(input.sodiumMg),
  }

  const allEmpty = Object.values(nutrition).every((value) => value === null)
  return allEmpty ? null : nutrition
}

interface MenuFormProps {
  /** 편집이면 상세를 그대로 채운다. PUT이 전체 교체라 빠뜨리면 지워진다. */
  initial?: MenuDetail
  defaultDate: string
  submitting: boolean
  errorMessage: string | null
  onSubmit: (body: MenuWriteRequest) => void
  onCancel: () => void
  /** 수정 화면에서만 온다. Figma 수정 화면 하단이 뒤로/삭제/수정이다. */
  onDelete?: () => void
}

export function MenuForm({
  initial,
  defaultDate,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
  onDelete,
}: MenuFormProps) {
  const { sites, selectedSite } = useSites()
  const allergies = useQuery({
    queryKey: ['allergies'],
    queryFn: fetchAllergies,
    staleTime: 10 * 60 * 1000,
  })

  const siteId = initial?.siteId ?? selectedSite?.id ?? sites[0]?.id ?? ''
  const [serviceDate, setServiceDate] = useState(initial?.serviceDate ?? defaultDate)
  const [mealType, setMealType] = useState<MealType>(initial?.mealType ?? 'LUNCH')
  const [category, setCategory] = useState<MenuCategory>(initial?.category ?? 'KOREAN')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '')
  const [items, setItems] = useState<string[]>(
    initial?.items && initial.items.length > 0 ? [...initial.items] : [''],
  )
  const [nutrition, setNutrition] = useState<NutritionInput>(toNutritionInput(initial?.nutrition))
  const [allergenIds, setAllergenIds] = useState<number[]>(
    initial?.allergens?.map((allergy) => allergy.id) ?? [],
  )

  /**
   * 식당 이름은 급식소에서 그대로 가져온다.
   *
   * 자유 입력하게 두면 서버가 SITE_NAME_MISMATCH(422)로 거절한다. 관리자가
   * 오타 하나로 저장을 못 하는 화면을 만들 이유가 없다.
   */
  const restaurantName = sites.find((site) => site.id === siteId)?.name ?? initial?.restaurantName ?? ''

  function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting || siteId === '') return

    onSubmit({
      siteId,
      restaurantName,
      serviceDate,
      mealType,
      category,
      name: name.trim(),
      items: items.map((item) => item.trim()).filter((item) => item !== ''),
      description: description.trim() === '' ? null : description.trim(),
      imageUrl: imageUrl.trim() === '' ? null : imageUrl.trim(),
      nutrition: toNutrition(nutrition),
      allergenIds,
    })
  }

  return (
    <form className="figma-form" onSubmit={submit}>
      <h1 className="form-page-title">{initial ? '메뉴 수정' : '신규 메뉴 등록'}</h1>

      <div className="form-grid">
        <div className="form-split">
          <section className="content-card">
            <h2 className="form-section-title">메뉴 정보</h2>

            <div className="form-fields">
              <div className="form-cols" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <label className="field">
                  <span className="field-label">메뉴 제공날짜</span>
                  {/* 서버가 날짜 하나만 받는다. Figma의 기간 선택은 보낼 곳이 없다. */}
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                    required
                  />
                </label>

                <label className="field">
                  <span className="field-label">식사 구분</span>
                  <select
                    value={mealType}
                    onChange={(event) => setMealType(event.target.value as MealType)}
                  >
                    {MEAL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {MEAL_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field-label">분류</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as MenuCategory)}
                  >
                    {MENU_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {MENU_CATEGORY_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span className="field-label">메뉴 이름</span>
                <input
                  value={name}
                  maxLength={NAME_MAX_LENGTH}
                  placeholder="판매할 메뉴 이름 입력"
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>

              <div className="field">
                <div className="field-head">
                  <label className="field-label" htmlFor="menu-description">
                    메뉴 설명
                  </label>
                  {/*
                    Figma는 "0/50"으로 상한을 적지만 서버에도 DB에도 50자 제한이
                    없다. 없는 제한을 화면에만 만들지 않는다. 길이만 알린다.
                  */}
                  <span className="field-count">{description.length}자</span>
                </div>
                <textarea
                  id="menu-description"
                  value={description}
                  rows={2}
                  placeholder="메뉴 설명 입력"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              <fieldset className="field">
                <legend className="field-label">구성 항목</legend>
                {items.map((item, index) => (
                  <div className="item-row" key={index}>
                    <input
                      aria-label={`구성 항목 ${index + 1}`}
                      value={item}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((value, position) =>
                            position === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="button-quiet"
                      aria-label={`구성 항목 ${index + 1} 삭제`}
                      onClick={() =>
                        setItems((current) =>
                          current.length === 1
                            ? ['']
                            : current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button-quiet"
                  onClick={() => setItems((current) => [...current, ''])}
                >
                  항목 추가
                </button>
              </fieldset>

              <p className="field">
                <span className="field-label">급식소</span>
                <span className="field-readonly-value" data-testid="restaurant-name">
                  {restaurantName || '—'}
                </span>
              </p>
            </div>
          </section>

          <section className="content-card">
            <h2 className="form-section-title">메뉴 사진</h2>

            <div className="form-fields">
              <div className="image-drop">
                {imageUrl.trim() === '' ? (
                  <span>등록된 사진 없음</span>
                ) : (
                  <img src={imageUrl} alt="" />
                )}
              </div>

              <label className="field">
                <span className="field-label">사진 주소</span>
                {/*
                  Figma는 클릭해서 파일을 올리는 자리다. 서버에 이미지 업로드
                  경로가 없고 imageUrl 문자열만 받는다. 파일 선택창을 만들어
                  두면 고른 파일이 어디로도 가지 않는다.
                */}
                <input
                  type="url"
                  value={imageUrl}
                  placeholder="https://"
                  onChange={(event) => setImageUrl(event.target.value)}
                />
              </label>
            </div>
          </section>
        </div>

        <section className="content-card">
          <h2 className="form-section-title">영양 정보</h2>
          <div className="form-cols" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {NUTRITION_FIELDS.map(({ key, label }) => (
              <label className="field" key={key}>
                <span className="field-label">{label}</span>
                <input
                  type="number"
                  step="any"
                  placeholder="숫자만 입력"
                  value={nutrition[key]}
                  onChange={(event) =>
                    setNutrition((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section className="content-card">
          <h2 className="form-section-title">알레르기 정보</h2>
          {allergies.isPending ? <p role="status">알레르기 목록 불러오는 중…</p> : null}
          {allergies.error ? <p role="alert">알레르기 목록을 불러오지 못했습니다.</p> : null}
          <div className="allergy-grid">
            {(allergies.data ?? []).map((allergy) => {
              const on = allergenIds.includes(allergy.id)
              return (
                <label key={allergy.id} className={on ? 'allergy-item is-on' : 'allergy-item'}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) =>
                      setAllergenIds((current) =>
                        event.target.checked
                          ? [...current, allergy.id]
                          : current.filter((id) => id !== allergy.id),
                      )
                    }
                  />
                  <span>{allergy.name}</span>
                </label>
              )
            })}
          </div>
        </section>
      </div>

      {errorMessage ? (
        <p className="status status-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {/*
        Figma는 등록 화면에 "뒤로 / 임시 저장 / 등록", 수정 화면에
        "뒤로 / 삭제 / 수정"을 둔다. 임시 저장은 서버에 상태도 API도 없어
        두지 않았다.
      */}
      <div className="form-actions-row">
        <button type="button" className="button-quiet" onClick={onCancel}>
          뒤로
        </button>
        {onDelete ? (
          <button type="button" className="button-outline-danger" onClick={onDelete}>
            삭제
          </button>
        ) : null}
        <button type="submit" className="button-dark" disabled={submitting}>
          {submitting ? '저장 중…' : initial ? '수정' : '등록'}
        </button>
      </div>
    </form>
  )
}
