import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchCongestionTimeseries, fetchWasteByMenu } from '../../api/analytics'
import { fetchCurrentCongestion } from '../../api/congestion'
import { fetchDashboard } from '../../api/dashboard'
import { fetchMenus } from '../../api/menus'
import { fetchSurveyResult, fetchSurveys } from '../../api/surveys'
import type { AdminDashboard, Congestion, Survey, SurveyResult } from '../../api/types'
import { StatusBlock } from '../../components/StatusBlock'
import { useSites } from '../../components/SiteProvider'
import { DemandForecastPanel } from '../demandForecast/DemandForecastPanel'
import { CONGESTION_LEVEL_LABEL } from '../../utils/labels'
import {
  NO_VALUE,
  daysAgoInputValue,
  formatCount,
  formatDateTime,
  formatQuantity,
  formatRate,
  formatTime,
  hoursAgoLocalInput,
  nowLocalInput,
  todayInputValue,
} from '../../utils/format'

/**
 * 대시보드.
 *
 * 맨 위는 두 AI 기능이다. 왼쪽이 **중식 예상 인원**(식수 예측, 운영 계획과 발주
 * 참고), 오른쪽이 **현재 식당 혼잡도**(CCTV, 지금 이용 상황). 목적이 다른 두 결과라
 * 카드를 나누고 하나로 합치지 않는다.
 *
 * 그 아래는 Figma 관리자 웹 대시보드(147:4525)를 따른다. KPI 행, 분석 블록이 32px
 * 간격으로 쌓인다.
 *
 * 식수 예측은 맨 위 카드 하나뿐이다. 예전에 있던 "예상 식수" 패널(저장된 끼니별 실행
 * 이력과 대시보드 API의 오늘/내일 값)은 뺐다. 끼니별 실행은 발주 추천의 선행 조건이라
 * "발주 기준 인원" 화면(/demand)에 남아 있다.
 *
 * 서버가 준 것만 보여 준다. 값이 없는 자리는 비어 있다고 말하고, 0이나 예시
 * 숫자로 메우지 않는다. 관리자는 여기 뜬 숫자로 식수를 잡고 발주를 넣기
 * 때문에, 근거 없는 숫자 하나가 그대로 주문이 된다.
 *
 * Figma에 있으나 여기에 없는 것:
 *
 * - 앱 이용자 수, 리워드 지급 수, 만족도 조사 참여자 KPI: 서버에 그 값을 주는
 *   API가 없다.
 * - 시간대별 잔반률: 잔반 집계에 시간대 축이 없다. 대신 같은 자리에 혼잡도
 *   추이를 둔다. 사이드바에서 뺀 분석 화면을 흡수하기로 한 자리다.
 * - 요일별 실제 이용 인원: 실적을 주는 API가 없다.
 */

/**
 * 막대 최대 두께.
 *
 * 항목이 한둘뿐이면 recharts가 막대를 카테고리 폭 전체로 늘린다. 그러면
 * 차트가 아니라 색칠된 판처럼 보인다. Figma 막대 두께에 맞춰 상한을 둔다.
 */
const MAX_BAR = 48

/** 잔반률 막대 색. 값이 높을수록 눈에 띄게 한다. 경계는 표시용이다. */
function wasteBarColor(rate: number): string {
  if (rate >= 0.4) return '#ff4925'
  if (rate >= 0.2) return '#ffb020'
  return '#0cb900'
}

function Panel({
  title,
  note,
  actions,
  children,
}: {
  title: string
  note?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          {note ? <p className="panel-note">{note}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/**
 * 차트 아래 값 라벨.
 *
 * Figma는 막대 밑에 항목 이름과 값을 함께 적는다. 그림만 두면 정확한 값을
 * 읽을 수 없고, 화면 낭독기로도 막대는 읽히지 않는다.
 *
 * 왼쪽 여백은 차트 Y축 폭과 맞춘다.
 */
function ChartLabels({ items }: { items: { key: string | number; name: string; value: string }[] }) {
  return (
    <ul className="chart-labels" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item) => (
        <li key={item.key}>
          <span className="chart-label-name">{item.name}</span>
          <span className="chart-label-value">{item.value}</span>
        </li>
      ))}
    </ul>
  )
}

