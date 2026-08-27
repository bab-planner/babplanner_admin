import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchInquiries, updateInquiry } from '../../api/inquiries'
import type { Inquiry, InquiryStatus } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABEL,
} from '../../utils/labels'
import { formatDateTime } from '../../utils/format'

interface InquiryPatch {
  status?: InquiryStatus
  adminAnswer?: string | null
}

function InquiryDetail({
  inquiry,
  onClose,
}: {
  inquiry: Inquiry
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<InquiryStatus>(inquiry.status)
  const [answer, setAnswer] = useState(inquiry.adminAnswer ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    setStatus(inquiry.status)
    setAnswer(inquiry.adminAnswer ?? '')
  }, [inquiry])

  const save = useMutation({
    mutationFn: (patch: InquiryPatch) => updateInquiry(inquiry.id, patch),
    onSuccess: () => {
      setError(null)
      setConfirmClear(false)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] })
    },
    onError: (caught) => {
      setConfirmClear(false)
      setError(messageOf(caught))
    },
  })

  const statusChanged = status !== inquiry.status
  const answerChanged = answer.trim() !== (inquiry.adminAnswer ?? '')
  const nothingToSave = !statusChanged && !answerChanged

  function submit() {
    // 아무것도 바뀌지 않았으면 보내지 않는다. 빈 PATCH는 서버가 422로
    // 거절한다.
    if (nothingToSave) {
      setError('변경한 내용이 없습니다.')
      return
    }

    const patch: InquiryPatch = {}
    if (statusChanged) patch.status = status
    // 답변만 바꿨으면 상태는 보내지 않는다. 답변을 썼다고 상태를 자동으로
    // ANSWERED로 바꾸지 않는다. 상태는 관리자가 명시적으로 정한다.
    if (answerChanged) patch.adminAnswer = answer.trim()
    save.mutate(patch)
  }

  return (
    <section className="detail-panel">
      <header className="detail-header">
        <h2 className="section-title">{inquiry.title}</h2>
        <button type="button" className="button" onClick={onClose}>
          닫기
        </button>
      </header>

      <dl className="detail-meta">
        <div>
          <dt>유형</dt>
          <dd>{INQUIRY_CATEGORY_LABEL[inquiry.category]}</dd>
        </div>
        <div>
          <dt>접수</dt>
          <dd>{formatDateTime(inquiry.createdAt)}</dd>
        </div>
        <div>
          <dt>답변</dt>
          <dd>{formatDateTime(inquiry.answeredAt)}</dd>
        </div>
      </dl>

      <p className="detail-content">{inquiry.content}</p>

      <label className="field">
        <span className="field-label">상태</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as InquiryStatus)}
        >
          {INQUIRY_STATUSES.map((value) => (
            <option key={value} value={value}>
              {INQUIRY_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">답변</span>
        <textarea rows={6} value={answer} onChange={(event) => setAnswer(event.target.value)} />
      </label>

      {error ? (
        <p className="status status-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-actions">
        {inquiry.adminAnswer ? (
          <button
            type="button"
            className="button button-danger"
            onClick={() => setConfirmClear(true)}
          >
            답변 삭제
          </button>
        ) : null}
        <button
          type="button"
          className="button button-primary"
          disabled={save.isPending}
          onClick={submit}
        >
          {save.isPending ? '저장 중…' : '저장'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="답변을 삭제할까요?"
        description="저장된 답변이 지워집니다. 상태는 그대로 둡니다."
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          // null을 명시해야 서버가 "지워 달라"로 읽는다. 필드를 빼면 그대로
          // 남는다. 상태는 보내지 않아 유지된다.
          save.mutate({ adminAnswer: null })
        }}
      />
    </section>
  )
}

export function InquiriesPage() {
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | ''>('')
  const [openId, setOpenId] = useState<number | null>(null)

  const inquiries = useQuery({
    queryKey: ['admin', 'inquiries', statusFilter],
    queryFn: () => fetchInquiries(statusFilter),
  })

  const open = inquiries.data?.find((inquiry) => inquiry.id === openId) ?? null

  return (
    <>
      <PageHeader title="문의/건의" />

      <div className="filters">
        <label className="field">
          <span className="field-label">상태</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as InquiryStatus | '')}
          >
            <option value="">전체</option>
            {INQUIRY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {INQUIRY_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StatusBlock
        isLoading={inquiries.isPending}
        error={inquiries.error}
        data={inquiries.data}
        isEmpty={(rows) => rows.length === 0}
        emptyMessage="해당 조건의 문의가 없습니다."
      >
        {(rows) => (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">유형</th>
                  <th scope="col">제목</th>
                  <th scope="col">상태</th>
                  <th scope="col">접수</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {/* 서버 정렬을 그대로 쓴다. */}
                {rows.map((inquiry) => (
                  <tr key={inquiry.id}>
                    <td>{INQUIRY_CATEGORY_LABEL[inquiry.category]}</td>
                    <td>{inquiry.title}</td>
                    <td>{INQUIRY_STATUS_LABEL[inquiry.status]}</td>
                    <td>{formatDateTime(inquiry.createdAt)}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={() => setOpenId(inquiry.id)}
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusBlock>

      {open ? <InquiryDetail inquiry={open} onClose={() => setOpenId(null)} /> : null}
    </>
  )
}
