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
  { key: 'caloriesKcal', label: '열량 (kcal)' },
  { key: 'proteinG', label: '단백질 (g)' },
  { key: 'carbohydrateG', label: '탄수화물 (g)' },
  { key: 'fatG', label: '지방 (g)' },
  { key: 'sodiumMg', label: '나트륨 (mg)' },
]

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
}

export function MenuForm({
  initial,
  defaultDate,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: MenuFormProps) {
  const { sites, selectedSite } = useSites()
  const allergies = useQuery({
    queryKey: ['allergies'],
    queryFn: fetchAllergies,
    staleTime: 10 * 60 * 1000,
  })

  const [siteId, setSiteId] = useState<number | ''>(
    initial?.siteId ?? selectedSite?.id ?? sites[0]?.id ?? '',
  )
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
   * 식당 이름은 고른 식당에서 그대로 가져온다.
   *
   * 자유 입력하게 두면 서버가 SITE_NAME_MISMATCH(422)로 거절한다. 관리자가
   * 오타 하나로 저장을 못 하는 화면을 만들 이유가 없다.
   */
  const restaurantName = sites.find((site) => site.id === siteId)?.name ?? ''

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
    <form className="menu-form" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          <span className="field-label">급식소</span>
          <select
            value={siteId}
            onChange={(event) => setSiteId(Number(event.target.value))}
            required
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>

        <p className="field field-readonly">
          <span className="field-label">식당명</span>
          <span data-testid="restaurant-name">{restaurantName || '—'}</span>
        </p>
      </div>

      <div className="form-row">
        <label className="field">
          <span className="field-label">제공일</span>
          <input
            type="date"
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">식사 구분</span>
          <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
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
        <span className="field-label">메뉴명</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

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
              className="button"
              aria-label={`구성 항목 ${index + 1} 삭제`}
              onClick={() =>
                setItems((current) =>
                  current.length === 1 ? [''] : current.filter((_, position) => position !== index),
                )
              }
            >
              삭제
            </button>
          </div>
        ))}
        <button type="button" className="button" onClick={() => setItems((current) => [...current, ''])}>
          항목 추가
        </button>
      </fieldset>

      <label className="field">
        <span className="field-label">설명</span>
        <textarea
          value={description}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">이미지 주소</span>
        <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
      </label>

      <fieldset className="field">
        <legend className="field-label">영양정보 (비워 두면 저장하지 않습니다)</legend>
        <div className="form-row">
          {NUTRITION_FIELDS.map(({ key, label }) => (
            <label className="field" key={key}>
              <span className="field-label">{label}</span>
              <input
                type="number"
                step="any"
                value={nutrition[key]}
                onChange={(event) =>
                  setNutrition((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">알레르기 성분</legend>
        {allergies.isPending ? <p role="status">알레르기 목록 불러오는 중…</p> : null}
        {allergies.error ? <p role="alert">알레르기 목록을 불러오지 못했습니다.</p> : null}
        <div className="checkbox-grid">
          {(allergies.data ?? []).map((allergy) => (
            <label key={allergy.id} className="checkbox">
              <input
                type="checkbox"
                checked={allergenIds.includes(allergy.id)}
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
          ))}
        </div>
      </fieldset>

      {errorMessage ? (
        <p className="status status-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? '저장 중…' : '저장'}
        </button>
      </div>
    </form>
  )
}
