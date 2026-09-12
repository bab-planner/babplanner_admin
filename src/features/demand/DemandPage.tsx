import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchDemandPredictions, runDemandPrediction } from '../../api/demand'
import { ApiError } from '../../api/http'
import type { MealType } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { FixtureBadge } from '../../components/FixtureNotice'
import { useSites } from '../../components/SiteProvider'
import { MEAL_TYPES, MEAL_TYPE_LABEL } from '../../utils/labels'
import { formatCount, formatDateTime, isFixtureModel, todayInputValue } from '../../utils/format'

/**
 * 발주 기준 인원.
 *
 * 발주 추천이 참고하는 끼니별 인원 예측을 실행하고, 실행할 때마다 이력으로 남긴다.
 * 발주 추천은 같은 식당·날짜·끼니의 이 값이 있어야 실행된다(서버 409).
 *
 * 대시보드의 "중식 예상 인원"(식수 예측 PoC)과는 다른 기능이다. 저 카드는 급식
 * 조건을 넣어 예상 인원을 보기만 하고 저장하지 않는다. 이 화면은 발주용으로 저장한다.
 * 같은 이름을 쓰면 관리자가 두 숫자를 같은 것으로 읽으므로 이름을 나눴다. 이 화면은
 * 사이드바에 없고 발주 추천 화면에서만 들어온다.
 */
export function DemandPage() {
  const { selectedSite } = useSites()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()

  // 발주 화면에서 "발주 기준 인원 실행 화면으로 이동"으로 넘어오면 조건이 채워져 있다.
  const [date, setDate] = useState(params.get('date') ?? todayInputValue())
  const [mealType, setMealType] = useState<MealType>(
    (params.get('mealType') as MealType | null) ?? 'LUNCH',
  )
  const [runError, setRunError] = useState<string | null>(null)

  const siteId = selectedSite?.id

  const history = useQuery({
    queryKey: ['admin', 'demand', siteId, date, mealType],
    queryFn: () => fetchDemandPredictions(siteId!, date, mealType),
    enabled: siteId !== undefined,
  })

  const run = useMutation({
    mutationFn: () => runDemandPrediction({ siteId: siteId!, serviceDate: date, mealType }),
    onSuccess: () => {
      setRunError(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'demand'] })
    },
    onError: (error) => {
      // 실행이 실패했으면 지난 결과를 새 예측인 것처럼 보여 주지 않는다.
      setRunError(
        error instanceof ApiError && error.status === 503
          ? '예측 서비스를 현재 사용할 수 없습니다.'
          : messageOf(error),
      )
    },
  })

  return (
    <>
      <PageHeader
        title="발주 기준 인원"
        description="발주 추천이 참고하는 끼니별 인원 예측입니다. 실행할 때마다 이력이 남습니다. 대시보드의 식수 예측(시범)과는 별개입니다."
      />

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

        <button
          type="button"
          className="button button-primary"
          disabled={siteId === undefined || run.isPending}
          onClick={() => run.mutate()}
        >
          {run.isPending ? '실행 중…' : '발주 기준 인원 실행'}
        </button>
      </div>

      {runError ? (
        <p className="status status-error" role="alert">
          {runError}
        </p>
      ) : null}

      {siteId === undefined ? (
        <p className="status status-empty" role="status">
          급식소를 먼저 선택해 주세요.
        </p>
      ) : (
        <StatusBlock
          isLoading={history.isPending}
          error={history.error}
          data={history.data}
          isEmpty={(rows) => rows.length === 0}
          emptyMessage="해당 조건의 실행 이력이 없습니다."
        >
          {(rows) => (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">제공일</th>
                    <th scope="col">식사</th>
                    <th scope="col">예상 인원</th>
                    <th scope="col">모델</th>
                    <th scope="col">실행 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.serviceDate}</td>
                      <td>{MEAL_TYPE_LABEL[row.mealType]}</td>
                      <td>{formatCount(row.predictedPeople, '명')}</td>
                      <td>
                        <span className="model-version">{row.modelVersion}</span>
                        {/* fixture가 낸 값은 입력을 보지 않은 고정값이다.
                            표시 없이 두면 관리자가 예측으로 읽는다. */}
                        {isFixtureModel(row.modelVersion) ? <FixtureBadge /> : null}
                      </td>
                      <td>{formatDateTime(row.createdAt)}</td>
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
