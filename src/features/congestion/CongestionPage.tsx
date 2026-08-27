import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchCongestionTimeseries } from '../../api/analytics'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock } from '../../components/StatusBlock'
import { useSites } from '../../components/SiteProvider'
import { CONGESTION_LEVEL_LABEL } from '../../utils/labels'
import {
  formatCount,
  formatDateTime,
  formatTime,
  hoursAgoLocalInput,
  localInputToIso,
  nowLocalInput,
} from '../../utils/format'

export function CongestionPage() {
  const { selectedSite } = useSites()
  const [from, setFrom] = useState(() => hoursAgoLocalInput(24))
  const [to, setTo] = useState(() => nowLocalInput())
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const siteId = selectedSite?.id

  const query = useQuery({
    queryKey: ['admin', 'congestion', siteId, range?.from, range?.to],
    queryFn: () => fetchCongestionTimeseries(siteId!, range!.from, range!.to),
    enabled: siteId !== undefined && range !== null,
  })

  function apply() {
    if (!from || !to) {
      setRangeError('조회 기간을 모두 입력해 주세요.')
      return
    }
    if (new Date(from).getTime() > new Date(to).getTime()) {
      // 서버도 422로 막지만, 여기서 먼저 알려 주면 왕복 한 번을 아낀다.
      setRangeError('시작 시각이 종료 시각보다 늦습니다.')
      return
    }
    setRangeError(null)
    // 브라우저 지역 시각을 시간대가 붙은 값으로 바꿔 보낸다.
    setRange({ from: localInputToIso(from), to: localInputToIso(to) })
  }

  return (
    <>
      <PageHeader
        title="혼잡도 분석"
        description="저장된 관측을 그대로 보여 줍니다. 구간 평균이나 보간값을 만들지 않습니다."
      />

      <div className="filters">
        <label className="field">
          <span className="field-label">시작</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">종료</span>
          <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
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

      {siteId === undefined ? (
        <p className="status status-empty" role="status">
          급식소를 먼저 선택해 주세요.
        </p>
      ) : range === null ? (
        <p className="status status-empty" role="status">
          조회 기간을 선택한 뒤 조회를 눌러 주세요.
        </p>
      ) : (
        <StatusBlock
          isLoading={query.isPending}
          error={query.error}
          data={query.data}
          isEmpty={(rows) => rows.length === 0}
          emptyMessage="해당 기간에 관측이 없습니다."
        >
          {(rows) => (
            <>
              <section className="chart-card">
                <h2 className="card-title">시간대별 인원</h2>
                <div className="chart-area">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={rows.map((row) => ({
                        observedAt: row.observedAt,
                        label: formatTime(row.observedAt),
                        // 인원이 없는 관측은 빈 점으로 둔다. 0으로 그리면
                        // 아무도 없었던 것처럼 보인다.
                        peopleCount: row.peopleCount,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Line
                        type="linear"
                        dataKey="peopleCount"
                        name="인원"
                        stroke="#89171A"
                        connectNulls={false}
                        dot
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">관측 시각</th>
                      <th scope="col">인원</th>
                      <th scope="col">단계</th>
                      <th scope="col">안내 문구</th>
                      <th scope="col">출처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.observedAt}-${row.siteId}-${row.peopleCount ?? 'na'}`}>
                        <td>{formatDateTime(row.observedAt)}</td>
                        <td>{formatCount(row.peopleCount, '명')}</td>
                        <td>{CONGESTION_LEVEL_LABEL[row.level]}</td>
                        <td>{row.displayMessage ?? '—'}</td>
                        <td>{row.source ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </StatusBlock>
      )}
    </>
  )
}
