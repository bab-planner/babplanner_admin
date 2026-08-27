import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProcurement, runProcurement } from '../../api/procurement'
import { ApiError } from '../../api/http'
import type { MealType, PlannedIngredientRequest } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { FixtureNotice } from '../../components/FixtureNotice'
import { useSites } from '../../components/SiteProvider'
import { MEAL_TYPES, MEAL_TYPE_LABEL } from '../../utils/labels'
import { formatQuantity, formatRate, todayInputValue, NO_VALUE } from '../../utils/format'

interface IngredientRow {
  ingredientName: string
  unit: string
  plannedQuantity: string
}

const EMPTY_ROW: IngredientRow = { ingredientName: '', unit: '', plannedQuantity: '' }

/** 앞뒤 공백과 대소문자를 무시했을 때 같은 줄인지. 서버와 같은 기준이다. */
function rowKey(row: IngredientRow): string {
  return `${row.ingredientName.trim().toLowerCase()} ${row.unit.trim().toLowerCase()}`
}

function validate(rows: IngredientRow[]): { error: string | null; body: PlannedIngredientRequest[] } {
  const filled = rows.filter(
    (row) => row.ingredientName.trim() !== '' || row.unit.trim() !== '' || row.plannedQuantity !== '',
  )

  if (filled.length === 0) {
    return { error: '식재료를 한 줄 이상 입력해 주세요.', body: [] }
  }

  const seen = new Set<string>()
  const body: PlannedIngredientRequest[] = []

  for (const row of filled) {
    const name = row.ingredientName.trim()
    const unit = row.unit.trim()
    const quantity = Number(row.plannedQuantity)

    if (name === '' || unit === '') {
      return { error: '식재료 이름과 단위를 모두 입력해 주세요.', body: [] }
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: '수량은 0보다 큰 숫자여야 합니다.', body: [] }
    }
    if (seen.has(rowKey(row))) {
      // 같은 재료가 두 줄이면 어느 수량으로 발주할지 알 수 없다. kg과 g을
      // 여기서 환산하지도 않는다.
      return { error: '같은 식재료와 단위가 두 번 들어 있습니다.', body: [] }
    }
    seen.add(rowKey(row))
    body.push({ ingredientName: name, unit, plannedQuantity: quantity })
  }

  return { error: null, body }
}

export function ProcurementPage() {
  const { selectedSite } = useSites()
  const queryClient = useQueryClient()

  const [date, setDate] = useState(todayInputValue())
  const [mealType, setMealType] = useState<MealType>('LUNCH')
  const [rows, setRows] = useState<IngredientRow[]>([{ ...EMPTY_ROW }])
  const [runError, setRunError] = useState<string | null>(null)
  const [needsDemand, setNeedsDemand] = useState(false)

  const siteId = selectedSite?.id

  const latest = useQuery({
    queryKey: ['admin', 'procurement', siteId, date, mealType],
    queryFn: () => fetchProcurement(siteId!, date, mealType),
    enabled: siteId !== undefined,
  })

  const run = useMutation({
    mutationFn: (plannedIngredients: PlannedIngredientRequest[]) =>
      runProcurement({ siteId: siteId!, serviceDate: date, mealType, plannedIngredients }),
    onSuccess: () => {
      setRunError(null)
      setNeedsDemand(false)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'procurement'] })
    },
    onError: (error) => {
      const requiresDemand =
        error instanceof ApiError && error.is('DEMAND_PREDICTION_REQUIRED')
      setNeedsDemand(requiresDemand)
      setRunError(
        requiresDemand
          ? '같은 식당·날짜·식사 구분의 예상 식수를 먼저 실행해야 합니다.'
          : error instanceof ApiError && error.status === 503
            ? '추천 서비스를 현재 사용할 수 없습니다.'
            : messageOf(error),
      )
    },
  })

  function submit() {
    const { error, body } = validate(rows)
    if (error) {
      setNeedsDemand(false)
      setRunError(error)
      return
    }
    setRunError(null)
    run.mutate(body)
  }

  return (
    <>
      <PageHeader
        title="발주량 추천"
        description="계획 수량을 입력하면 저장된 최신 예상 식수를 근거로 추천을 실행합니다."
      />

      <FixtureNotice>
        개발 환경에서는 조정하지 않는 fixture 추천기가 연결돼 있을 수 있습니다. 추천 수량이 계획
        수량과 같다면 최적화 결과가 아닙니다.
      </FixtureNotice>

      <div className="filters">
        <label className="field">
          <span className="field-label">제공일</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
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
      </div>

      <section>
        <h2 className="section-title">계획 식재료</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">식재료</th>
                <th scope="col">단위</th>
                <th scope="col">계획 수량</th>
                <th scope="col">작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>
                    <input
                      aria-label={`식재료 ${index + 1} 이름`}
                      value={row.ingredientName}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, position) =>
                            position === index
                              ? { ...item, ingredientName: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    {/* 수량과 단위를 나눠 받는다. "10kg" 한 칸으로 받으면
                        읽는 쪽마다 다르게 해석된다. */}
                    <input
                      aria-label={`식재료 ${index + 1} 단위`}
                      placeholder="kg"
                      value={row.unit}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, unit: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`식재료 ${index + 1} 수량`}
                      type="number"
                      step="any"
                      min="0"
                      value={row.plannedQuantity}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, position) =>
                            position === index
                              ? { ...item, plannedQuantity: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      aria-label={`식재료 ${index + 1} 삭제`}
                      onClick={() =>
                        setRows((current) =>
                          current.length === 1
                            ? [{ ...EMPTY_ROW }]
                            : current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
          >
            식재료 추가
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={siteId === undefined || run.isPending}
            onClick={submit}
          >
            {run.isPending ? '실행 중…' : '발주 추천 실행'}
          </button>
        </div>
      </section>

      {runError ? (
        <p className="status status-error" role="alert">
          {runError}
          {needsDemand ? (
            <>
              {' '}
              <Link to={`/demand?date=${date}&mealType=${mealType}`}>
                예상 식수 실행 화면으로 이동
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <h2 className="section-title">최근 추천 결과</h2>
      {siteId === undefined ? (
        <p className="status status-empty" role="status">
          급식소를 먼저 선택해 주세요.
        </p>
      ) : (
        <StatusBlock
          isLoading={latest.isPending}
          error={latest.error}
          data={latest.data}
          isEmpty={(items) => items.length === 0}
          emptyMessage="해당 조건의 추천 결과가 없습니다."
        >
          {(items) => (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">식재료</th>
                    <th scope="col">단위</th>
                    <th scope="col">계획 수량</th>
                    <th scope="col">추천 수량</th>
                    <th scope="col">조정률</th>
                    <th scope="col">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 서버가 준 값을 그대로 보여 준다. 여기서 수량을 다시
                      계산하지 않는다. */}
                  {items.map((item) => (
                    <tr key={`${item.ingredientName}-${item.unit}`}>
                      <td>{item.ingredientName}</td>
                      <td>{item.unit}</td>
                      <td>{formatQuantity(item.plannedQuantity)}</td>
                      <td>{formatQuantity(item.recommendedQuantity)}</td>
                      <td>
                        {item.adjustmentRate === null ? NO_VALUE : formatRate(item.adjustmentRate)}
                      </td>
                      <td>{item.reason ?? NO_VALUE}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StatusBlock>
      )}
    </>
  )
}
