import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveWasteSubmission,
  fetchWasteSubmissionImage,
  fetchWasteSubmissions,
  rejectWasteSubmission,
} from '../../api/wasteSubmissions'
import { ApiError } from '../../api/http'
import type { WasteSubmission, WasteSubmissionStatus } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatCount, formatDateTime } from '../../utils/format'

/** 승인하면 지급되는 포인트. 안내 문구에만 쓴다. 실제 지급은 서버가 정한다. */
const REWARD_POINTS = 100

type TabKey = WasteSubmissionStatus | 'ALL'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'PENDING', label: '대기 중' },
  { key: 'APPROVED', label: '승인' },
  { key: 'REJECTED', label: '거절' },
  { key: 'ALL', label: '전체' },
]

const STATUS_LABEL: Record<string, string> = {
  PENDING: '대기 중',
  APPROVED: '승인',
  REJECTED: '거절',
  RECEIVED: '접수',
  VERIFYING: '확인 중',
  ANALYZING: '확인 중',
  FAILED: '실패',
}

const EMPTY_MESSAGE: Record<TabKey, string> = {
  PENDING: '대기 중인 잔반 인증이 없습니다.',
  APPROVED: '승인된 잔반 인증이 없습니다.',
  REJECTED: '거절된 잔반 인증이 없습니다.',
  ALL: '잔반 인증이 없습니다.',
}

const LIST_KEY = ['admin', 'waste-submissions', 'list'] as const

interface Notice {
  kind: 'success' | 'error'
  text: string
}

/**
 * 서버 오류 문구는 화면에 흘리지 않는다. 상태 코드로 고른 안내만 보여 준다.
 */
function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return '이미 승인된 인증은 거절할 수 없습니다.'
    if (error.status === 404) return '해당 잔반 인증을 찾을 수 없습니다. 목록을 새로 불러옵니다.'
    if (error.status === 403) return '이 작업에 대한 관리자 권한이 없습니다.'
  }
  return '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'PENDING' ? 'badge-pending' : status === 'APPROVED' ? 'badge-approved' : 'badge-off'
  return <span className={`badge ${tone}`}>{STATUS_LABEL[status] ?? '확인 중'}</span>
}

/**
 * 인증 사진.
 *
 * 사진 요청은 Authorization 헤더가 필요해 <img src> 로 못 연다. Blob 으로 받아
 * object URL 을 만들고, 화면을 닫을 때 반드시 해제한다.
 */