function KpiCard({
  title,
  caption,
  value,
  note,
  empty,
}: {
  title: string
  /** 이 카드가 무엇을 위한 값인지. 제목만으로 목적이 헷갈릴 때만 쓴다. */
  caption?: string
  value: string
  note?: string
  empty?: boolean
}) {
  return (
    <section className="kpi-card">
      <h2 className="kpi-title">{title}</h2>
      {caption ? <p className="kpi-caption">{caption}</p> : null}
      <p className={empty ? 'kpi-value is-empty' : 'kpi-value'}>{value}</p>
      {note ? <p className="kpi-note">{note}</p> : null}
    </section>
  )
}

/**
 * 현재 혼잡도만 짧은 주기로 다시 읽는다.
 *
 * CCTV 수집기가 서버에 관측을 계속 넣는 동안 이 값만 따라 움직이면 된다.
 * 대시보드 전체(잔반·예측·발주)를 같은 주기로 다시 부르면 바뀌지도 않는 값
 * 때문에 요청이 몇 배로 늘어난다. 그래서 폴링은 이 조회 하나에만 건다.
 */
const CURRENT_CONGESTION_REFETCH_MS = 5_000

function useCurrentCongestion(
  siteId: number | undefined,
  fallback: Congestion | null,
): Congestion | null {
  const query = useQuery({
    queryKey: ['congestion', 'current', siteId],
    queryFn: () => fetchCurrentCongestion(siteId!),
    enabled: siteId !== undefined,
    refetchInterval: CURRENT_CONGESTION_REFETCH_MS,
    // 폴링이 목적이므로 기본 staleTime(30초)을 이 조회에만 해제한다.
    staleTime: 0,
    // 관측이 아직 없으면 서버가 404를 준다. 그것은 오류가 아니라 "없음"이고,
    // 아래에서 fallback(null)로 그대로 표시한다.
    retry: false,
  })
  return query.data ?? fallback
}

/**
 * 현재 식당 혼잡도. 식수 예측 카드 옆에 두지만 별개의 결과다.
 *
 * 예측은 선택한 날짜의 계획이고, 이것은 지금 이 순간의 관측이다.
 */
function CongestionCard({ dashboard, siteId }: { dashboard: AdminDashboard; siteId: number }) {
  const congestion = useCurrentCongestion(siteId, dashboard.currentCongestion)

  return (
    <KpiCard
      title="현재 식당 혼잡도"
      caption="지금 이용 상황 · CCTV 관측"
      // 임의로 "보통"을 띄우지 않는다. 관측이 없다는 것과 여유롭다는 것은
      // 다른 말이다.
      value={congestion ? CONGESTION_LEVEL_LABEL[congestion.level] : '혼잡도 데이터 없음'}
      empty={!congestion}
      note={
        congestion
          ? `현재 인원 ${formatCount(congestion.peopleCount, '명')} · 관측 ${formatDateTime(congestion.observedAt)}`
          : undefined
      }
    />
  )
}

function KpiRow({ dashboard }: { dashboard: AdminDashboard }) {
  const waste = dashboard.wasteSummary
  const today = todayInputValue()

  const menus = useQuery({
    queryKey: ['admin', 'menus', today],
    queryFn: () => fetchMenus(today),
  })

  return (
    <div className="kpi-row">
      <KpiCard
        title="오늘의 평균 잔반률"
        value={waste.averageWasteRate === null ? '데이터 없음' : formatRate(waste.averageWasteRate)}
        // 0%로 표시하면 "아무도 남기지 않았다"로 읽힌다.
        empty={waste.averageWasteRate === null}
        note={`분석된 제출 ${formatCount(waste.totalSubmissions, '건')}`}
      />

      <KpiCard
        title="메뉴 등록 상태"
        value={
          menus.isPending || menus.error
            ? NO_VALUE
            : (menus.data?.length ?? 0) > 0
              ? '등록 완료'
              : '미등록'
        }
        empty={menus.isPending || Boolean(menus.error)}
        note={
          menus.data ? `오늘 ${formatCount(menus.data.length, '건')}` : '오늘 식단을 확인하는 중'
        }
      />
    </div>
  )
}

