import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchWasteByMenu, fetchWasteSummary } from '../../api/analytics'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock } from '../../components/StatusBlock'
import { daysAgoInputValue, formatCount, formatRate, todayInputValue, NO_VALUE } from '../../utils/format'

export function WastePage() {
  const [from, setFrom] = useState(() => daysAgoInputValue(7))
  const [to, setTo] = useState(() => todayInputValue())
  const [range, setRange] = useState<{ from: string; to: string } | null>(() => ({
    from: daysAgoInputValue(7),
    to: todayInputValue(),
  }))
  const [rangeError, setRangeError] = useState<string | null>(null)

  const summary = useQuery({
    queryKey: ['admin', 'waste', 'summary', range?.from, range?.to],
    queryFn: () => fetchWasteSummary(range!.from, range!.to),
    enabled: range !== null,
  })

  const byMenu = useQuery({
    queryKey: ['admin', 'waste', 'by-menu', range?.from, range?.to],
    queryFn: () => fetchWasteByMenu(range!.from, range!.to),
    enabled: range !== null,
  })

  function apply() {
    if (from > to) {
      setRangeError('시작일이 종료일보다 늦습니다.')
      return
    }
    setRangeError(null)
    setRange({ from, to })
  }

  return (
    <>
      <PageHeader
        title="잔반 분석"
        description="기간은 메뉴 제공일 기준이며 분석이 끝난 제출만 셉니다."
      />

      <div className="filters">
        <label className="field">
          <span className="field-label">시작일</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">종료일</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="button" className="button button-primary" onClick={apply}>
          조회
        </button>
      </div>

      {rangeError ? (
        <p className="status status-error" role="alert">
          {rangeError}
        </p>
      ) : null}

      <StatusBlock isLoading={summary.isPending} error={summary.error} data={summary.data}>
        {(data) => (
          <div className="card-grid">
            <section className="card">
              <h2 className="card-title">평균 잔반률</h2>
              <div className="card-body">
                <p className="metric-value">
                  {data.averageWasteRate === null ? NO_VALUE : formatRate(data.averageWasteRate)}
                </p>
                {data.averageWasteRate === null ? (
                  // 0%로 표시하면 아무도 남기지 않은 것처럼 보인다.
                  <p className="metric-unavailable">데이터 없음</p>
                ) : null}
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">분석된 제출</h2>
              <div className="card-body">
                <p className="metric-value">{formatCount(data.totalSubmissions, '건')}</p>
                <p className="metric-sub">기간 내 제출 전체가 아니라 잔반률이 확정된 건입니다.</p>
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">반복 잔반 메뉴</h2>
              <div className="card-body">
                {data.repeatedWasteMenuCount === null ? (
                  <p className="metric-unavailable">판정 기준 미확정</p>
                ) : (
                  <p className="metric-value">{formatCount(data.repeatedWasteMenuCount, '개')}</p>
                )}
              </div>
            </section>
          </div>
        )}
      </StatusBlock>

      <h2 className="section-title">메뉴별 잔반률</h2>
      <StatusBlock
        isLoading={byMenu.isPending}
        error={byMenu.error}
        data={byMenu.data}
        isEmpty={(rows) => rows.length === 0}
        emptyMessage="해당 기간에 분석된 제출이 없습니다."
      >
        {(rows) => (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">메뉴</th>
                  <th scope="col">평균 잔반률</th>
                  <th scope="col">표본 수</th>
                </tr>
              </thead>
              <tbody>
                {/* 서버 정렬을 그대로 쓴다. 여기서 다시 기준을 만들어 "문제
                    메뉴"로 분류하지 않는다. */}
                {rows.map((row) => (
                  <tr key={row.menuId}>
                    <td>{row.menuName}</td>
                    <td>{formatRate(row.averageWasteRate)}</td>
                    <td>{formatCount(row.sampleCount, '건')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusBlock>
    </>
  )
}
