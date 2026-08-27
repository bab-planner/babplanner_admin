import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../../api/dashboard'
import type { AdminDashboard } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock } from '../../components/StatusBlock'
import { useSites } from '../../components/SiteProvider'
import { CONGESTION_LEVEL_LABEL } from '../../utils/labels'
import { formatCount, formatDateTime, formatRate, NO_VALUE } from '../../utils/format'

/**
 * 대시보드.
 *
 * 서버가 준 것만 보여 준다. 값이 없는 자리는 비어 있다고 말하고, 0이나 예시
 * 숫자로 메우지 않는다. 관리자는 여기 뜬 숫자로 식수를 잡고 발주를 넣기
 * 때문에, 근거 없는 숫자 하나가 그대로 주문이 된다.
 */
function Card({
  title,
  children,
  footer,
}: {
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <div className="card-body">{children}</div>
      {footer ? <div className="card-footer">{footer}</div> : null}
    </section>
  )
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return <p className="metric-unavailable">{children}</p>
}

function CongestionCard({ dashboard }: { dashboard: AdminDashboard }) {
  const congestion = dashboard.currentCongestion

  if (!congestion) {
    // 임의로 "보통"을 띄우지 않는다. 관측이 없다는 것과 여유롭다는 것은
    // 다른 말이다.
    return (
      <Card title="현재 혼잡도">
        <Unavailable>혼잡도 데이터 없음</Unavailable>
      </Card>
    )
  }

  return (
    <Card
      title="현재 혼잡도"
      footer={<span className="card-note">관측 시각 {formatDateTime(congestion.observedAt)}</span>}
    >
      <p className="metric-value">{CONGESTION_LEVEL_LABEL[congestion.level]}</p>
      <p className="metric-sub">
        인원 {formatCount(congestion.peopleCount, '명')}
        {congestion.displayMessage ? ` · ${congestion.displayMessage}` : ''}
      </p>
    </Card>
  )
}

function WasteCard({ dashboard }: { dashboard: AdminDashboard }) {
  const waste = dashboard.wasteSummary

  return (
    <Card
      title="오늘 잔반"
      footer={<Link to="/analytics/waste">잔반 분석 보기</Link>}
    >
      <p className="metric-value">
        {waste.averageWasteRate === null ? NO_VALUE : formatRate(waste.averageWasteRate)}
      </p>
      {waste.averageWasteRate === null ? (
        // 0%로 표시하면 "아무도 남기지 않았다"로 읽힌다.
        <Unavailable>데이터 없음</Unavailable>
      ) : null}
      <p className="metric-sub">분석된 제출 {formatCount(waste.totalSubmissions, '건')}</p>
      <p className="metric-sub">
        반복 잔반 메뉴{' '}
        {waste.repeatedWasteMenuCount === null
          ? '판정 기준 미확정'
          : formatCount(waste.repeatedWasteMenuCount, '개')}
      </p>
    </Card>
  )
}

function PredictionCard({ dashboard }: { dashboard: AdminDashboard }) {
  const { todayPredictedPeople, tomorrowPredictedPeople } = dashboard
  const unavailable = todayPredictedPeople === null && tomorrowPredictedPeople === null

  return (
    <Card title="예상 식수" footer={<Link to="/demand">식사별 예상 식수 보기</Link>}>
      <dl className="metric-pair">
        <div>
          <dt>오늘</dt>
          <dd>{todayPredictedPeople === null ? NO_VALUE : formatCount(todayPredictedPeople, '명')}</dd>
        </div>
        <div>
          <dt>내일</dt>
          <dd>
            {tomorrowPredictedPeople === null ? NO_VALUE : formatCount(tomorrowPredictedPeople, '명')}
          </dd>
        </div>
      </dl>
      {unavailable ? (
        <Unavailable>
          예측 데이터 없음 — 대시보드가 어느 식사를 대표할지 정해지지 않아 식사별 화면에서
          확인합니다.
        </Unavailable>
      ) : null}
    </Card>
  )
}

function ProcurementCard({ dashboard }: { dashboard: AdminDashboard }) {
  const preview = dashboard.procurementPreview

  return (
    <Card title="발주량 추천" footer={<Link to="/procurement">발주 추천 보기</Link>}>
      {preview.length === 0 ? (
        // 0kg 추천처럼 보이게 하지 않는다.
        <Unavailable>추천 데이터 없음</Unavailable>
      ) : (
        <ul className="preview-list">
          {preview.map((item) => (
            <li key={`${item.ingredientName}-${item.unit}`}>
              {item.ingredientName} {item.recommendedQuantity} {item.unit}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function DashboardPage() {
  const { selectedSite } = useSites()
  const siteId = selectedSite?.id

  const query = useQuery({
    queryKey: ['admin', 'dashboard', siteId],
    queryFn: () => fetchDashboard(siteId!),
    enabled: siteId !== undefined,
  })

  return (
    <>
      <PageHeader
        title="대시보드"
        description={selectedSite ? `${selectedSite.name} 기준입니다.` : undefined}
      />

      {siteId === undefined ? (
        <p className="status status-empty" role="status">
          급식소를 먼저 선택해 주세요.
        </p>
      ) : (
        <StatusBlock isLoading={query.isPending} error={query.error} data={query.data}>
          {(dashboard) => (
            <div className="card-grid">
              <CongestionCard dashboard={dashboard} />
              <WasteCard dashboard={dashboard} />
              <PredictionCard dashboard={dashboard} />
              <ProcurementCard dashboard={dashboard} />
            </div>
          )}
        </StatusBlock>
      )}
    </>
  )
}