function SubmissionImage({ id, alt }: { id: number; alt: string }) {
  const image = useQuery({
    queryKey: ['admin', 'waste-submissions', 'image', id],
    queryFn: ({ signal }) => fetchWasteSubmissionImage(id, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const [url, setUrl] = useState<string | null>(null)
  const blob = image.data

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (image.isPending) {
    return (
      <p className="status status-loading" role="status">
        사진을 불러오는 중…
      </p>
    )
  }

  if (image.error) {
    return (
      <div>
        <p className="status status-error" role="alert">
          사진을 불러오지 못했습니다.
        </p>
        <button type="button" className="button" onClick={() => void image.refetch()}>
          다시 시도
        </button>
      </div>
    )
  }

  if (!url) return null

  return <img className="waste-preview" src={url} alt={alt} />
}

type PendingAction = 'approve' | 'reject'

function SubmissionDetail({
  submission,
  onChange,
  onClose,
  onResult,
}: {
  submission: WasteSubmission
  onChange: (next: WasteSubmission) => void
  onClose: () => void
  onResult: (notice: Notice) => void
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<PendingAction | null>(null)

  const act = useMutation({
    mutationFn: (action: PendingAction) =>
      action === 'approve'
        ? approveWasteSubmission(submission.id)
        : rejectWasteSubmission(submission.id),
    onSuccess: (updated, action) => {
      setConfirming(null)
      onChange(updated)
      onResult({
        kind: 'success',
        text:
          action === 'approve'
            ? `승인했습니다. 사용자에게 ${REWARD_POINTS} 포인트가 지급됩니다.`
            : '거절했습니다. 포인트는 지급되지 않습니다.',
      })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
    onError: (caught) => {
      setConfirming(null)
      onResult({ kind: 'error', text: actionErrorMessage(caught) })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  // 승인은 끝이다. 거절된 것은 다시 승인할 수 있지만 승인된 것은 거절할 수 없다.
  const canApprove = submission.status === 'PENDING' || submission.status === 'REJECTED'
  const canReject = submission.status === 'PENDING'
  const busy = act.isPending

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="잔반 인증 상세"
      >
        <h2 className="dialog-title">잔반 인증 상세</h2>
        <p className="dialog-description">
          {submission.userName} ({submission.userPhoneMasked}) · {submission.menuName} ·{' '}
          {submission.serviceDate}
        </p>
        <p className="dialog-description">
          <StatusBadge status={submission.status} /> 제출 {formatDateTime(submission.createdAt)}
          {submission.status === 'APPROVED'
            ? ` · 지급 ${formatCount(submission.earnedPoints, ' 포인트')}`
            : ''}
        </p>

        <SubmissionImage id={submission.id} alt={`${submission.userName} 님의 잔반 사진`} />

        {submission.status === 'APPROVED' ? (
          <p className="dialog-description">승인된 인증은 되돌릴 수 없습니다.</p>
        ) : null}

        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            닫기
          </button>
          {canReject ? (
            <button
              type="button"
              className="button button-danger"
              disabled={busy}
              onClick={() => setConfirming('reject')}
            >
              거절
            </button>
          ) : null}
          {canApprove ? (
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => setConfirming('approve')}
            >
              승인
            </button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirming === 'approve'}
        title="이 잔반 인증을 승인할까요?"
        description={`승인하면 사용자에게 ${REWARD_POINTS} 포인트가 지급되고 되돌릴 수 없습니다.`}
        confirmLabel={busy ? '승인 중…' : '승인하기'}
        confirmClassName="button button-primary"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => act.mutate('approve')}
      />
      <ConfirmDialog
        open={confirming === 'reject'}
        title="이 잔반 인증을 거절할까요?"
        description="거절하면 포인트가 지급되지 않습니다."
        confirmLabel={busy ? '거절 중…' : '거절하기'}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => act.mutate('reject')}
      />
    </div>
  )
}

export function WasteSubmissionsPage() {
  const [tab, setTab] = useState<TabKey>('PENDING')
  const [selected, setSelected] = useState<WasteSubmission | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const status = tab === 'ALL' ? undefined : tab
  // 폴링은 두지 않는다. 창에 다시 돌아왔을 때와 처리 직후에만 다시 불러온다.
  const list = useQuery({
    queryKey: [...LIST_KEY, tab],
    queryFn: () => fetchWasteSubmissions(status),
  })

  return (
    <section className="content-card">
      <div className="content-card-head">
        <h1 className="content-card-title">잔반 인증 관리</h1>
      </div>
      <p className="page-description">
        사용자가 올린 잔반 사진을 관리자가 직접 확인해 승인하거나 거절합니다. 처음 승인하면{' '}
        {REWARD_POINTS} 포인트가 지급됩니다.
      </p>

      <div className="tab-list" role="tablist" aria-label="처리 상태">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`waste-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="waste-tabpanel"
            className="tab-button"
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? (
        <p
          className={notice.kind === 'success' ? 'status' : 'status status-error'}
          role={notice.kind === 'success' ? 'status' : 'alert'}
        >
          {notice.text}
        </p>
      ) : null}

      <div role="tabpanel" id="waste-tabpanel" aria-labelledby={`waste-tab-${tab}`}>
        {list.isPending ? (
          <p className="status status-loading" role="status">
            불러오는 중…
          </p>
        ) : list.error ? (
          <div>
            <p className="status status-error" role="alert">
              잔반 인증 목록을 불러오지 못했습니다.
            </p>
            <button type="button" className="button" onClick={() => void list.refetch()}>
              다시 시도
            </button>
          </div>
        ) : !list.data || list.data.length === 0 ? (
          <p className="status status-empty" role="status">
            {EMPTY_MESSAGE[tab]}
          </p>
        ) : (
          <div className="list-scroll">
            <table className="list-table">
              <thead>
                <tr>
                  <th scope="col">제출자</th>
                  <th scope="col">메뉴</th>
                  <th scope="col">제출 시각</th>
                  <th scope="col">상태</th>
                  <th scope="col">지급 포인트</th>
                  <th scope="col">
                    <span className="sr-only">작업</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.userName}
                      <br />
                      <span className="page-description">{item.userPhoneMasked}</span>
                    </td>
                    <td>
                      {item.menuName}
                      <br />
                      <span className="page-description">{item.serviceDate}</span>
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {item.status === 'APPROVED' ? formatCount(item.earnedPoints, ' P') : '—'}
                    </td>
                    <td>
                      <div className="list-actions">
                        <button
                          type="button"
                          className="row-button"
                          aria-label={`${item.userName} 사진 보기`}
                          onClick={() => {
                            setNotice(null)
                            setSelected(item)
                          }}
                        >
                          사진 보기
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <SubmissionDetail
          submission={selected}
          onChange={setSelected}
          onClose={() => setSelected(null)}
          onResult={setNotice}
        />
      ) : null}
    </section>
  )
}