/** 메뉴 별 잔반률. 서버 정렬을 그대로 쓴다. */
function WasteByMenuPanel() {
  const from = daysAgoInputValue(7)
  const to = todayInputValue()

  const query = useQuery({
    queryKey: ['admin', 'waste', 'by-menu', from, to],
    queryFn: () => fetchWasteByMenu(from, to),
  })

  return (
    <Panel title="메뉴 별 잔반률" note="최근 7일 · 분석이 끝난 제출만">
      <StatusBlock
        isLoading={query.isPending}
        error={query.error}
        data={query.data}
        isEmpty={(rows) => rows.length === 0}
        emptyMessage="해당 기간에 분석된 제출이 없습니다."
      >
        {(rows) => (
          <>
          <ResponsiveContainer width="100%" height={332}>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="menuName" tick={false} height={0} />
              <YAxis tickFormatter={(value: number) => formatRate(value, 0)} width={56} />
              <Tooltip formatter={(value: number) => formatRate(value)} />
              <Bar dataKey="averageWasteRate" name="평균 잔반률" maxBarSize={MAX_BAR} radius={[4, 4, 0, 0]}>
                {rows.map((row) => (
                  <Cell key={row.menuId} fill={wasteBarColor(row.averageWasteRate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ChartLabels
            items={rows.map((row) => ({
              key: row.menuId,
              name: row.menuName,
              value: `평균 ${formatRate(row.averageWasteRate)}`,
            }))}
          />
          </>
        )}
      </StatusBlock>
    </Panel>
  )
}

/**
 * 혼잡도 추이.
 *
 * Figma에서 이 자리는 "시간대 별 잔반률"이지만 잔반 집계에 시간대 축이 없다.
 * 사이드바에서 뺀 혼잡도 분석을 여기로 옮겨 왔다.
 */
function CongestionTrendPanel({ siteId }: { siteId: number }) {
  const from = hoursAgoLocalInput(24)
  const to = nowLocalInput()

  const query = useQuery({
    queryKey: ['admin', 'congestion', 'trend', siteId, from, to],
    queryFn: () => fetchCongestionTimeseries(siteId, new Date(from).toISOString(), new Date(to).toISOString()),
  })

  return (
    <Panel title="혼잡도 추이" note="최근 24시간 · 서버에 저장된 관측만">
      <StatusBlock
        isLoading={query.isPending}
        error={query.error}
        data={query.data}
        isEmpty={(rows) => rows.length === 0}
        emptyMessage="해당 구간에 저장된 관측이 없습니다."
      >
        {(rows) => (
          <ResponsiveContainer width="100%" height={332}>
            <LineChart
              data={rows.map((row) => ({
                label: formatTime(row.observedAt),
                // 인원이 없는 관측은 빈 점으로 둔다. 0으로 그리면 아무도
                // 없었던 것처럼 보인다.
                peopleCount: row.peopleCount,
              }))}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} width={56} />
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
        )}
      </StatusBlock>
    </Panel>
  )
}

/** 메뉴 별 추천 발주량. 대시보드가 함께 내려준 미리보기를 쓴다. */
function ProcurementPanel({ dashboard }: { dashboard: AdminDashboard }) {
  const preview = dashboard.procurementPreview

  return (
    <Panel
      title="메뉴 별 추천 발주량"
      note="가장 최근 실행 결과입니다."
      actions={
        <div className="panel-actions">
          <Link to="/procurement">발주 실행</Link>
        </div>
      }
    >
      {preview.length === 0 ? (
        // 0kg 추천처럼 보이게 하지 않는다.
        <p className="status status-empty" role="status">
          추천 데이터 없음
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={332}>
            <BarChart data={preview} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ingredientName" tick={false} height={0} />
              <YAxis width={56} />
              <Tooltip
                formatter={(value: number, _name, item) =>
                  formatQuantity(value, item?.payload?.unit as string | undefined)
                }
              />
              <Bar
                dataKey="recommendedQuantity"
                name="추천 발주량"
                fill="#ff4925"
                maxBarSize={MAX_BAR}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <ChartLabels
            items={preview.map((item) => ({
              key: `${item.ingredientName}-${item.unit}`,
              name: item.ingredientName,
              value: formatQuantity(item.recommendedQuantity, item.unit),
            }))}
          />
        </>
      )}
    </Panel>
  )
}

function ScaleBreakdown({ result, survey }: { result: SurveyResult; survey: Survey }) {
  const scale = survey.questions.find((question) => question.type === 'SCALE')
  const summary = scale
    ? result.questionResults.find((item) => item.questionId === scale.id)?.summary
    : undefined
  const distribution = summary?.distribution

  if (!scale || !distribution) {
    return (
      <p className="status status-empty" role="status">
        척도 문항이 없습니다.
      </p>
    )
  }

  const rows = Object.entries(distribution).map(([score, count]) => ({
    label: scale.options?.[Number(score) - 1] ?? `${score}점`,
    count,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} />
        <YAxis allowDecimals={false} width={56} />
        <Tooltip />
        <Bar dataKey="count" name="응답 수" fill="#89171a" maxBarSize={MAX_BAR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChoiceBreakdown({ result, survey }: { result: SurveyResult; survey: Survey }) {
  const choice = survey.questions.find(
    (question) => question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE',
  )
  const summary = choice
    ? result.questionResults.find((item) => item.questionId === choice.id)?.summary
    : undefined
  const counts = summary?.optionCounts

  if (!choice || !counts) {
    return (
      <p className="status status-empty" role="status">
        선택형 문항이 없습니다.
      </p>
    )
  }

  const rows = Object.entries(counts).map(([label, count]) => ({ label, count }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} height={48} />
        <YAxis allowDecimals={false} width={56} />
        <Tooltip />
        <Bar dataKey="count" name="응답 수" fill="#1073f4" maxBarSize={MAX_BAR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * 만족도 분석.
 *
 * 서버는 설문 단위로만 결과를 준다. 가장 최근 설문 하나를 읽는다. 여러 설문을
 * 합산하지 않는다. 문항이 서로 다르면 합쳐도 뜻이 없다.
 */
function SurveyPanels() {
  const surveys = useQuery({ queryKey: ['admin', 'surveys'], queryFn: fetchSurveys })
  const survey = surveys.data?.[0]

  const result = useQuery({
    queryKey: ['admin', 'survey-result', survey?.id],
    queryFn: () => fetchSurveyResult(survey!.id),
    enabled: survey !== undefined,
  })

  if (surveys.isPending || surveys.error || !survey) {
    return (
      <Panel title="만족도 분석">
        <StatusBlock
          isLoading={surveys.isPending}
          error={surveys.error}
          data={surveys.data}
          isEmpty={(rows) => rows.length === 0}
          emptyMessage="등록된 설문이 없습니다."
        >
          {() => null}
        </StatusBlock>
      </Panel>
    )
  }

  const note = `${survey.title} · 응답 ${formatCount(result.data?.responseCount, '명')}`

  return (
    <div className="dash-row">
      <Panel title="종합 식사 만족도" note={note}>
        <StatusBlock isLoading={result.isPending} error={result.error} data={result.data}>
          {(data) => <ScaleBreakdown result={data} survey={survey} />}
        </StatusBlock>
      </Panel>

      <Panel title="메뉴 별 만족도" note={note}>
        <StatusBlock isLoading={result.isPending} error={result.error} data={result.data}>
          {(data) => <ChoiceBreakdown result={data} survey={survey} />}
        </StatusBlock>
      </Panel>
    </div>
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

  if (siteId === undefined) {
    return (
      <p className="status status-empty" role="status">
        급식소를 먼저 선택해 주세요.
      </p>
    )
  }

  return (
    <StatusBlock isLoading={query.isPending} error={query.error} data={query.data}>
      {(dashboard) => (
        <div className="dash">
          {/*
            Figma 대시보드에는 보이는 페이지 제목이 없다. 그래도 문서에 제목이
            하나도 없으면 화면 낭독기가 어느 화면인지 알릴 방법이 없다.
          */}
          <h1 className="sr-only">대시보드</h1>

          {/*
            두 AI 기능. 식수 예측(선택한 날짜의 계획)과 현재 혼잡도(지금 이용 상황)는
            목적이 달라 카드를 나눈다. 한 결과처럼 합치지 않는다.
          */}
          <div className="dash-top">
            <DemandForecastPanel />
            <CongestionCard dashboard={dashboard} siteId={siteId} />
          </div>

          <KpiRow dashboard={dashboard} />

          <div className="dash-row">
            <WasteByMenuPanel />
            <CongestionTrendPanel siteId={siteId} />
          </div>

          <ProcurementPanel dashboard={dashboard} />
          <SurveyPanels />
        </div>
      )}
    </StatusBlock>
  )
}
